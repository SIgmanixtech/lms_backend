import { beforeEach, describe, expect, it } from "vitest";
import { countMyUnread, getMyProfile, listMyNotifications, markAllMyNotificationsRead, markMyNotificationRead } from "@backend/services/me";
import type { AuthContext } from "@backend/lib/supabase/auth";

// A fake RLS-scoped client: records every builder call and answers from `state`.
const state: { update: unknown[]; error: unknown; existing: unknown; profile: unknown; calls: string[] } = { update: [], error: null, existing: null, profile: null, calls: [] };
function chain(): any {
  const c: any = new Proxy({}, {
    get: (_t, p: string) =>
      p === "then" ? (res: any, rej: any) => Promise.resolve({ data: state.update, error: state.error, count: 2 }).then(res, rej)
      : p === "maybeSingle" ? () => Promise.resolve({ data: state.calls.some((x) => x.startsWith("from:\"profiles\"")) ? state.profile : state.existing, error: null })
      : (...a: unknown[]) => (state.calls.push(`${p}:${JSON.stringify(a[0])}${a.length > 1 ? `:${JSON.stringify(a[1])}` : ""}`), c),
  });
  return c;
}
const ME = "11111111-1111-1111-1111-111111111111";
const auth = { userId: ME, claims: { sub: ME, email: "me@example.com" }, supabase: { from: (t: string) => (state.calls.push(`from:${JSON.stringify(t)}`), chain()) } } as unknown as AuthContext;

beforeEach(() => { state.update = []; state.error = null; state.existing = null; state.profile = null; state.calls = []; });

describe("common notification endpoints", () => {
  it("mark-read writes read_at only on the caller's own row and returns the stored value", async () => {
    state.update = [{ id: "a", read_at: "2026-09-30T11:00:00Z" }];
    await expect(markMyNotificationRead(auth, { id: "a" })).resolves.toEqual({ id: "a", readAt: "2026-09-30T11:00:00Z" });
    expect(state.calls.some((c) => c.startsWith("update:"))).toBe(true);
    expect(state.calls).toContain(`eq:"recipient_id":"${ME}"`);
  });
  it("a refused update is not treated as success", async () => {
    state.error = { code: "42501" };
    await expect(markMyNotificationRead(auth, { id: "a" })).rejects.toMatchObject({ code: "AUTHORIZATION_ERROR" });
  });
  it("another user's notification (0 rows, not visible) fails instead of pretending", async () => {
    await expect(markMyNotificationRead(auth, { id: "other" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("mark-all, unread count and list are scoped to the caller", async () => {
    state.update = [{ id: "a" }, { id: "b" }];
    await expect(markAllMyNotificationsRead(auth)).resolves.toEqual({ marked: 2 });
    expect(state.calls).toContain(`eq:"recipient_id":"${ME}"`);
    state.calls = [];
    await expect(countMyUnread(auth)).resolves.toEqual({ unread: 2 });
    expect(state.calls).toContain(`eq:"recipient_id":"${ME}"`);
    expect(state.calls).toContain('is:"read_at":null');
    state.calls = [];
    state.update = [{ id: "x" }];
    await expect(listMyNotifications(auth, { filters: { read: "unread", type: "", search: "" }, page: 2 })).resolves.toEqual({ rows: [{ id: "x" }], count: 2 });
    expect(state.calls).toContain(`eq:"recipient_id":"${ME}"`);
    expect(state.calls).toContain("range:25:49");
  });
});

describe("common profile endpoint", () => {
  it("returns the caller's own profile with the email from their token", async () => {
    state.profile = { id: ME, role: "student", account_status: "inactive" };
    await expect(getMyProfile(auth)).resolves.toEqual({ userId: ME, email: "me@example.com", profile: state.profile });
    expect(state.calls).toContain(`eq:"id":"${ME}"`);
  });
  it("refuses a sign-in with no LMS profile", async () => {
    await expect(getMyProfile(auth)).rejects.toMatchObject({ code: "AUTHORIZATION_ERROR" });
  });
});
