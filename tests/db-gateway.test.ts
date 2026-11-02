import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

// Role data endpoints (/api/v1/<role>/<table>, functions, files). Token verification and the role gate are
// faked from the token ("<role>.jwt.token"); the database is a fetch spy.
vi.mock("@backend/lib/supabase/auth", () => ({
  authenticate: async (request: Request) => {
    const m = /^Bearer (admin|trainer|student)\.jwt\.token$/.exec(request.headers.get("authorization") ?? "");
    if (!m) throw new AppError("AUTHENTICATION_ERROR");
    return { userId: `${m[1]}-1`, supabase: {}, claims: { sub: `${m[1]}-1` }, role: m[1] };
  },
  authorizeCaller: async (auth: { role: string }, role: string) => {
    if (auth.role !== role) throw new AppError("AUTHORIZATION_ERROR");
    return { role };
  },
}));
process.env["SUPABASE_URL"] = "https://proj.supabase.co";
process.env["SUPABASE_PUBLISHABLE_KEY"] = "server-publishable-key";

const adminEnrollments = await import("@backend/app/api/v1/admin/enrollments/route");
const adminCourses = await import("@backend/app/api/v1/admin/courses/route");
const adminBatchItem = await import("@backend/app/api/v1/admin/batches/[id]/route");
const studentEnrollments = await import("@backend/app/api/v1/student/enrollments/route");
const studentSubmissions = await import("@backend/app/api/v1/student/submissions/route");
const studentStart = await import("@backend/app/api/v1/student/assessments/attempts/start/route");
const studentUpload = await import("@backend/app/api/v1/student/files/[...path]/route");
const tutorSign = await import("@backend/app/api/v1/tutor/files/sign/[...path]/route");
const adminProfiles = await import("@backend/app/api/v1/admin/profiles/route");
const adminFilesUpload = await import("@backend/app/api/v1/admin/files/[...path]/route");

const upstream = vi.fn();
beforeEach(() => { upstream.mockReset(); upstream.mockResolvedValue(new Response(JSON.stringify([{ id: 1 }]), { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/1" } })); vi.stubGlobal("fetch", upstream); });
afterEach(() => vi.unstubAllGlobals());

const O = "http://localhost:8080";
const req = (path: string, init: RequestInit & { token?: string | null } = {}) => {
  const headers = new Headers(init.headers);
  headers.set("origin", headers.get("origin") ?? O);
  if (init.token !== null) headers.set("authorization", `Bearer ${init.token ?? "admin.jwt.token"}`);
  return new Request(`http://localhost${path}`, { ...init, headers });
};

describe("role table endpoints", () => {
  it("forward a page of rows as the caller with the server's key, the query and safe headers", async () => {
    const res = await adminEnrollments.GET(req("/api/v1/admin/enrollments?select=*&order=created_at.desc&offset=0&limit=25", { headers: { prefer: "count=exact", apikey: "client-sent-key", cookie: "x=1" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-range")).toBe("0-0/1");
    expect(res.headers.get("access-control-allow-origin")).toBe(O);
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe("https://proj.supabase.co/rest/v1/enrollments?select=*&order=created_at.desc&offset=0&limit=25");
    const h = new Headers(init.headers);
    expect(h.get("authorization")).toBe("Bearer admin.jwt.token");
    expect(h.get("apikey")).toBe("server-publishable-key");
    expect(h.get("prefer")).toBe("count=exact");
    expect(h.get("cookie")).toBeNull();
  });

  it("serve one row by id at /<table>/:id, with no query string", async () => {
    await adminBatchItem.PATCH(req("/api/v1/admin/batches/b-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x" }) }));
    expect(upstream.mock.calls[0]![0]).toBe("https://proj.supabase.co/rest/v1/batches?id=eq.b-1");
    await adminBatchItem.GET(req("/api/v1/admin/batches/b-1"));
    expect(upstream.mock.calls[1]![0]).toBe("https://proj.supabase.co/rest/v1/batches?id=eq.b-1");
  });

  it("refuse any query on a single-record route (records are fetched by id only)", async () => {
    for (const q of ["?select=*", "?id=eq.other", "?status=eq.draft"]) {
      const res = await adminBatchItem.GET(req(`/api/v1/admin/batches/b-1${q}`));
      expect(res.status, q).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forward write bodies unchanged and pass database errors through", async () => {
    upstream.mockResolvedValue(new Response(JSON.stringify({ code: "42501", message: "new row violates row-level security policy" }), { status: 403, headers: { "content-type": "application/json" } }));
    const res = await adminCourses.POST(req("/api/v1/admin/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "x" }) }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("42501");
    expect(Buffer.from(upstream.mock.calls[0]![1].body as ArrayBuffer).toString()).toBe('{"title":"x"}');
  });

  it("accept only their own role, and only signed-in users", async () => {
    expect((await adminEnrollments.GET(req("/api/v1/admin/enrollments", { token: "student.jwt.token" }))).status).toBe(403);
    expect((await studentEnrollments.GET(req("/api/v1/student/enrollments", { token: "admin.jwt.token" }))).status).toBe(403);
    expect((await adminEnrollments.GET(req("/api/v1/admin/enrollments", { token: null }))).status).toBe(401);
    expect((await adminEnrollments.GET(req("/api/v1/admin/enrollments", { token: "anon-publishable-key" }))).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
    expect((await studentEnrollments.GET(req("/api/v1/student/enrollments", { token: "student.jwt.token" }))).status).toBe(200);
  });

  it("expose only the methods the role is allowed", () => {
    expect(studentEnrollments).not.toHaveProperty("POST");
    expect(studentEnrollments).not.toHaveProperty("DELETE");
    expect(studentSubmissions.POST).toBeTypeOf("function");
    expect(studentSubmissions).not.toHaveProperty("DELETE");
  });

  it("refuse other websites and other schemas before reaching the database", async () => {
    expect((await adminEnrollments.GET(req("/api/v1/admin/enrollments", { headers: { origin: "https://evil.example" } }))).status).toBe(403);
    expect((await adminEnrollments.GET(req("/api/v1/admin/enrollments", { headers: { "accept-profile": "auth" } }))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("return no body for HEAD (row counts)", async () => {
    const res = await adminEnrollments.HEAD(req("/api/v1/admin/enrollments?select=id", { method: "HEAD" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });
});

describe("role functions and files", () => {
  it("run a database function at its named path", async () => {
    await studentStart.POST(req("/api/v1/student/assessments/attempts/start", { method: "POST", token: "student.jwt.token", headers: { "content-type": "application/json" }, body: "{}" }));
    expect(upstream.mock.calls[0]![0]).toBe("https://proj.supabase.co/rest/v1/rpc/start_assessment_attempt");
  });

  it("upload only to the role's buckets, and sign links in any app bucket", async () => {
    const png = { method: "POST", headers: { "content-type": "image/png" }, body: new Uint8Array([1, 2, 3]) };
    expect((await studentUpload.POST(req("/api/v1/student/files/avatars/u1/a.png", { ...png, token: "student.jwt.token" }))).status).toBe(200);
    expect(upstream.mock.calls[0]![0]).toBe("https://proj.supabase.co/storage/v1/object/avatars/u1/a.png");
    expect((await studentUpload.POST(req("/api/v1/student/files/certificates/u1/a.pdf", { ...png, token: "student.jwt.token" }))).status).toBe(403);
    expect((await studentUpload.POST(req("/api/v1/student/files/avatars/..%2F..%2Fsecret", { ...png, token: "student.jwt.token" }))).status).toBe(404);
    await tutorSign.POST(req("/api/v1/tutor/files/sign/recordings/c/k.mp4", { method: "POST", token: "trainer.jwt.token", headers: { "content-type": "application/json" }, body: "{}" }));
    expect(upstream.mock.calls.at(-1)![0]).toBe("https://proj.supabase.co/storage/v1/object/sign/recordings/c/k.mp4");
  });

  it("write one access-log line with the role path and user, never the query or file name", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await adminProfiles.GET(req("/api/v1/admin/profiles?email=eq.someone%40mail.com"));
      await adminFilesUpload.POST(req("/api/v1/admin/files/avatars/u1/Ramesh-Passport.png", { method: "POST", headers: { "content-type": "image/png" }, body: new Uint8Array([1, 2, 3]) }));
      const lines = spy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('"type":"access"')).map((l) => JSON.parse(l));
      expect(lines.map((l) => l.path)).toEqual(["/api/v1/admin/profiles", "/api/v1/admin/files/avatars/…"]);
      expect(lines.every((l) => l.user === "admin-1")).toBe(true);
      expect(JSON.stringify(lines)).not.toMatch(/someone|Ramesh|Passport/);
    } finally { spy.mockRestore(); }
  });

  it("answer CORS preflight with the headers the data client sends", () => {
    const res = adminEnrollments.OPTIONS(new Request("http://localhost/api/v1/admin/enrollments", { method: "OPTIONS", headers: { origin: O } }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).toMatch(/apikey.*prefer.*accept-profile.*x-client-info/);
    expect(res.headers.get("access-control-allow-methods")).toMatch(/GET.*POST.*PATCH.*DELETE/);
  });
});
