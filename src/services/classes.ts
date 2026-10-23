import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { ClassSaveResult, SettleResult, UrlResult, ZohoCheckResult, ZohoStatusResult } from "@/lib/api/contracts";
import { canStartClass, meetingAction, needsMeeting, type ClassState } from "@/features/classes/services/class-meeting-policy";
import { classActions, manualStatusChangeError } from "@/features/classes/services/class-lifecycle-policy";
import { classWindowMs } from "@/features/attendance/services/attendance-matching";
import { ZohoError, sanitizeZohoError } from "@/features/meetings/services/zoho-policy";
import type { AuthContext } from "@backend/lib/supabase/auth";
import { supabaseAdmin } from "@backend/lib/supabase/admin";
import * as zoho from "@backend/server/meetings/zoho-meeting.server";
import { advanceTimed } from "@backend/server/classes/class-lifecycle.server";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : null));
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Enter a valid time.");
const fields = {
  title: z.string().trim().min(1, "Enter the topic.").max(200),
  class_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."),
  start_time: time, end_time: time,
  status: z.enum(["scheduled", "live", "completed", "cancelled"]).default("scheduled"),
  class_type: z.enum(["online", "offline", "hybrid"]).default("offline"),
  meet_url: opt(500).refine((v) => !v || /^https:\/\//i.test(v), "Meeting link must start with https://"),
  location: opt(300), notes: opt(2000),
  trainer_id: z.string().uuid("Select a tutor.").optional().or(z.literal("")).transform((v) => (v ? v : null)),
};
export const createClassSchema = z.object({ ...fields, batch_id: z.string().uuid("Select a batch.") }).refine((v) => v.end_time > v.start_time, { message: "End time must be after start time.", path: ["end_time"] });
export const updateClassSchema = z.object({ id: z.string().uuid(), ...fields }).partial({ class_type: true, status: true }).refine((v) => v.end_time > v.start_time, { message: "End time must be after start time.", path: ["end_time"] });
export const moveClassSchema = z.object({ id: z.string().uuid(), class_date: fields.class_date });
export const idSchema = z.object({ id: z.string().uuid() });

export type Db = { from: (t: string) => any; rpc: (...a: any[]) => any };
const CLASS_COLS = "id, batch_id, course_id, trainer_id, title, class_date, start_time, end_time, status, class_type, meet_url, location, notes, zoho_meeting_key, zoho_status";
const admin = () => supabaseAdmin as unknown as Db;
const rls = (auth: AuthContext) => auth.supabase as unknown as Db;

export async function caller(db: Db, userId: string) {
  const { data } = await db.from("profiles").select("role, account_status").eq("id", userId).maybeSingle();
  if (!data || data.account_status !== "active" || (data.role !== "admin" && data.role !== "trainer")) throw new AppError("AUTHORIZATION_ERROR");
  let trainerId: string | null = null;
  if (data.role === "trainer") {
    const { data: t } = await db.from("trainers").select("id").eq("profile_id", userId).maybeSingle();
    trainerId = t?.id ?? null;
    if (!trainerId) throw new AppError("AUTHORIZATION_ERROR", "Your tutor record wasn't found.");
  }
  return { role: data.role as "admin" | "trainer", trainerId };
}

/** Proves the caller may edit this class under RLS by writing an unchanged value; RLS returns no row otherwise. */
export async function assertCanEdit(db: Db, id: string) {
  const { data: row } = await db.from("classes").select(CLASS_COLS).eq("id", id).maybeSingle();
  if (!row) throw new AppError("NOT_FOUND");
  const { data: probe, error } = await db.from("classes").update({ title: row.title }).eq("id", id).select("id").maybeSingle();
  if (error || !probe) throw new AppError("AUTHORIZATION_ERROR");
  return row as ClassState & Record<string, any>;
}

function zohoAppError(e: unknown, action: string): AppError {
  if (e instanceof ZohoError) {
    const kind = (e as { kind: string }).kind;
    if (kind === "not_configured") return new AppError("INTEGRATION_UNAVAILABLE", "Zoho Meeting is not configured, so online meetings can't be managed yet.");
    if (kind === "auth") return new AppError("INTEGRATION_UNAVAILABLE", `Zoho rejected our sign-in, so the meeting couldn't be ${action}. An admin must check the Zoho connection.`);
    if (kind === "rate_limited" || kind === "transient") return new AppError("INTEGRATION_UNAVAILABLE", `Zoho is busy, so the meeting couldn't be ${action}. Nothing was changed; please try again shortly.`);
  }
  return new AppError("INTEGRATION_UNAVAILABLE", `The Zoho meeting couldn't be ${action}. Nothing was changed.`);
}

const audit = (db: Db, actor: string, action: string, id: string, after?: Record<string, unknown>) =>
  db.from("audit_events").insert({ actor_id: actor, action, entity_type: "class", entity_id: id, ...(after ? { after_data: after } : {}) });

/** Creates the Zoho meeting for a saved class and records the outcome; never throws for Zoho failures. */
async function attachMeeting(actor: string, c: ClassState & { id: string; notes?: string | null }): Promise<ClassSaveResult> {
  const db = admin();
  try {
    const s = await zoho.createMeeting({ topic: c.title, agenda: c.notes ?? null, classDate: c.class_date, startTime: c.start_time, endTime: c.end_time });
    const now = new Date().toISOString();
    const { error } = await db.from("classes").update({ zoho_meeting_key: s.meetingKey, zoho_join_url: s.joinLink, zoho_status: "created", zoho_last_error: null, zoho_created_at: now, zoho_last_synced_at: now }).eq("id", c.id);
    if (error) {
      // Meeting exists in Zoho but could not be linked; remove it so a retry can't create a duplicate.
      await zoho.deleteMeeting(s.meetingKey).catch(() => undefined);
      throw new AppError("DATABASE_ERROR");
    }
    await audit(db, actor, "zoho_meeting_created", c.id, { meeting_key: s.meetingKey });
    return { id: c.id, meeting: "created" };
  } catch (e) {
    const reason = sanitizeZohoError(e instanceof Error ? e.message : "Unknown Zoho error");
    await db.from("classes").update({ zoho_status: "failed", zoho_last_error: reason }).eq("id", c.id);
    await audit(db, actor, "zoho_meeting_failed", c.id, { reason });
    return { id: c.id, meeting: "failed", warning: `The class was saved, but the Zoho meeting wasn't created: ${zohoAppError(e, "created").message} Use "Retry meeting" once fixed.` };
  }
}

export async function createClassWithMeeting(auth: AuthContext, data: z.output<typeof createClassSchema>): Promise<ClassSaveResult> {
  const db = rls(auth);
  const me = await caller(db, auth.userId);
  const trainerId = me.role === "trainer" ? me.trainerId : data.trainer_id;
  if (!trainerId) throw new AppError("VALIDATION_ERROR", "Select a tutor.", { details: { trainer_id: ["Select a tutor."] } });
  const { data: batch } = await db.from("batches").select("course_id, status").eq("id", data.batch_id).maybeSingle();
  if (!batch) throw new AppError("VALIDATION_ERROR", "Select a batch you can access.");
  const { data: assigned } = await db.from("trainer_assignments").select("id").eq("batch_id", data.batch_id).eq("trainer_id", trainerId).limit(1);
  if (!assigned?.length) throw new AppError("VALIDATION_ERROR", "This tutor isn't assigned to the selected batch.", { details: { trainer_id: ["This tutor isn't assigned to the selected batch."] } });
  // Insert as the caller so RLS decides; meeting fields are then set server-side.
  const { data: row, error } = await db.from("classes").insert({
    batch_id: data.batch_id, course_id: batch.course_id, trainer_id: trainerId, title: data.title, class_date: data.class_date,
    start_time: data.start_time, end_time: data.end_time, status: data.status, meet_url: data.meet_url, location: data.location, notes: data.notes,
  }).select(CLASS_COLS).single();
  if (error || !row) throw new AppError(error?.code === "42501" ? "AUTHORIZATION_ERROR" : "DATABASE_ERROR");
  await audit(admin(), auth.userId, "class_created", row.id, { class_type: data.class_type });
  if (!needsMeeting(data.class_type)) return { id: row.id, meeting: "none" };
  await admin().from("classes").update({ class_type: data.class_type, zoho_status: "pending", attendance_status: "pending" }).eq("id", row.id);
  if (data.status !== "scheduled" && data.status !== "live") return { id: row.id, meeting: "none" };
  return attachMeeting(auth.userId, { ...row, class_type: data.class_type, notes: data.notes });
}

async function applyUpdate(auth: AuthContext, id: string, patch: Partial<ClassState> & Record<string, unknown>): Promise<ClassSaveResult> {
  const db = rls(auth);
  const me = await caller(db, auth.userId);
  const before = await assertCanEdit(db, id);
  if (patch["trainer_id"] && patch["trainer_id"] !== before["trainer_id"] && me.role !== "admin") throw new AppError("AUTHORIZATION_ERROR", "Only an admin can change the tutor.");
  const after = { ...before, ...patch } as ClassState & Record<string, any>;
  const statusError = manualStatusChangeError(String(before.status), String(after.status), !!before.zoho_meeting_key && needsMeeting(after.class_type));
  if (statusError) throw new AppError("CONFLICT", statusError);
  const action = meetingAction(before, after);
  const meetingPatch: Record<string, unknown> = {};
  let meeting: ClassSaveResult["meeting"] = "none";
  // Zoho first for updates/cancellations: if it fails, the LMS class is left unchanged.
  if (action === "update" && before.zoho_meeting_key) {
    try {
      const s = await zoho.updateMeeting(before.zoho_meeting_key, { topic: after.title, agenda: after["notes"] ?? null, classDate: after.class_date, startTime: after.start_time, endTime: after.end_time });
      Object.assign(meetingPatch, { zoho_join_url: s.joinLink, zoho_status: "created", zoho_last_error: null, zoho_last_synced_at: new Date().toISOString() });
      meeting = "updated";
    } catch (e) { throw zohoAppError(e, "updated"); }
  } else if (action === "delete" && before.zoho_meeting_key) {
    try { await zoho.deleteMeeting(before.zoho_meeting_key); } catch (e) { throw zohoAppError(e, "cancelled"); }
    Object.assign(meetingPatch, { zoho_status: "cancelled", zoho_join_url: null, zoho_last_synced_at: new Date().toISOString(), ...(needsMeeting(after.class_type) ? {} : { zoho_meeting_key: null, zoho_status: "none" }) });
    meeting = "cancelled";
  }
  if (!needsMeeting(after.class_type)) Object.assign(meetingPatch, { attendance_status: "not_applicable" });
  else if (!needsMeeting(before.class_type)) Object.assign(meetingPatch, { attendance_status: "pending", zoho_status: "pending" });
  if (after.status === "cancelled") Object.assign(meetingPatch, { attendance_status: "not_applicable" });
  const { error } = await admin().from("classes").update({ ...patch, ...meetingPatch }).eq("id", id);
  if (error) throw new AppError("DATABASE_ERROR");
  const moved = before.class_date !== after.class_date || before.start_time.slice(0, 5) !== after.start_time.slice(0, 5) || before.end_time.slice(0, 5) !== after.end_time.slice(0, 5);
  if (after.status === "cancelled" && before.status !== "cancelled") await audit(admin(), auth.userId, "class_cancelled", id);
  else if (moved) await audit(admin(), auth.userId, "class_rescheduled", id, { class_date: after.class_date, start_time: after.start_time, end_time: after.end_time });
  if (meeting === "updated") await audit(admin(), auth.userId, "zoho_meeting_updated", id);
  if (action === "create") return attachMeeting(auth.userId, { ...after, id });
  return { id, meeting };
}

export function updateClassWithMeeting(auth: AuthContext, data: z.output<typeof updateClassSchema>): Promise<ClassSaveResult> {
  const { id, trainer_id, ...rest } = data;
  const patch: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  if (trainer_id) patch["trainer_id"] = trainer_id;
  return applyUpdate(auth, id, patch as never);
}

/** Week-board drag: keeps the times, changes the day, and moves the Zoho meeting too. */
export const moveClassDay = (auth: AuthContext, data: z.output<typeof moveClassSchema>) => applyUpdate(auth, data.id, { class_date: data.class_date });

export async function retryClassMeeting(auth: AuthContext, data: { id: string }): Promise<ClassSaveResult> {
  const db = rls(auth);
  await caller(db, auth.userId);
  const row = await assertCanEdit(db, data.id);
  if (!needsMeeting(row.class_type) || row.zoho_meeting_key || row.status === "cancelled" || row.status === "completed" || row.status === "processing")
    throw new AppError("CONFLICT", "This class doesn't need a new meeting.");
  return attachMeeting(auth.userId, row as never);
}

/** Presenter start link, fetched live from Zoho for the class tutor or an admin. Never stored. */
export async function getClassStartLink(auth: AuthContext, data: { id: string }): Promise<UrlResult> {
  const db = rls(auth);
  const me = await caller(db, auth.userId);
  const { data: row } = await db.from("classes").select("id, trainer_id, zoho_meeting_key, status, class_date, start_time, end_time").eq("id", data.id).maybeSingle();
  if (!row || !canStartClass(me.role, me.trainerId, row.trainer_id)) throw new AppError("AUTHORIZATION_ERROR");
  if (!row.zoho_meeting_key || row.status === "cancelled") throw new AppError("NOT_FOUND", "This class has no active Zoho meeting.");
  const { end } = classWindowMs(row.class_date, row.start_time, row.end_time);
  const acts = classActions(row.status, end, Date.now());
  if (!acts.canStart && !acts.canEnd) throw new AppError("CONFLICT", "This class has already ended.");
  let url: string;
  try {
    const s = await zoho.getMeeting(row.zoho_meeting_key);
    if (!s.startLink) throw new AppError("INTEGRATION_UNAVAILABLE", "Zoho didn't return a start link for this meeting.");
    url = s.startLink;
  } catch (e) { if (e instanceof AppError) throw e; throw zohoAppError(e, "opened"); }
  // Only a successful start marks the class Live (conditional, so repeat clicks are no-ops).
  if (row.status === "scheduled") {
    const { data: done } = await admin().from("classes").update({ status: "live", started_at: new Date().toISOString() }).eq("id", row.id).eq("status", "scheduled").select("id");
    if (done?.length) await admin().from("audit_events").insert({ actor_id: auth.userId, action: "class_started", entity_type: "class", entity_id: row.id, after_data: { to: "live" } });
  }
  return { url };
}

/**
 * Tutor/admin ends a live class early (Zoho's API doesn't report "meeting ended").
 * Moves it to processing so attendance and recording lookup start now instead of after the scheduled end.
 */
export async function endClassNow(auth: AuthContext, data: { id: string }): Promise<{ ok: true }> {
  const db = rls(auth);
  const me = await caller(db, auth.userId);
  const { data: row } = await db.from("classes").select("id, trainer_id, zoho_meeting_key, status").eq("id", data.id).maybeSingle();
  if (!row || !canStartClass(me.role, me.trainerId, row.trainer_id)) throw new AppError("AUTHORIZATION_ERROR");
  if (row.status !== "live") throw new AppError("CONFLICT", "Only a live class can be ended.");
  const now = new Date().toISOString();
  // Ending is final: the class is Completed now; attendance and recording lookup continue on their own.
  const patch = row.zoho_meeting_key
    ? { status: "completed", ended_at: now, recording_status: "pending", recording_attempts: 0, recording_next_attempt_at: now, attendance_next_attempt_at: null }
    : { status: "completed", ended_at: now, recording_status: "not_applicable" };
  const { data: done } = await admin().from("classes").update(patch).eq("id", row.id).eq("status", "live").select("id");
  if (!done?.length) throw new AppError("CONFLICT", "This class has already moved on.");
  await admin().from("audit_events").insert({ actor_id: auth.userId, action: "class_ended_early", entity_type: "class", entity_id: row.id, after_data: { ended_at: now, to: patch.status } });
  return { ok: true };
}

/**
 * Persists Completed for classes whose scheduled end has passed, using the same conditional step as
 * the cron job (no second scheduler). Called when Admin/Tutor class screens load, so stale rows are
 * fixed even if the cron is late. Only moves classes forward; takes no input.
 */
export async function settleClassStatuses(auth: AuthContext): Promise<SettleResult> {
  const me = await caller(rls(auth), auth.userId);
  if (me.role !== "admin" && me.role !== "trainer") throw new AppError("AUTHORIZATION_ERROR");
  const s = { completed: 0 };
  await advanceTimed(admin() as never, Date.now(), s);
  return s;
}

export async function getZohoStatus(auth: AuthContext): Promise<ZohoStatusResult> {
  await caller(rls(auth), auth.userId);
  return { configured: zoho.zohoStatus().configured };
}

/** Admin-only Zoho identity check: confirms sign-in and the configured org/presenter IDs. */
export async function checkZohoConnection(auth: AuthContext): Promise<ZohoCheckResult> {
  const me = await caller(rls(auth), auth.userId);
  if (me.role !== "admin") throw new AppError("AUTHORIZATION_ERROR");
  const s = zoho.zohoStatus();
  if (!s.configured) return { configured: false, missing: s.missing };
  return { configured: true, ...(await zoho.checkZohoIdentity()) };
}
