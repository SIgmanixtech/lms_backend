import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase sign-in and the profile lookup are faked; everything else (route, validation, limits) is real.
const signInWithPassword = vi.fn();
const signOut = vi.fn().mockResolvedValue({ error: null });
let profileRow: Record<string, unknown> | null = null;

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { signInWithPassword, signOut } }) }));
vi.mock("@backend/lib/supabase/admin", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: profileRow, error: null }) }) }) }) },
}));
process.env["SUPABASE_URL"] = "https://example.supabase.co";
process.env["SUPABASE_PUBLISHABLE_KEY"] = "pk";

const { POST } = await import("@backend/app/api/auth/login/route");

let ipCounter = 0;
const call = (body: unknown, ip = `10.0.0.${++ipCounter}`) =>
  POST(new Request("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip, origin: "http://localhost:8080" }, body: JSON.stringify(body) }));
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 1, expires_in: 3600, token_type: "bearer" };
const ok = (id = "u1") => signInWithPassword.mockResolvedValue({ data: { session, user: { id, email: "x@y.in" } }, error: null });
const profile = (p: Record<string, unknown>) => { profileRow = { id: "u1", role: "student", account_status: "active", must_change_password: false, ...p }; };

beforeEach(() => { signInWithPassword.mockReset(); signOut.mockClear(); profileRow = null; });

describe("POST /api/auth/login", () => {
  it("returns the session and profile for an active account", async () => {
    ok(); profile({});
    const res = await call({ email: " Student@Example.IN ", password: "secret" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("active");
    expect(body.session.access_token).toBe("a.b.c");
    expect(body.profile.role).toBe("student");
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "student@example.in", password: "secret" });
  });

  it("lets a temporary-password account in so it can change the password", async () => {
    ok(); profile({ must_change_password: true });
    const body = await (await call({ email: "a@b.in", password: "temp" })).json();
    expect(body.state).toBe("must_change_password");
  });

  it("gives one generic message for a wrong email or password", async () => {
    signInWithPassword.mockResolvedValue({ data: { session: null, user: null }, error: { code: "invalid_credentials", status: 400 } });
    const res = await call({ email: "a@b.in", password: "nope" });
    expect(res.status).toBe(401);
    expect((await res.json()).error.message).toBe("Email or password is incorrect.");
  });

  it("refuses a deactivated (banned) account with a clear message", async () => {
    signInWithPassword.mockResolvedValue({ data: { session: null, user: null }, error: { code: "user_banned", status: 400 } });
    const res = await call({ email: "a@b.in", password: "x" });
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/inactive/);
  });

  it("refuses inactive and unprovisioned accounts and revokes the new session", async () => {
    ok(); profile({ account_status: "inactive" });
    const r1 = await call({ email: "a@b.in", password: "x" });
    expect(r1.status).toBe(403);
    expect(JSON.stringify(await r1.json())).not.toContain("a.b.c");
    ok(); profileRow = null;
    const r2 = await call({ email: "c@d.in", password: "x" });
    expect(r2.status).toBe(403);
    expect(signOut).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed input before calling Supabase", async () => {
    const res = await call({ email: "not-an-email", password: "" });
    expect(res.status).toBe(400);
    expect(Object.keys((await res.json()).error.details)).toEqual(expect.arrayContaining(["email", "password"]));
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("rate limits repeated attempts on one email, even from different IPs", async () => {
    signInWithPassword.mockResolvedValue({ data: { session: null, user: null }, error: { code: "invalid_credentials", status: 400 } });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await call({ email: "target@b.in", password: `guess${i}` })).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect(signInWithPassword).toHaveBeenCalledTimes(10);
  });

  it("refuses requests from other websites", async () => {
    const res = await POST(new Request("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ email: "a@b.in", password: "x" }) }));
    expect(res.status).toBe(403);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
