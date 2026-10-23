import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AppError } from "@/lib/errors";
import type { CreatedAccount, DeleteOutcome, ResetPasswordResult } from "@/lib/api/contracts";
import type { AuthContext } from "@backend/lib/supabase/auth";
import { supabaseAdmin } from "@backend/lib/supabase/admin";
import { assertActiveAdmin, generateTemporaryPassword } from "@backend/server/accounts/accounts.server";
import { sendWelcomeEmail } from "@backend/server/delivery/welcome-email.server";

type Role = "student" | "trainer";

async function provision(role: Role, callerClient: SupabaseClient<Database>, callerId: string, input: Record<string, unknown>): Promise<CreatedAccount> {
  await assertActiveAdmin(callerClient as never, callerId);
  const { full_name, email, phone, course_id, batch_id, ...details } = input as { full_name: string; email: string; phone?: string; course_id?: string; batch_id?: string } & Record<string, unknown>;
  let placement: { courseName: string; batchName: string; fee: number; currency: string } | undefined;
  if (role === "student") {
    const { data: course, error: courseError } = await callerClient.from("courses").select("title, price, currency, status").eq("id", course_id ?? "").maybeSingle();
    const { data: batch, error: batchError } = await callerClient.from("batches").select("name, code, status, capacity, course_id").eq("id", batch_id ?? "").maybeSingle();
    if (courseError || batchError) throw new AppError("DATABASE_ERROR");
    if (!course || course.status !== "published" || !batch || batch.course_id !== course_id || batch.status !== "active") throw new AppError("VALIDATION_ERROR", "Select a published course and an active batch in that course.");
    const { count, error: capacityError } = await callerClient.from("enrollments").select("id", { head: true, count: "exact" }).eq("batch_id", batch_id ?? "").eq("status", "active");
    if (capacityError) throw new AppError("DATABASE_ERROR");
    if ((count ?? 0) >= batch.capacity) throw new AppError("CONFLICT", "This batch is at full capacity.");
    placement = { courseName: course.title, batchName: `${batch.name} (${batch.code})`, fee: course.price, currency: course.currency };
  }
  const { data: phoneTaken } = await supabaseAdmin.from("profiles").select("id").eq("phone", phone ?? "").maybeSingle();
  if (phoneTaken) throw new AppError("VALIDATION_ERROR", "This phone number is already in use.", { details: { phone: ["This phone number is already in use."] } });
  const { data: codeValue, error: codeError } = await supabaseAdmin.rpc("next_account_code" as never, { _role: role } as never);
  if (codeError || !codeValue) throw new AppError("DATABASE_ERROR");
  const code = String(codeValue);
  details[role === "student" ? "student_code" : "trainer_code"] = code;
  const password = generateTemporaryPassword();
  const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (authErr || !created.user) {
    if (authErr && /already|registered|exists/i.test(authErr.message)) throw new AppError("VALIDATION_ERROR", "An account with this email already exists.", { details: { email: ["An account with this email already exists."] } });
    throw new AppError("INTEGRATION_UNAVAILABLE", "The account could not be created. Please try again.");
  }
  const userId = created.user.id;
  const { error } = await supabaseAdmin.rpc("provision_account", {
    _user_id: userId, _role: role, _full_name: full_name, _email: email, _phone: phone ?? "", _details: details as never, _actor: callerId,
  });
  if (error) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error.code === "23505") throw new AppError("CONFLICT", `This ${role === "student" ? "student" : "tutor"} code or email is already in use.`);
    throw new AppError("DATABASE_ERROR");
  }
  if (role === "student" && placement && course_id && batch_id) {
    const { data: student, error: studentError } = await supabaseAdmin.from("students").select("id").eq("profile_id", userId).single();
    if (studentError || !student) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new AppError("DATABASE_ERROR", "The student could not be enrolled. No account was created.");
    }
    const { error: enrollmentError } = await callerClient.from("enrollments").insert({ student_id: student.id, course_id, batch_id, fee_amount: placement.fee, currency: placement.currency, status: "active" });
    if (enrollmentError) {
      const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (rollbackError) throw new AppError("DATABASE_ERROR", "Enrollment failed. An account may remain; contact support before retrying.");
      throw new AppError("CONFLICT", "The student could not be enrolled. Check the batch capacity and try again.");
    }
  }
  const emailStatus = await sendWelcomeEmail(supabaseAdmin as never, callerId, userId, { role, fullName: full_name, email, code, temporaryPassword: password });
  return { profileId: userId, fullName: full_name, email, code, temporaryPassword: password, emailStatus, ...(placement ? { courseName: placement.courseName, batchName: placement.batchName } : {}) };
}

export const createStudentAccount = (auth: AuthContext, data: Record<string, unknown>) => provision("student", auth.supabase, auth.userId, data);
export const createTrainerAccount = (auth: AuthContext, data: Record<string, unknown>) => provision("trainer", auth.supabase, auth.userId, data);

/** Issues a fresh temporary password and forces a change at next sign-in. The old password is never retrievable. */
export async function resetAccountPassword(auth: AuthContext, data: { profileId: string }): Promise<ResetPasswordResult> {
  await assertActiveAdmin(auth.supabase as never, auth.userId);
  if (data.profileId === auth.userId) throw new AppError("AUTHORIZATION_ERROR", "Use Change password for your own account.");
  const { data: target } = await supabaseAdmin.from("profiles").select("role, full_name, email, students(student_code), trainers(trainer_code)").eq("id", data.profileId).maybeSingle();
  if (!target || target.role === "admin") throw new AppError("NOT_FOUND");
  const password = generateTemporaryPassword();
  const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.profileId, { password });
  if (authErr) throw new AppError("INTEGRATION_UNAVAILABLE", "The password could not be reset. Please try again.");
  const { error } = await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("id", data.profileId);
  if (error) throw new AppError("DATABASE_ERROR");
  await supabaseAdmin.from("audit_events").insert({ actor_id: auth.userId, action: "auth.password_reset", entity_type: "profile", entity_id: data.profileId });
  const t = target as unknown as { role: Role; students?: { student_code: string }[] | { student_code: string } | null; trainers?: { trainer_code: string }[] | { trainer_code: string } | null };
  const one = <T,>(v: T[] | T | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;
  const code = t.role === "student" ? one(t.students)?.student_code : one(t.trainers)?.trainer_code;
  const emailStatus = await sendWelcomeEmail(supabaseAdmin as never, auth.userId, data.profileId, { role: t.role, fullName: target.full_name, email: String(target.email), code: code ?? "—", temporaryPassword: password, reset: true });
  return { fullName: target.full_name, email: String(target.email), temporaryPassword: password, emailStatus };
}

async function updateAccount(role: Role, auth: AuthContext, input: Record<string, unknown>) {
  await assertActiveAdmin(auth.supabase as never, auth.userId);
  const db = supabaseAdmin;
  const { profileId, full_name, phone, ...details } = input as { profileId: string; full_name: string; phone: string } & Record<string, unknown>;
  const { data: target } = await db.from("profiles").select("role").eq("id", profileId).maybeSingle();
  if (!target || target.role !== role) throw new AppError("NOT_FOUND");
  const { data: taken } = await db.from("profiles").select("id").eq("phone", phone).neq("id", profileId).maybeSingle();
  if (taken) throw new AppError("VALIDATION_ERROR", "This phone number is already in use.", { details: { phone: ["This phone number is already in use."] } });
  // Only admin-managed descriptive fields; role, status, password and codes are never touched here.
  const { error: pErr } = await db.from("profiles").update({ full_name, phone }).eq("id", profileId);
  if (pErr) throw new AppError(pErr.code === "23505" ? "CONFLICT" : "DATABASE_ERROR");
  const table = role === "student" ? "students" : "trainers";
  const { error } = await db.from(table).update(details as never).eq("profile_id", profileId);
  if (error) throw new AppError("DATABASE_ERROR");
  await db.from("audit_events").insert({ actor_id: auth.userId, action: `${role}.updated`, entity_type: "profile", entity_id: profileId });
  return { ok: true as const };
}

export const updateStudentAccount = (auth: AuthContext, data: Record<string, unknown>) => updateAccount("student", auth, data);
export const updateTrainerAccount = (auth: AuthContext, data: Record<string, unknown>) => updateAccount("trainer", auth, data);

/** Removes an account with no LMS history; otherwise deactivates it so history is preserved. */
export async function deleteAccount(auth: AuthContext, data: { profileId: string }): Promise<DeleteOutcome> {
  await assertActiveAdmin(auth.supabase as never, auth.userId);
  const db = supabaseAdmin;
  if (data.profileId === auth.userId) throw new AppError("AUTHORIZATION_ERROR");
  const { data: target } = await db.from("profiles").select("role").eq("id", data.profileId).maybeSingle();
  if (!target || target.role === "admin") throw new AppError("NOT_FOUND");
  let history = 0;
  if (target.role === "student") {
    const { data: s } = await db.from("students").select("id").eq("profile_id", data.profileId).maybeSingle();
    if (s) for (const t of ["enrollments", "attendance", "submissions", "certificates", "internships", "lesson_progress"] as const) {
      const { count } = await db.from(t).select("id", { head: true, count: "exact" }).eq("student_id", s.id);
      history += count ?? 0;
    }
  } else {
    const { data: tr } = await db.from("trainers").select("id").eq("profile_id", data.profileId).maybeSingle();
    if (tr) for (const t of ["trainer_assignments", "classes", "assignments"] as const) {
      const { count } = await db.from(t).select("id", { head: true, count: "exact" }).eq("trainer_id", tr.id);
      history += count ?? 0;
    }
  }
  if (history === 0) {
    const { error } = await db.auth.admin.deleteUser(data.profileId);
    if (!error) return { outcome: "deleted" };
  }
  const { error } = await auth.supabase.rpc("admin_set_account_status", { _profile_id: data.profileId, _status: "inactive" });
  if (error) throw new AppError("DATABASE_ERROR");
  await db.auth.admin.updateUserById(data.profileId, { ban_duration: "876000h" });
  return { outcome: "deactivated" };
}
