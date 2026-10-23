/**
 * Automatic attendance from Zoho participant reports. Called only from the cron route.
 * Idempotent: a class is claimed with a lease, processed once, and marked processed; the
 * attendance table's (class_id, student_id) key prevents duplicates. Never marks everyone absent
 * because of missing data — an empty or failed report is retried, then sent for review.
 */
import { calculateAttendance, type Session } from "@/features/attendance/services/attendance-policy";
import { getParticipants } from "@backend/server/meetings/zoho-meeting.server";
import { ZohoError, sanitizeZohoError, zohoBackoffMinutes } from "@/features/meetings/services/zoho-policy";
import { groupParticipants, classWindowMs } from "@/features/attendance/services/attendance-matching";

type Db = { from: (t: string) => any };
export const MAX_ATTEMPTS = 6;
const GRACE_MS = 10 * 60_000; // Zoho needs a few minutes after the meeting ends to finalise the report.
const LEASE_MS = 15 * 60_000;

export interface ProcessSummary { checked: number; processed: number; retried: number; review: number; notConfigured: boolean }

export async function processDueAttendance(db: Db, limit = 5, now = Date.now()): Promise<ProcessSummary> {
  const summary: ProcessSummary = { checked: 0, processed: 0, retried: 0, review: 0, notConfigured: false };
  const today = new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
  const { data: rows } = await db.from("classes")
    .select("id, title, batch_id, trainer_id, class_date, start_time, end_time, status, zoho_meeting_key, attendance_status, attendance_attempts, attendance_next_attempt_at, started_at")
    .in("class_type", ["online", "hybrid"]).not("zoho_meeting_key", "is", null).neq("status", "cancelled").not("started_at", "is", null)
    .in("attendance_status", ["pending", "processing"]).lte("class_date", today).order("class_date").limit(50);
  const due = (rows ?? []).filter((c: any) => {
    const { end } = classWindowMs(c.class_date, c.start_time, c.end_time);
    // A class ended early by its tutor/admin is already "processing" and doesn't wait for the scheduled end.
    if (!c.started_at) return false; // never started: attendance doesn't apply, retries included
    const ended = c.status === "processing" || c.status === "completed" || end + GRACE_MS <= now;
    return ended && (!c.attendance_next_attempt_at || Date.parse(c.attendance_next_attempt_at) <= now);
  }).slice(0, limit);

  for (const c of due) {
    summary.checked++;
    // Claim with a lease; a crashed run is picked up again once the lease passes.
    const lease = new Date(now + LEASE_MS).toISOString();
    const { data: claimed } = await db.from("classes").update({ attendance_status: "processing", attendance_next_attempt_at: lease })
      .eq("id", c.id).eq("attendance_status", c.attendance_status).select("id").maybeSingle();
    if (!claimed) continue;
    await audit(db, "attendance_processing_started", c.id, { attempt: c.attendance_attempts + 1 });
    try {
      const participants = await getParticipants(c.zoho_meeting_key);
      // An empty report is retried; only after the last attempt is it treated as "nobody joined",
      // so every enrolled student is then recorded absent rather than the class staying stuck.
      if (participants.length === 0 && c.attendance_attempts + 1 < MAX_ATTEMPTS) throw new ZohoError("transient", "Zoho returned no participants yet");
      await saveAttendance(db, c, participants);
      summary.processed++;
      // Recordings are looked up by the class lifecycle step with its own retry schedule.
    } catch (e) {
      if (e instanceof ZohoError && e.kind === "not_configured") {
        summary.notConfigured = true;
        await db.from("classes").update({ attendance_status: "pending", attendance_next_attempt_at: new Date(now + 60 * 60_000).toISOString(), attendance_last_error: "Zoho Meeting is not configured" }).eq("id", c.id);
        break;
      }
      const attempts = c.attendance_attempts + 1;
      const permanent = e instanceof ZohoError && (e.kind === "auth" || e.kind === "scope" || e.kind === "permanent" || e.kind === "not_found");
      const reason = sanitizeZohoError(e instanceof Error ? e.message : "Unknown error");
      const review = permanent || attempts >= MAX_ATTEMPTS;
      await db.from("classes").update({
        attendance_status: review ? "needs_review" : "pending", attendance_attempts: attempts, attendance_last_error: reason,
        attendance_next_attempt_at: review ? null : new Date(now + zohoBackoffMinutes(attempts) * 60_000).toISOString(),
      }).eq("id", c.id);
      await audit(db, "attendance_processing_failed", c.id, { attempt: attempts, reason, needs_review: review });
      if (review) { summary.review++; await notifyAdmins(db, c, reason); } else summary.retried++;
    }
  }
  return summary;
}

async function saveAttendance(db: Db, c: any, participants: Awaited<ReturnType<typeof getParticipants>>) {
  const { start, end } = classWindowMs(c.class_date, c.start_time, c.end_time);
  const { data: enrolled, error } = await db.from("enrollments").select("student_id, students!inner(id, profiles!inner(email, account_status))")
    .eq("batch_id", c.batch_id).eq("status", "active");
  if (error) throw new Error("Could not read enrolments");
  const students = (enrolled ?? []).map((e: any) => ({ id: e.student_id as string, email: String(e.students.profiles.email ?? "").toLowerCase() }));
  const { byEmail, unmatched } = groupParticipants(participants, new Set(students.map((s: { email: string }) => s.email)));
  const { data: existing } = await db.from("attendance").select("id, student_id, overridden_by").eq("class_id", c.id);
  const overridden = new Set((existing ?? []).filter((a: any) => a.overridden_by).map((a: any) => a.student_id));
  const markedAt = new Date().toISOString();
  const counts = { present: 0, late: 0, absent: 0, kept_override: 0 };
  const rows = students.flatMap((s: { id: string; email: string }) => {
    if (overridden.has(s.id)) { counts.kept_override++; return []; }
    const sessions: Session[] = byEmail.get(s.email) ?? [];
    const r = calculateAttendance(sessions, start, end);
    counts[r.status]++;
    return [{
      class_id: c.id, student_id: s.id, status: r.status, source: "automatic", marked_by: null, marked_at: markedAt,
      joined_at: r.firstJoinMs ? new Date(r.firstJoinMs).toISOString() : null, left_at: r.lastLeaveMs ? new Date(r.lastLeaveMs).toISOString() : null,
      duration_seconds: Math.round(r.attendedMs / 1000), attendance_percent: r.percent, original_status: r.status,
      sessions: sessions.map((x) => ({ join: new Date(x.joinMs).toISOString(), leave: new Date(x.leaveMs).toISOString() })),
      remarks: null,
    }];
  });
  if (rows.length) {
    const { error: upErr } = await db.from("attendance").upsert(rows, { onConflict: "class_id,student_id" });
    if (upErr) throw new Error("Could not save attendance");
  }
  await db.from("classes").update({
    attendance_status: unmatched.length ? "needs_review" : "processed", attendance_processed_at: markedAt, attendance_next_attempt_at: null, attendance_last_error: null,
  }).eq("id", c.id);
  await audit(db, "attendance_processed", c.id, { ...counts, unmatched, no_participants: participants.length === 0 });
  const { data: t } = await db.from("trainers").select("profile_id").eq("id", c.trainer_id).maybeSingle();
  const body = `${c.title}: ${counts.present} present, ${counts.late} late, ${counts.absent} absent${unmatched.length ? `, ${unmatched.length} participant(s) couldn't be matched to a student` : ""}.`;
  if (t?.profile_id) await db.from("notifications").upsert({ recipient_id: t.profile_id, category: "attendance", title: "Attendance processed", body, link: "/trainer/classes", event_key: `attendance.processed:${c.id}` }, { onConflict: "recipient_id,event_key", ignoreDuplicates: true });
}

async function notifyAdmins(db: Db, c: any, reason: string) {
  const { data: admins } = await db.from("profiles").select("id").eq("role", "admin").eq("account_status", "active");
  const rows = (admins ?? []).map((a: any) => ({ recipient_id: a.id, category: "attendance", title: "Attendance needs review", body: `${c.title} (${c.class_date}): automatic attendance couldn't be completed — ${reason}`, link: "/admin/classes", event_key: `attendance.review:${c.id}` }));
  if (rows.length) await db.from("notifications").upsert(rows, { onConflict: "recipient_id,event_key", ignoreDuplicates: true });
}

const audit = (db: Db, action: string, id: string, after: Record<string, unknown>) =>
  db.from("audit_events").insert({ actor_id: null, action, entity_type: "class", entity_id: id, after_data: after });
