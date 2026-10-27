import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveTarget } from "@backend/lib/http/db-gateway";

// Token verification is faked (real verification is covered elsewhere); Supabase is a fetch spy.
vi.mock("@backend/lib/supabase/auth", () => ({
  authenticate: async (request: Request) => {
    const h = request.headers.get("authorization") ?? "";
    if (h !== "Bearer user.jwt.token") { const { AppError } = await import("@/lib/errors"); throw new AppError("AUTHENTICATION_ERROR"); }
    return { userId: "user-1", supabase: {}, claims: { sub: "user-1" } };
  },
}));
process.env["SUPABASE_URL"] = "https://proj.supabase.co";
process.env["SUPABASE_PUBLISHABLE_KEY"] = "server-publishable-key";
const route = await import("@backend/app/api/db/[...path]/route");

const upstream = vi.fn();
beforeEach(() => { upstream.mockReset(); upstream.mockResolvedValue(new Response(JSON.stringify([{ id: 1 }]), { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/1" } })); vi.stubGlobal("fetch", upstream); });
afterEach(() => vi.unstubAllGlobals());

const O = "http://localhost:8080";
const req = (path: string, init: RequestInit & { token?: string | null } = {}) => {
  const headers = new Headers(init.headers);
  headers.set("origin", headers.get("origin") ?? O);
  if (init.token !== null) headers.set("authorization", `Bearer ${init.token ?? "user.jwt.token"}`);
  return new Request(`http://localhost${path}`, { ...init, headers });
};

describe("gateway path rules", () => {
  it("accepts tables, RPCs and storage objects", () => {
    expect(resolveTarget("/api/db/rest/v1/students", "GET").logPath).toBe("/api/db/rest/v1/students");
    expect(resolveTarget("/api/db/rest/v1/rpc/submit_assignment_answers", "POST").logPath).toBe("/api/db/rest/v1/rpc/submit_assignment_answers");
    expect(resolveTarget("/api/db/storage/v1/object/avatars/u1/me.png", "POST").logPath).toBe("/api/db/storage/v1/object/avatars/…");
    expect(resolveTarget("/api/db/storage/v1/object/sign/submissions/a/b.pdf", "POST").logPath).toBe("/api/db/storage/v1/object/sign/submissions/…");
  });
  it.each([
    ["/api/db/rest/v1/", "GET"], // OpenAPI schema listing
    ["/api/db/rest/v1/Students;drop", "GET"],
    ["/api/db/rest/v1/rpc/x/y", "POST"],
    ["/api/db/rest/v1/rpc/run_class_reminders", "DELETE"],
    ["/api/db/auth/v1/admin/users", "GET"],
    ["/api/db/storage/v1/bucket", "GET"],
    ["/api/db/storage/v1/object/list/avatars", "POST"],
    ["/api/db/storage/v1/object/avatars/..%2F..%2Fsecret", "GET"],
    ["/api/db/storage/v1/object/avatars/a/../../b", "GET"],
    ["/api/db/rest/v2/students", "GET"],
  ])("refuses %s %s", (path, method) => {
    expect(() => resolveTarget(path, method)).toThrow();
  });
});

describe("gateway forwarding", () => {
  it("forwards as the caller with the server's key, the query string and safe headers", async () => {
    const res = await route.GET(req("/api/db/rest/v1/students?select=id&id=eq.5", { headers: { prefer: "count=exact", apikey: "client-sent-key", cookie: "x=1" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-range")).toBe("0-0/1");
    expect(res.headers.get("access-control-allow-origin")).toBe(O);
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe("https://proj.supabase.co/rest/v1/students?select=id&id=eq.5");
    const h = new Headers(init.headers);
    expect(h.get("authorization")).toBe("Bearer user.jwt.token");
    expect(h.get("apikey")).toBe("server-publishable-key");
    expect(h.get("prefer")).toBe("count=exact");
    expect(h.get("cookie")).toBeNull();
  });

  it("forwards write bodies unchanged and passes database errors through", async () => {
    upstream.mockResolvedValue(new Response(JSON.stringify({ code: "42501", message: "new row violates row-level security policy" }), { status: 403, headers: { "content-type": "application/json" } }));
    const res = await route.POST(req("/api/db/rest/v1/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "x" }) }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("42501");
    const body = upstream.mock.calls[0]![1].body as ArrayBuffer;
    expect(Buffer.from(body).toString()).toBe('{"title":"x"}');
  });

  it("refuses requests without a signed-in user (including the public anon key)", async () => {
    expect((await route.GET(req("/api/db/rest/v1/students", { token: null }))).status).toBe(401);
    expect((await route.GET(req("/api/db/rest/v1/students", { token: "anon-publishable-key" }))).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses other websites, other schemas and blocked paths before reaching Supabase", async () => {
    expect((await route.GET(req("/api/db/rest/v1/students", { headers: { origin: "https://evil.example" } }))).status).toBe(403);
    expect((await route.GET(req("/api/db/rest/v1/users", { headers: { "accept-profile": "auth" } }))).status).toBe(403);
    expect((await route.GET(req("/api/db/rest/v1/"))).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("returns no body for HEAD (row counts)", async () => {
    const res = await route.HEAD(req("/api/db/rest/v1/students?select=id", { method: "HEAD" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  it("writes one access-log line with the table and user, never the query or file name", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await route.GET(req("/api/db/rest/v1/profiles?email=eq.someone%40mail.com"));
      await route.POST(req("/api/db/storage/v1/object/avatars/u1/Ramesh-Passport.png", { method: "POST", headers: { "content-type": "image/png" }, body: new Uint8Array([1, 2, 3]) }));
      const lines = spy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('"type":"access"')).map((l) => JSON.parse(l));
      expect(lines.map((l) => l.path)).toEqual(["/api/db/rest/v1/profiles", "/api/db/storage/v1/object/avatars/…"]);
      expect(lines.every((l) => l.user === "user-1")).toBe(true);
      expect(JSON.stringify(lines)).not.toMatch(/someone|Ramesh|Passport/);
    } finally { spy.mockRestore(); }
  });

  it("answers CORS preflight with the headers the Supabase client sends", async () => {
    const res = route.OPTIONS(new Request("http://localhost/api/db/rest/v1/students", { method: "OPTIONS", headers: { origin: O } }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).toMatch(/apikey.*prefer.*accept-profile.*x-client-info/);
  });
});
