import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Supabase Auth and the profile lookup are faked; routes, validation, limits and file rules are real.
const refreshSession = vi.fn();
const adminSignOut = vi.fn().mockResolvedValue({ error: null });
let profileRow: Record<string, unknown> | null = null;

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { refreshSession } }) }));
vi.mock("@backend/lib/supabase/admin", () => ({
  supabaseAdmin: {
    auth: { admin: { signOut: (...a: unknown[]) => adminSignOut(...a) } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: profileRow, error: null }) }) }) }),
  },
}));
vi.mock("@backend/lib/supabase/auth", () => ({
  authenticate: async (request: Request) => {
    if (request.headers.get("authorization") !== "Bearer user.jwt.token") { const { AppError } = await import("@/lib/errors"); throw new AppError("AUTHENTICATION_ERROR"); }
    return { userId: "u1", supabase: {}, claims: { sub: "u1" } };
  },
}));
process.env["SUPABASE_URL"] = "https://proj.supabase.co";
process.env["SUPABASE_PUBLISHABLE_KEY"] = "server-publishable-key";

const refresh = await import("@backend/app/api/auth/refresh/route");
const logout = await import("@backend/app/api/auth/logout/route");
const files = await import("@backend/app/api/public/files/route");
const { resolveSignedFile } = await import("@backend/lib/http/db-gateway");

const O = "http://localhost:8080";
let ip = 0;
const post = (handler: (r: Request) => Promise<Response>, url: string, body: unknown, headers: Record<string, string> = {}) =>
  handler(new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", origin: O, "x-forwarded-for": `10.1.0.${++ip}`, ...headers }, body: JSON.stringify(body) }));
const session = { access_token: "new.access.token", refresh_token: "r2", expires_at: 2, expires_in: 3600, token_type: "bearer" };

beforeEach(() => { refreshSession.mockReset(); adminSignOut.mockClear(); profileRow = { role: "student", account_status: "active", must_change_password: false }; });

describe("POST /api/auth/refresh", () => {
  it("returns a renewed session for an active account", async () => {
    refreshSession.mockResolvedValue({ data: { session, user: { id: "u1", email: "a@b.in" } }, error: null });
    const res = await post(refresh.POST, "/api/auth/refresh", { refreshToken: "r1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ session, user: { id: "u1", email: "a@b.in" } });
    expect(refreshSession).toHaveBeenCalledWith({ refresh_token: "r1" });
  });
  it("refuses an expired or revoked refresh token", async () => {
    refreshSession.mockResolvedValue({ data: { session: null, user: null }, error: { status: 400, code: "refresh_token_not_found" } });
    const res = await post(refresh.POST, "/api/auth/refresh", { refreshToken: "old" });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("AUTHENTICATION_ERROR");
  });
  it("refuses and revokes when the account was deactivated since sign-in", async () => {
    refreshSession.mockResolvedValue({ data: { session, user: { id: "u1", email: null } }, error: null });
    profileRow = { role: "student", account_status: "inactive", must_change_password: false };
    const res = await post(refresh.POST, "/api/auth/refresh", { refreshToken: "r1" });
    expect(res.status).toBe(401);
    expect(adminSignOut).toHaveBeenCalledWith("new.access.token", "local");
  });
  it("validates the body", async () => {
    const res = await post(refresh.POST, "/api/auth/refresh", { refreshToken: "" });
    expect(res.status).toBe(400);
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the caller's current session", async () => {
    const res = await post(logout.POST, "/api/auth/logout", {}, { authorization: "Bearer user.jwt.token" });
    expect(res.status).toBe(200);
    expect(adminSignOut).toHaveBeenCalledWith("user.jwt.token", "local");
  });
  it("requires a signed-in caller", async () => {
    const res = await post(logout.POST, "/api/auth/logout", {});
    expect(res.status).toBe(401);
    expect(adminSignOut).not.toHaveBeenCalled();
  });
});

describe("GET /api/public/files", () => {
  const upstream = vi.fn();
  beforeEach(() => { upstream.mockReset(); vi.stubGlobal("fetch", upstream); });
  afterEach(() => vi.unstubAllGlobals());
  const get = (q: string, headers: Record<string, string> = {}) => files.GET(new Request(`http://localhost/api/public/files?${q}`, { headers: { "x-forwarded-for": `10.2.0.${++ip}`, ...headers } }));

  it("streams a signed file from storage with its type, forwarding Range", async () => {
    upstream.mockResolvedValue(new Response("PDF", { status: 206, headers: { "content-type": "application/pdf", "content-range": "bytes 0-2/3" } }));
    const res = await get("bucket=certificates&path=s1%2Fc1.pdf&token=abc.def.ghi", { range: "bytes=0-2" });
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("PDF");
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBeNull();
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe("https://proj.supabase.co/storage/v1/object/sign/certificates/s1/c1.pdf?token=abc.def.ghi");
    expect(new Headers(init.headers).get("range")).toBe("bytes=0-2");
    expect(new Headers(init.headers).get("authorization")).toBeNull();
  });
  it("sandboxes and downloads files that could run script", async () => {
    upstream.mockResolvedValue(new Response("<script>", { status: 200, headers: { "content-type": "text/html" } }));
    const res = await get("bucket=submissions&path=a%2Fb.html&token=t");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("content-disposition")).toBe("attachment");
  });
  it("turns a rejected or expired token into a friendly 404", async () => {
    upstream.mockResolvedValue(new Response(JSON.stringify({ error: "InvalidJWT" }), { status: 400 }));
    const res = await get("bucket=avatars&path=u%2Fme.png&token=t");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
  it.each([
    ["bucket=secret&path=a%2Fb&token=t"],
    ["bucket=avatars&path=..%2Fx&token=t"],
    ["bucket=avatars&path=a%2F%2Fb&token=t"],
    ["bucket=avatars&path=a%2Fb"],
    ["bucket=avatars&path=a%2Fb&token=x%26y%3D1"],
  ])("refuses %s without calling storage", async (q) => {
    const res = await get(q);
    expect(res.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("path rules match the gateway's", () => {
    expect(resolveSignedFile("recordings", "c1/r1.mp4", "a.b-c_d")).toBe("storage/v1/object/sign/recordings/c1/r1.mp4?token=a.b-c_d");
    expect(() => resolveSignedFile("recordings", "c1/./r1.mp4", "t")).toThrow();
  });
});
