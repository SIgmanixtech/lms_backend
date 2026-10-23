import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { OkResult, RemovalOutcome, UrlResult } from "@/lib/api/contracts";
import type { AuthContext } from "@backend/lib/supabase/auth";
import { supabaseAdmin as db } from "@backend/lib/supabase/admin";
import { assertActiveAdmin } from "@backend/server/accounts/accounts.server";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "zip", "png", "jpg", "jpeg"];
/** Base64 of the largest allowed file, plus JSON framing. */
export const UPLOAD_MAX_BODY_BYTES = Math.ceil((MAX_BYTES * 4) / 3) + 64 * 1024;

export const uploadSchema = z.object({ id: z.string().uuid(), name: z.string().min(1).max(200), type: z.string().max(120), base64: z.string().min(1).max(UPLOAD_MAX_BODY_BYTES) });

/** Admin-only. A batch with any linked history is archived instead of deleted. */
export async function deleteBatch(auth: AuthContext, data: { id: string }): Promise<RemovalOutcome> {
  await assertActiveAdmin(auth.supabase as never, auth.userId);
  const tables = ["enrollments", "classes", "assignments", "trainer_assignments", "internships", "certificates", "announcements"] as const;
  let deps = 0;
  for (const t of tables) {
    const { count, error } = await db.from(t).select("id", { head: true, count: "exact" }).eq("batch_id", data.id);
    if (error) throw new AppError("DATABASE_ERROR");
    deps += count ?? 0;
  }
  const audit = (action: string) => db.from("audit_events").insert({ actor_id: auth.userId, action, entity_type: "batch", entity_id: data.id });
  if (deps > 0) {
    const { error } = await db.from("batches").update({ status: "archived" }).eq("id", data.id);
    if (error) throw new AppError("DATABASE_ERROR");
    await audit("batch.archived");
    return { outcome: "archived" };
  }
  const { error } = await db.from("batches").delete().eq("id", data.id);
  if (error) throw new AppError("CONFLICT", "This batch is still referenced elsewhere, so it was not deleted.");
  await audit("batch.deleted");
  return { outcome: "deleted" };
}

/** Confirms, through RLS, that the caller may edit this assignment (admin or its assigned tutor). */
async function editableAssignment(sb: { from: (t: "assignments") => any }, id: string) {
  const { data } = await sb.from("assignments").select("id, status, attachment_path").eq("id", id).maybeSingle();
  if (!data) throw new AppError("NOT_FOUND");
  const { data: touched } = await sb.from("assignments").update({ status: data.status }).eq("id", id).select("id").maybeSingle();
  if (!touched) throw new AppError("AUTHORIZATION_ERROR");
  return data as { id: string; status: string; attachment_path: string | null };
}

/** Assignments with submissions are closed, never destroyed. */
export async function deleteAssignment(auth: AuthContext, data: { id: string }): Promise<RemovalOutcome> {
  const a = await editableAssignment(auth.supabase as never, data.id);
  const { count, error: cErr } = await db.from("submissions").select("id", { head: true, count: "exact" }).eq("assignment_id", data.id);
  if (cErr) throw new AppError("DATABASE_ERROR");
  const audit = (action: string) => db.from("audit_events").insert({ actor_id: auth.userId, action, entity_type: "assignment", entity_id: data.id });
  if ((count ?? 0) > 0) {
    const { error } = await db.from("assignments").update({ status: "closed" }).eq("id", data.id);
    if (error) throw new AppError("DATABASE_ERROR");
    await audit("assignment.closed");
    return { outcome: "closed" };
  }
  const { error } = await db.from("assignments").delete().eq("id", data.id);
  if (error) throw new AppError("CONFLICT", "This assignment is still referenced elsewhere, so it was not deleted.");
  if (a.attachment_path) await db.storage.from("submissions").remove([a.attachment_path]);
  await audit("assignment.deleted");
  return { outcome: "deleted" };
}

/** Stores an assignment brief privately; only reachable through signed links from `getAssignmentAttachmentUrl`. */
export async function uploadAssignmentAttachment(auth: AuthContext, data: z.output<typeof uploadSchema>): Promise<OkResult> {
  const ext = (data.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) throw new AppError("VALIDATION_ERROR", `Allowed file types: ${ALLOWED_EXT.join(", ")}.`);
  const bytes = Buffer.from(data.base64, "base64");
  if (bytes.byteLength > MAX_BYTES) throw new AppError("VALIDATION_ERROR", "The file must be 10 MB or smaller.");
  const a = await editableAssignment(auth.supabase as never, data.id);
  const path = `assignment-briefs/${data.id}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await db.storage.from("submissions").upload(path, bytes, { contentType: data.type || "application/octet-stream" });
  if (upErr) throw new AppError("DATABASE_ERROR", "The file couldn't be stored. Please try again.");
  const { error } = await db.from("assignments").update({ attachment_path: path, attachment_name: data.name }).eq("id", data.id);
  if (error) { await db.storage.from("submissions").remove([path]); throw new AppError("DATABASE_ERROR"); }
  if (a.attachment_path) await db.storage.from("submissions").remove([a.attachment_path]);
  return { ok: true };
}

/** RLS decides visibility (admin, batch tutor, or enrolled student on a published/closed assignment). */
export async function getAssignmentAttachmentUrl(auth: AuthContext, data: { id: string }): Promise<UrlResult> {
  const { data: row } = await (auth.supabase as any).from("assignments").select("attachment_path").eq("id", data.id).maybeSingle();
  if (!row?.attachment_path) throw new AppError("NOT_FOUND");
  const { data: signed, error } = await db.storage.from("submissions").createSignedUrl(row.attachment_path, 300);
  if (error || !signed) throw new AppError("DATABASE_ERROR");
  return { url: signed.signedUrl };
}
