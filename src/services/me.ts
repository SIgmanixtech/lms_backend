import { AppError } from "@/lib/errors";
import type { MarkAllReadResult, MarkReadResult, MyNotificationsResult, MyProfileResult, UnreadCountResult } from "@/lib/api/contracts";
import { applyNotificationFilters } from "@/features/notifications/services/notification-filters";
import { NOTIFICATIONS_PAGE_SIZE, type MyNotificationsInput } from "@/features/notifications/schemas/notification.schemas";
import type { Notification } from "@/types/notification";
import type { Profile } from "@/types/profile";
import type { AuthContext } from "@backend/lib/supabase/auth";

/**
 * The caller's own profile (/api/v1/<role>/profile) and notifications (/api/v1/<role>/notifications/*).
 * Everything runs as the caller (RLS-scoped client) and is also filtered to their own id, so a
 * request can never read or change another user's rows.
 */

const dbError = (error: { code?: string }) =>
  new AppError(error.code === "42501" ? "AUTHORIZATION_ERROR" : "DATABASE_ERROR", undefined, { cause: error });

// The notifications filter helper is written against a minimal query interface; the typed client is used untyped here.
type Db = { from: (t: string) => any };
const asDb = (auth: AuthContext) => auth.supabase as unknown as Db;

/** GET /api/v1/<admin|tutor|student>/profile: the caller's own profile (the route has already checked the role). */
export async function getMyProfile(auth: AuthContext): Promise<MyProfileResult> {
  const { data, error } = await auth.supabase.from("profiles").select("*").eq("id", auth.userId).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new AppError("AUTHORIZATION_ERROR", "Your sign-in is valid, but no LMS profile is assigned to this account.");
  const email = typeof auth.claims.email === "string" ? auth.claims.email : null;
  return { userId: auth.userId, email, profile: data as Profile };
}

/** POST /api/common/notifications: one filtered page, newest first. */
export async function listMyNotifications(auth: AuthContext, input: MyNotificationsInput): Promise<MyNotificationsResult> {
  const from = (input.page - 1) * NOTIFICATIONS_PAGE_SIZE;
  const base = asDb(auth).from("notifications").select("*", { count: "exact" }).eq("recipient_id", auth.userId);
  const res = await applyNotificationFilters(base, input.filters).order("created_at", { ascending: false }).range(from, from + NOTIFICATIONS_PAGE_SIZE - 1);
  if (res.error) throw dbError(res.error);
  return { rows: (res.data ?? []) as Notification[], count: res.count ?? 0 };
}

/** GET /api/common/notifications/unread-count (independent of any page filters). */
export async function countMyUnread(auth: AuthContext): Promise<UnreadCountResult> {
  const { count, error } = await asDb(auth).from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", auth.userId).is("read_at", null);
  if (error) throw dbError(error);
  return { unread: count ?? 0 };
}

/**
 * POST /api/common/notifications/read. Only the caller's own row can change (recipient filter + RLS
 * + the read_at-only column grant); a row that wasn't updated and isn't already read is a failure,
 * never reported as success.
 */
export async function markMyNotificationRead(auth: AuthContext, input: { id: string }): Promise<MarkReadResult> {
  const db = asDb(auth);
  const now = new Date().toISOString();
  const { data, error } = await db.from("notifications").update({ read_at: now }).eq("id", input.id).eq("recipient_id", auth.userId).is("read_at", null).select("id, read_at");
  if (error) throw dbError(error);
  if (data?.length) return { id: input.id, readAt: data[0].read_at as string };
  const { data: existing, error: readError } = await db.from("notifications").select("read_at").eq("id", input.id).eq("recipient_id", auth.userId).maybeSingle();
  if (readError) throw dbError(readError);
  if (existing?.read_at) return { id: input.id, readAt: existing.read_at as string };
  throw new AppError("NOT_FOUND", "That notification couldn't be updated.");
}

/** POST /api/common/notifications/read-all: marks every unread notification of the caller read. */
export async function markAllMyNotificationsRead(auth: AuthContext): Promise<MarkAllReadResult> {
  const { data, error } = await asDb(auth).from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", auth.userId).is("read_at", null).select("id");
  if (error) throw dbError(error);
  return { marked: data?.length ?? 0 };
}
