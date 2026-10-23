/**
 * Automatic class lifecycle, run only from the existing cron route. Every step is a conditional
 * update (`.eq("status", old)` / due-time filters), so repeated or overlapping runs are no-ops.
 */
import { classWindowMs } from "@/features/attendance/services/attendance-matching";
import { ZohoError, sanitizeZohoError } from "@/features/meetings/services/zoho-policy";
import { nextRecordingCheckMs, nextTimedStatus } from "@/features/classes/services/class-lifecycle-policy";

type Db = { from: (t: string) => any };
const istDate = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);

export interface LifecycleSummary { recordingsAvailable: number; recordingsUnavailable: number; recordingsRetried: number; completed: number; notConfigured: boolean }

export async function runClassLifecycle(db: Db, now = Date.now()): Promise<LifecycleSummary> {
  const s: LifecycleSummary = { recordingsAvailable: 0, recordingsUnavailable: 0, recordingsRetried: 0, completed: 0, notConfigured: false };
  await advanceTimed(db, now, s);
  await checkRecordings(db, now, s);
  return s;
}

/** Completes every class whose scheduled end has passed (started or not). Safe to call from page loads too. */
export async function advanceTimed(db: Db, now: number, s: Pick<LifecycleSummary, "completed">) {
  const { data } = await db.from("classes").select("id, status, class_date, start_time, end_time, zoho_meeting_key, recording_status, started_at")
    .in("status", ["scheduled", "live", "processing"]).lte("class_date", istDate(now)).limit(500);
  for (const c of data ?? []) {
    const { end } = classWindowMs(c.class_date, c.start_time, c.end_time);
    if (nextTimedStatus(c.status, 0, end, now) !== "completed") continue;
    const patch = completionPatch(c, end);
    const { data: done } = await db.from("classes").update(patch).eq("id", c.id).eq("status", c.status).select("id");
    if (!done?.length) continue;
    s.completed++;
    await audit(db, "class_completed", c.id, { from: c.status, started: !!c.started_at, reason: c.status === "live" ? "scheduled_end" : c.status === "scheduled" ? "not_started_by_end" : "legacy_processing" });
  }
}

/**
 * Workflow fields set when a class completes at its scheduled end. Only a class with a persisted
 * start event (`started_at`) becomes eligible for attendance and recording processing.
 */
export function completionPatch(c: { status: string; zoho_meeting_key: string | null; recording_status: string; started_at: string | null }, endMs: number): Record<string, unknown> {
  if (!c.started_at) return { status: "completed", ...NOT_APPLICABLE };
  const patch: Record<string, unknown> = { status: "completed", ended_at: new Date(endMs).toISOString() };
  if (c.zoho_meeting_key && c.recording_status === "not_applicable")
    Object.assign(patch, { recording_status: "pending", recording_attempts: 0, recording_next_attempt_at: new Date(endMs).toISOString() });
  return patch;
}

export const NOT_APPLICABLE = { attendance_status: "not_applicable", attendance_next_attempt_at: null, recording_status: "not_applicable", recording_next_attempt_at: null } as const;

async function checkRecordings(db: Db, now: number, s: LifecycleSummary) {
  const { data } = await db.from("classes").select("id, title, batch_id, class_date, start_time, end_time, zoho_meeting_key, recording_attempts")
    .eq("recording_status", "pending").not("zoho_meeting_key", "is", null).not("started_at", "is", null).lte("recording_next_attempt_at", new Date(now).toISOString()).limit(5);
  const { linkClassRecordings } = await import("@backend/server/meetings/recording-linker.server");
  for (const c of data ?? []) {
    const { end } = classWindowMs(c.class_date, c.start_time, c.end_time);
    const attempts = c.recording_attempts + 1;
    let ready = false; let reason: string | null = null;
    try {
      const r = await linkClassRecordings(db, c, null);
      const { count } = await db.from("recordings").select("id", { count: "exact", head: true }).eq("class_id", c.id).eq("source_type", "zoho");
      ready = (count ?? 0) > 0 && r.generating === 0;
      if (!ready) reason = r.generating ? "Recording is still being generated" : "No recording found yet";
    } catch (e) {
      if (e instanceof ZohoError && e.kind === "not_configured") { s.notConfigured = true; return; }
      reason = sanitizeZohoError(e instanceof Error ? e.message : "Unknown error");
    }
    const nextAt = ready ? null : nextRecordingCheckMs(end, attempts);
    const status = ready ? "available" : nextAt === null ? "unavailable" : "pending";
    const { data: upd } = await db.from("classes").update({
      recording_status: status, recording_attempts: attempts, recording_checked_at: new Date(now).toISOString(),
      recording_next_attempt_at: nextAt === null ? null : new Date(Math.max(nextAt, now + 60_000)).toISOString(),
    }).eq("id", c.id).eq("recording_status", "pending").eq("recording_attempts", c.recording_attempts).select("id");
    if (!upd?.length) continue;
    if (status === "available") { s.recordingsAvailable++; await notifyRecording(db, c); }
    else if (status === "unavailable") { s.recordingsUnavailable++; await audit(db, "recording_unavailable", c.id, { attempts, reason }); }
    else s.recordingsRetried++;
  }
}

/** One notice per student per class (unique recipient_id + event_key). */
async function notifyRecording(db: Db, c: { id: string; title: string; batch_id: string }) {
  const { data } = await db.from("enrollments").select("students!inner(profile_id, profiles!inner(account_status))").eq("batch_id", c.batch_id).eq("status", "active");
  const rows = (data ?? []).filter((e: any) => e.students.profiles.account_status === "active").map((e: any) => ({
    recipient_id: e.students.profile_id, category: "class", title: "Recording available", body: `The recording of ${c.title} is ready to watch.`,
    link: "/student/recordings", event_key: `recording.available:${c.id}`,
  }));
  if (rows.length) await db.from("notifications").upsert(rows, { onConflict: "recipient_id,event_key", ignoreDuplicates: true });
}

const audit = (db: Db, action: string, id: string, after: Record<string, unknown>) =>
  db.from("audit_events").insert({ actor_id: null, action, entity_type: "class", entity_id: id, after_data: after });
