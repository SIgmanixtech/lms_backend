import type { AppRole } from "@/types/profile";

/**
 * Who may call an endpoint. Every `endpoint()` must declare one:
 *
 * | access      | path             | callers                                                        |
 * | ----------- | ---------------- | -------------------------------------------------------------- |
 * | `signed-in` | `/api/v1/auth/*` | any verified token, whatever the account state (own session, own password, access state) |
 * | `admin`     | `/api/v1/admin/*` | active admins                                                  |
 * | `trainer`   | `/api/v1/tutor/*` | active trainers                                                |
 * | `student`   | `/api/v1/student/*` | active students                                                |
 *
 * Each role has its own endpoints (ROLE_API in contracts.ts, handlers in src/api/role-handlers.ts). The
 * role is checked on the server for every request, from the caller's own profile row, before the
 * handler runs. Row Level Security and the services' own checks (e.g. "is this the class's tutor?")
 * still apply on top, so the role gate only ever narrows access.
 */
export type Access = "signed-in" | AppRole;

/** The verified caller's role, available to handlers of role endpoints. */
export interface Caller {
  role: AppRole;
}

/** Pure decision, kept separate so it can be tested without a database. */
export function roleAllowed(role: AppRole, profile: { role: string; account_status: string } | null): profile is { role: AppRole; account_status: "active" } {
  return !!profile && profile.account_status === "active" && profile.role === role;
}
