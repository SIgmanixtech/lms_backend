import { createClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { deriveAccessState } from "@/features/auth/services/access-state";
import type { AccessResult, OkResult } from "@/lib/api/contracts";
import type { AuthContext } from "@backend/lib/supabase/auth";
import { supabaseAdmin } from "@backend/lib/supabase/admin";
import { requireEnv } from "@backend/lib/supabase/fetch";

/** Current user's access state; reads only the caller's own profile (RLS). */
export async function getMyAccess(auth: AuthContext): Promise<AccessResult> {
  const { data, error } = await auth.supabase.from("profiles").select("role, account_status, must_change_password").eq("id", auth.userId).maybeSingle();
  if (error) throw new AppError("DATABASE_ERROR");
  return { state: deriveAccessState(data), role: data?.role ?? null };
}

/**
 * Password change (also the only way to clear must_change_password).
 * Re-verifies the current password, sets the new one through the Auth admin
 * API, then calls mark_password_changed (service_role only) which clears the
 * flag and writes the audit event. It cannot touch role or account status.
 */
export async function changeMyPassword(auth: AuthContext, data: { currentPassword: string; newPassword: string }): Promise<OkResult> {
  const email = typeof auth.claims.email === "string" ? auth.claims.email : null;
  if (!email) throw new AppError("AUTHENTICATION_ERROR");

  const { data: profile } = await auth.supabase.from("profiles").select("account_status").eq("id", auth.userId).maybeSingle();
  if (!profile || profile.account_status !== "active") throw new AppError("AUTHORIZATION_ERROR");

  const [url, key] = requireEnv("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY") as [string, string];
  const verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInErr } = await verifier.auth.signInWithPassword({ email, password: data.currentPassword });
  if (signInErr) throw new AppError("AUTHENTICATION_ERROR", "Your current password is incorrect.");
  await verifier.auth.signOut();

  const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(auth.userId, { password: data.newPassword });
  if (updErr) throw new AppError("VALIDATION_ERROR", "This password can't be used. Choose another.");
  const { error: markErr } = await supabaseAdmin.rpc("mark_password_changed", { _profile_id: auth.userId });
  if (markErr) throw new AppError("DATABASE_ERROR");
  return { ok: true };
}

/**
 * Admin activates/deactivates another account. Authorization happens in the
 * database (admin_set_account_status runs as the caller and checks is_admin,
 * self-change and last-admin rules, and audits). Deactivation additionally
 * bans the auth user so existing sessions stop refreshing.
 */
export async function setAccountStatus(auth: AuthContext, data: { profileId: string; status: "active" | "inactive" }): Promise<OkResult> {
  const { error } = await auth.supabase.rpc("admin_set_account_status", { _profile_id: data.profileId, _status: data.status });
  if (error) {
    if (error.code === "42501") throw new AppError("AUTHORIZATION_ERROR");
    if (error.code === "P0002") throw new AppError("NOT_FOUND");
    if (error.code === "23514") throw new AppError("CONFLICT", "At least one active administrator must remain.");
    throw new AppError("DATABASE_ERROR");
  }
  await supabaseAdmin.auth.admin.updateUserById(data.profileId, { ban_duration: data.status === "inactive" ? "876000h" : "none" });
  return { ok: true };
}
