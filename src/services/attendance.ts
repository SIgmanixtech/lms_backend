import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { AttendanceReview, RecordingLinkResult, RetryAttendanceResult, UrlResult } from "@/lib/api/contracts";
import { API_ROUTES } from "@/lib/api/contracts";
import { ZohoError } from "@/features/meetings/services/zoho-policy";
import type { AuthContext } from "@backend/lib/supabase/auth";
import { supabaseAdmin } from "@backend/lib/supabase/admin";
import { linkClassRecordings } from "@backend/server/meetings/recording-linker.server";
import { fetchRecordingFile, getRecordingsForMeeting } from "@backend/server/meetings/zoho-meeting.server";
import { signRecordingTicket } from "@backend/server/meetings/recording-stream-token.server";
import { assertCanEdit, caller, type Db } from "./classes";

export const overrideSchema = z.object({
  class_id: z.string().uuid(), student_id: z.string().uuid(),
  status: z.enum(["present", "absent", "late", "excused"]),
  reason: z.string().trim().min(3, "Give a reason (at least 3 characters).").max(500),
});

const admin = () => supabaseAdmin as unknown as Db;
const rls = (auth: AuthContext) => auth.supabase as unknown as Db;

/**
 * Overrides automatic attendance. Caller must be able to edit the class under RLS
 * (admin, or the tutor teaching it). The automatic result stays in original_status.
 */
export async function overrideAttendance(auth: AuthContext, data: z.output<typeof overrideSchema>): Promise<{ ok: true }> {
  const db = rls(auth);
  await caller(db, auth.userId);
  await assertCanEdit(db, data.class_id);
  const { data: row } = await admin().from("attendance").select("id, status, source, original_status, override_reason").eq("class_id", data.class_id).eq("student_id", data.student_id).maybeSingle();
  if (!row) throw new AppError("NOT_FOUND", "There's no automatic attendance for this student yet.");
  if (row.source !== "automatic") throw new AppError("CONFLICT", "This attendance was marked by hand; change it in Take Attendance.");
  const now = new Date().toISOString();
  const { error } = await admin().from("attendance").update({
    status: data.status, original_status: row.original_status ?? row.status, override_reason: data.reason,
    overridden_by: auth.userId, overridden_at: now,
  }).eq("id", row.id);
  if (error) throw new AppError("DATABASE_ERROR");
  await admin().from("audit_events").insert({ actor_id: auth.userId, action: "attendance_overridden", entity_type: "attendance", entity_id: row.id,
    before_data: { status: row.status }, after_data: { status: data.status, reason: data.reason, original_status: row.original_status ?? row.status } });
  return { ok: true };
}

/** Processing state and unmatched Zoho participants for a class (admin or its tutor). */
export async function getAttendanceReview(auth: AuthContext, data: { id: string }): Promise<AttendanceReview> {
  const db = rls(auth);
  await caller(db, auth.userId);
  await assertCanEdit(db, data.id);
  const { data: c } = await admin().from("classes").select("attendance_status, attendance_last_error, attendance_processed_at").eq("id", data.id).maybeSingle();
  const { data: ev } = await admin().from("audit_events").select("after_data").eq("entity_id", data.id).eq("action", "attendance_processed").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return {
    attendanceStatus: c?.attendance_status ?? "not_applicable", lastError: c?.attendance_last_error ?? null, processedAt: c?.attendance_processed_at ?? null,
    unmatched: Array.isArray(ev?.after_data?.unmatched) ? ev.after_data.unmatched : [],
  };
}

/** Admin/tutor: marks a reviewed class as processed after checking unmatched participants. */
export async function markAttendanceReviewed(auth: AuthContext, data: { id: string }): Promise<{ ok: true }> {
  const db = rls(auth);
  await caller(db, auth.userId);
  await assertCanEdit(db, data.id);
  const { data: c } = await admin().from("classes").update({ attendance_status: "processed" }).eq("id", data.id).eq("attendance_status", "needs_review").not("attendance_processed_at", "is", null).select("id").maybeSingle();
  if (!c) throw new AppError("CONFLICT", "Only processed classes that need review can be marked reviewed. Classes whose report failed must be retried.");
  await admin().from("audit_events").insert({ actor_id: auth.userId, action: "attendance_reviewed", entity_type: "class", entity_id: data.id });
  return { ok: true };
}

/** Admin/tutor: retries automatic attendance for a class that failed and needs review. */
export async function retryAttendance(auth: AuthContext, data: { id: string }): Promise<RetryAttendanceResult> {
  const db = rls(auth);
  await caller(db, auth.userId);
  await assertCanEdit(db, data.id);
  const { data: c } = await admin().from("classes").update({ attendance_status: "pending", attendance_attempts: 0, attendance_next_attempt_at: null })
    .eq("id", data.id).eq("attendance_status", "needs_review").is("attendance_processed_at", null).select("id").maybeSingle();
  if (!c) throw new AppError("CONFLICT", "This class isn't waiting for an attendance retry.");
  return { ok: true, message: "Attendance will be fetched from Zoho on the next scheduled run." };
}

/** Admin/tutor: looks up Zoho cloud recordings for the class and links new ones. */
export async function findClassRecordings(auth: AuthContext, data: { id: string }): Promise<RecordingLinkResult> {
  const db = rls(auth);
  await caller(db, auth.userId);
  const row = await assertCanEdit(db, data.id);
  if (!row.zoho_meeting_key) throw new AppError("NOT_FOUND", "This class has no Zoho meeting.");
  try {
    const r = await linkClassRecordings(admin(), { id: row["id"], title: row.title, zoho_meeting_key: row.zoho_meeting_key }, auth.userId);
    // A manual find that attaches a ready recording settles the automatic recording step (also after "unavailable").
    const { count } = await admin().from("recordings").select("id", { count: "exact", head: true }).eq("class_id", row["id"]).eq("source_type", "zoho");
    if ((count ?? 0) > 0 && r.generating === 0) await admin().from("classes").update({ recording_status: "available", recording_next_attempt_at: null, recording_checked_at: new Date().toISOString() }).eq("id", row["id"]).in("recording_status", ["pending", "unavailable"]);
    return r;
  } catch (e) {
    if (e instanceof ZohoError && e.kind === "not_configured") throw new AppError("INTEGRATION_UNAVAILABLE", "Zoho Meeting is not configured.");
    throw new AppError("INTEGRATION_UNAVAILABLE", "Zoho recordings couldn't be checked right now. Recording depends on your Zoho plan and settings.");
  }
}

/** Public base of this backend, used to build the absolute stream URL handed to the browser. */
function publicApiBase(request: Request): string {
  const configured = (process.env["PUBLIC_API_URL"] ?? "").trim().replace(/\/+$/, "");
  return configured || new URL(request.url).origin;
}

/** Opens a Zoho recording for anyone allowed to see the recording row under RLS (students only once available). */
export async function openZohoRecording(auth: AuthContext, data: { id: string }, request: Request): Promise<UrlResult> {
  const { data: rec } = await rls(auth).from("recordings").select("id, class_id, source_type, zoho_recording_id").eq("id", data.id).maybeSingle();
  if (!rec || rec.source_type !== "zoho" || !rec.zoho_recording_id) throw new AppError("NOT_FOUND");
  const { data: cls } = await admin().from("classes").select("zoho_meeting_key").eq("id", rec.class_id).maybeSingle();
  if (!cls?.zoho_meeting_key) throw new AppError("NOT_FOUND", "This recording is no longer available.");
  try {
    const match = (await getRecordingsForMeeting(cls.zoho_meeting_key)).find((r) => r.id === rec.zoho_recording_id);
    if (!match) throw new AppError("NOT_FOUND", "Zoho no longer has this recording. It may have been deleted in Zoho.");
    if (match.generating) throw new AppError("CONFLICT", "Zoho is still processing this recording. Try again in a few minutes.");
    // Zoho play/share pages need a Zoho sign-in or public sharing, which students don't have.
    // So the LMS streams the file itself: probe access now (clear error), then hand out a short-lived signed ticket.
    if (!match.downloadUrl) throw new AppError("NOT_FOUND", "Zoho has no playable file for this recording.");
    const probe = await fetchRecordingFile(match.downloadUrl, "bytes=0-0");
    await probe.body?.cancel().catch(() => undefined);
  } catch (e) {
    if (e instanceof AppError) throw e;
    const kind = e instanceof ZohoError ? e.kind : "unknown";
    console.warn("[recording] open failed", { recording: rec.id, kind, status: e instanceof ZohoError ? e.status : undefined });
    const msg: Record<string, string> = {
      not_configured: "Zoho Meeting is not configured.",
      auth: "The LMS couldn't sign in to Zoho. An admin needs to reconnect Zoho.",
      scope: "The Zoho connection isn't allowed to read recordings. An admin needs a Zoho token with recording access.",
      rate_limited: "Zoho is busy right now. Try again in a minute.",
      transient: "Zoho couldn't be reached. Try again in a minute.",
      not_found: "Zoho couldn't find this recording's file.",
    };
    throw new AppError("INTEGRATION_UNAVAILABLE", msg[kind] ?? "Zoho refused the recording request. Try again later or contact an admin.");
  }
  // Signing is an LMS server step, not a Zoho call: report its failure as such.
  try {
    const ticket = await signRecordingTicket(rec.id, auth.userId);
    return { url: `${publicApiBase(request)}${API_ROUTES.recordingStream}?t=${encodeURIComponent(ticket)}` };
  } catch (e) {
    console.error("[recording] ticket signing failed", { recording: rec.id, reason: e instanceof Error ? e.message.slice(0, 60) : "unknown" });
    throw new AppError("INTEGRATION_UNAVAILABLE", "Recording playback isn't configured on this server. An admin needs to check the server settings.");
  }
}
