import { beforeEach, describe, expect, it, vi } from "vitest";
import { cronAuthorized } from "@backend/server/delivery/cron-auth";
import { generateTemporaryPassword } from "@backend/server/accounts/accounts.server";
import { createStudentSchema } from "@/features/accounts/schemas/account.schemas";

const sendEmail = vi.fn();
const sendPush = vi.fn();
vi.mock("@backend/server/delivery/resend.server", () => ({ appUrl: () => "https://lms.example.in", sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock("@backend/server/delivery/fcm.server", () => ({ sendPush: (...a: unknown[]) => sendPush(...a) }));
const { processDueDeliveries } = await import("@backend/server/delivery/dispatcher.server");

type Row = Record<string, unknown>;
/** Minimal in-memory stand-in for the Supabase client used by the dispatcher. */
function fakeDb(state: { claim: Row[]; notification?: Row; profile?: Row; prefs?: Row[]; subs?: Row[] }) {
  const updates: { table: string; patch: Row; id: unknown }[] = [];
  const data: Record<string, unknown> = { notifications: state.notification ?? null, profiles: state.profile ?? null, notification_preferences: state.prefs ?? [], push_subscriptions: state.subs ?? [] };
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    let patch: Row | null = null;
    Object.assign(q, {
      select: () => q, is: () => q,
      eq: (_c: string, v: unknown) => { if (patch) { updates.push({ table, patch, id: v }); return Promise.resolve({ error: null }); } return q; },
      update: (p: Row) => { patch = p; return q; },
      maybeSingle: () => Promise.resolve({ data: data[table] }),
      then: (r: (v: unknown) => unknown) => r({ data: data[table] }),
    });
    return q;
  };
  return { db: { rpc: () => Promise.resolve({ data: state.claim, error: null }), from } as never, updates };
}
const note = { id: "n1", recipient_id: "u1", category: "assignment", title: "T", body: "B", link: "/student/assignments" };
const active = { email: "s@x.in", account_status: "active" };
const final = (u: { table: string; patch: Row }[]) => u.filter((x) => x.table === "notification_deliveries").at(-1)?.patch;

beforeEach(() => { sendEmail.mockReset(); sendPush.mockReset(); });

describe("delivery queue", () => {
  it("sends email and records sent", async () => {
    sendEmail.mockResolvedValue({ kind: "sent", ref: "r1" });
    const { db, updates } = fakeDb({ claim: [{ id: "d1", notification_id: "n1", channel: "email", attempts: 1 }], notification: note, profile: active });
    expect(await processDueDeliveries(db)).toMatchObject({ claimed: 1, sent: 1 });
    expect(final(updates)).toMatchObject({ status: "sent", provider_ref: "r1" });
  });
  it("skips when the preference is off", async () => {
    const { db, updates } = fakeDb({ claim: [{ id: "d1", notification_id: "n1", channel: "email", attempts: 1 }], notification: note, profile: active, prefs: [{ category: "assignment", email_enabled: false, push_enabled: true }] });
    expect((await processDueDeliveries(db)).skipped).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled(); expect(final(updates)).toMatchObject({ status: "skipped" });
  });
  it("skips inactive recipients", async () => {
    const { db } = fakeDb({ claim: [{ id: "d1", notification_id: "n1", channel: "email", attempts: 1 }], notification: note, profile: { ...active, account_status: "inactive" } });
    expect((await processDueDeliveries(db)).skipped).toBe(1);
  });
  it("retries transient failures with backoff, then gives up at the cap", async () => {
    sendEmail.mockResolvedValue({ kind: "transient", reason: "Email provider unavailable (503)" });
    const a = fakeDb({ claim: [{ id: "d1", notification_id: "n1", channel: "email", attempts: 1 }], notification: note, profile: active });
    expect((await processDueDeliveries(a.db)).retrying).toBe(1); expect(final(a.updates)).toMatchObject({ status: "pending" });
    const b = fakeDb({ claim: [{ id: "d1", notification_id: "n1", channel: "email", attempts: 5 }], notification: note, profile: active });
    expect((await processDueDeliveries(b.db)).failed).toBe(1); expect(final(b.updates)).toMatchObject({ status: "failed" });
  });
  it("records permanent failures without retry and sanitizes the reason", async () => {
    sendEmail.mockResolvedValue({ kind: "permanent", reason: "rejected Bearer secret.token.value" });
    const { db, updates } = fakeDb({ claim: [{ id: "d1", notification_id: "n1", channel: "email", attempts: 1 }], notification: note, profile: active });
    expect((await processDueDeliveries(db)).failed).toBe(1);
    expect(String(final(updates)?.["last_error"])).not.toContain("secret.token.value");
  });
  it("disables a dead push token and fails the delivery", async () => {
    sendPush.mockResolvedValue({ kind: "permanent", reason: "Device token is no longer valid" });
    const { db, updates } = fakeDb({ claim: [{ id: "d1", notification_id: "n1", channel: "push", attempts: 1 }], notification: note, profile: active, subs: [{ id: "s1", endpoint: "https://fcm.googleapis.com/fcm/send/tok" }] });
    expect((await processDueDeliveries(db)).failed).toBe(1);
    expect(updates.find((u) => u.table === "push_subscriptions")?.patch).toMatchObject({ disabled_reason: "unregistered" });
  });
  it("skips push with no registered browser", async () => {
    const { db } = fakeDb({ claim: [{ id: "d1", notification_id: "n1", channel: "push", attempts: 1 }], notification: note, profile: active });
    expect((await processDueDeliveries(db)).skipped).toBe(1); expect(sendPush).not.toHaveBeenCalled();
  });
  it("an empty claim (another worker took the rows) sends nothing", async () => {
    const { db } = fakeDb({ claim: [] });
    expect(await processDueDeliveries(db)).toMatchObject({ claimed: 0, sent: 0 }); expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("cron authorization", () => {
  it("rejects when no secret is configured", () => expect(cronAuthorized("Bearer x", [undefined])).toBe(false));
  it("rejects a missing or wrong token", () => { expect(cronAuthorized(null, ["s3cret"])).toBe(false); expect(cronAuthorized("Bearer nope", ["s3cret"])).toBe(false); });
  it("accepts either configured secret", () => { expect(cronAuthorized("Bearer s3cret", ["s3cret", undefined])).toBe(true); expect(cronAuthorized("Bearer v", [undefined, "v"])).toBe(true); });
});

describe("account input", () => {
  const base = { full_name: "Asha K", email: " Asha@Example.IN ", phone: "098765 43210", course_id: crypto.randomUUID(), batch_id: crypto.randomUUID(), education: "B.Tech" };
  it("normalizes email and Indian phone", () => { const r = createStudentSchema.parse(base); expect(r.email).toBe("asha@example.in"); expect(r.phone).toBe("+919876543210"); });
  it("rejects missing course/batch and bad phone", () => { expect(createStudentSchema.safeParse({ ...base, course_id: "" }).success).toBe(false); expect(createStudentSchema.safeParse({ ...base, phone: "123" }).success).toBe(false); });
  it("ignores a browser-supplied code or role", () => { const r = createStudentSchema.parse({ ...base, student_code: "HACK", role: "admin" }) as Record<string, unknown>; expect(r["student_code"]).toBeUndefined(); expect(r["role"]).toBeUndefined(); });
  it("temporary passwords are strong and unique", () => {
    const set = new Set(Array.from({ length: 200 }, () => generateTemporaryPassword()));
    expect(set.size).toBe(200);
    for (const p of set) expect(p).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{16}$/);
  });
});
