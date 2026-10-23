import type { AppRole } from "@/lib/constants";

/**
 * Authentication state machine for a signed-in user. The database enforces
 * the same rule (app_private.current_app_role); this pure function lets the
 * server and UI describe WHY access is blocked.
 *
 *   no_profile            -> signed in, but no LMS account was provisioned
 *   invalid_role          -> profile has no recognised role
 *   inactive              -> account disabled by an administrator
 *   must_change_password  -> trainer/student temporary password; only the change is allowed
 *   active                -> normal access for `role`
 *
 * Admins are exempt from the forced password change.
 */
export type AccessState = "no_profile" | "invalid_role" | "inactive" | "must_change_password" | "active";

export interface ProfileAccessRow {
  role: AppRole | string | null;
  account_status: "active" | "inactive" | string;
  must_change_password: boolean;
}

const ROLES: readonly AppRole[] = ["admin", "trainer", "student"];
export const isValidRole = (r: unknown): r is AppRole => ROLES.includes(r as AppRole);

export function deriveAccessState(profile: ProfileAccessRow | null): AccessState {
  if (!profile) return "no_profile";
  if (profile.account_status !== "active") return "inactive";
  if (!isValidRole(profile.role)) return "invalid_role";
  if (profile.role !== "admin" && profile.must_change_password) return "must_change_password";
  return "active";
}

export const DASHBOARD_ROUTE: Record<AppRole, "/admin/dashboard" | "/trainer/dashboard" | "/student/dashboard"> = {
  admin: "/admin/dashboard",
  trainer: "/trainer/dashboard",
  student: "/student/dashboard",
};

export type AccessDecision =
  | { kind: "go"; to: "/admin/dashboard" | "/trainer/dashboard" | "/student/dashboard" | "/change-password" }
  | { kind: "deny"; reason: "profile" | "inactive" };

/** Single post-login routing decision used by login, "/", the protected gate and password change. */
export function decideAccess(profile: ProfileAccessRow | null): AccessDecision {
  const state = deriveAccessState(profile);
  if (state === "inactive") return { kind: "deny", reason: "inactive" };
  if (state === "no_profile" || state === "invalid_role") return { kind: "deny", reason: "profile" };
  if (state === "must_change_password") return { kind: "go", to: "/change-password" };
  return { kind: "go", to: DASHBOARD_ROUTE[profile!.role as AppRole] };
}
