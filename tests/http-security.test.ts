import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { API_ROUTES } from "@/lib/api/contracts";
import { AppError } from "@/lib/errors";
import { readJson } from "@backend/lib/http/body";
import { corsHeaders, preflight } from "@backend/lib/http/cors";
import { consume } from "@backend/lib/http/rate-limit";
import { parseWith } from "@backend/services/validation";

// Tokens name the caller's profile: "<role>.<status>.token" (e.g. "trainer.active.token").
// "good.token.value" is a signed-in user with no role check needed.
const profileOf = (request: Request) => {
  const m = /^Bearer (admin|trainer|student)\.(active|inactive)\.token$/.exec(request.headers.get("authorization") ?? "");
  return m ? { role: m[1]!, account_status: m[2]! } : null;
};
vi.mock("@backend/lib/supabase/auth", async () => {
  const { roleAllowed } = await import("@backend/lib/http/access");
  return {
    authenticate: async (request: Request) => {
      const header = request.headers.get("authorization");
      if (header !== "Bearer good.token.value" && !profileOf(request)) throw new AppError("AUTHENTICATION_ERROR");
      return { supabase: {}, userId: "11111111-1111-1111-1111-111111111111", claims: { sub: "11111111-1111-1111-1111-111111111111" }, profile: profileOf(request) };
    },
    // Same decision as the real gate, from the profile the fake token carries.
    authorizeCaller: async (auth: { profile: { role: string; account_status: string } | null }, role: "admin" | "trainer" | "student") => {
      if (!roleAllowed(role, auth.profile)) throw new AppError("AUTHORIZATION_ERROR");
      return { role: auth.profile!.role };
    },
  };
});
const { endpoint } = await import("@backend/lib/http/endpoint");

const ALLOWED = "http://localhost:8080";
const req = (init: RequestInit & { origin?: string; token?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.origin) headers.set("origin", init.origin);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  return new Request("http://api.test/api/x", { method: "POST", ...init, headers });
};

describe("API contract", () => {
  it("every frontend API path has a backend route handler", () => {
    for (const path of Object.values(API_ROUTES)) expect(existsSync(`src/app${path}/route.ts`), path).toBe(true);
  });
});

describe("CORS", () => {
  it("echoes only allowlisted origins and never allows credentials", () => {
    const ok = corsHeaders(req({ origin: ALLOWED }), "POST");
    expect(ok["Access-Control-Allow-Origin"]).toBe(ALLOWED);
    expect(ok["Access-Control-Allow-Credentials"]).toBeUndefined();
    expect(corsHeaders(req({ origin: "https://evil.example" }), "POST")["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(preflight(req({ origin: "https://evil.example" }), "POST").status).toBe(403);
    expect(preflight(req({ origin: ALLOWED }), "POST").status).toBe(204);
  });
});

describe("rate limit", () => {
  it("blocks after the limit within the window and resets after it", () => {
    const rule = { limit: 2, windowMs: 1000 };
    expect(consume("k", rule, 0).ok).toBe(true);
    expect(consume("k", rule, 1).ok).toBe(true);
    expect(consume("k", rule, 2).ok).toBe(false);
    expect(consume("k", rule, 1001).ok).toBe(true);
  });
});

describe("JSON body", () => {
  it("rejects oversized, non-JSON and malformed bodies", async () => {
    await expect(readJson(req({ body: "x".repeat(50), headers: { "content-type": "application/json" } }), 10)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(readJson(req({ body: "a=1", headers: { "content-type": "application/x-www-form-urlencoded" } }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(readJson(req({ body: "{", headers: { "content-type": "application/json" } }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(readJson(req({ body: '{"a":1}', headers: { "content-type": "application/json" } }))).resolves.toEqual({ a: 1 });
  });
});

describe("endpoint wrapper", () => {
  const route = endpoint({ method: "POST", access: "signed-in", input: parseWith(z.object({ id: z.string().uuid() })) }, async ({ data }) => {
    if (data.id === "00000000-0000-0000-0000-000000000000") throw new Error("relation public.secret does not exist");
    return { got: data.id };
  });
  const json = { "content-type": "application/json" };
  const id = "22222222-2222-2222-2222-222222222222";

  it("requires a valid bearer token", async () => {
    const res = await route.handle(req({ body: JSON.stringify({ id }), headers: json }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("AUTHENTICATION_ERROR");
  });
  it("refuses requests from non-allowlisted browser origins", async () => {
    const res = await route.handle(req({ origin: "https://evil.example", token: "good.token.value", body: JSON.stringify({ id }), headers: json }));
    expect(res.status).toBe(403);
  });
  it("validates input with field details", async () => {
    const res = await route.handle(req({ token: "good.token.value", body: JSON.stringify({ id: "nope" }), headers: json }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.details.id).toBeDefined();
  });
  it("returns the result with no-store and CORS for allowed origins", async () => {
    const res = await route.handle(req({ origin: ALLOWED, token: "good.token.value", body: JSON.stringify({ id }), headers: json }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ got: id });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
  });
  it("never leaks internal error messages", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await route.handle(req({ token: "good.token.value", body: JSON.stringify({ id: "00000000-0000-0000-0000-000000000000" }), headers: json }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("public.secret");
    expect(body.error.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("role-based access", () => {
  let ran = 0;
  const ROLES = ["admin", "trainer", "student"] as const;
  const make = (access: (typeof ROLES)[number]) =>
    endpoint({ method: "GET", access }, async ({ caller }) => { ran++; return { role: caller?.role }; });
  const call = (route: ReturnType<typeof make>, token: string) => route.handle(new Request("http://api.test/api/x", { method: "GET", headers: { authorization: `Bearer ${token}` } }));

  for (const access of ROLES) {
    it(`${access} endpoints admit only ${access}s`, async () => {
      const route = make(access);
      for (const role of ROLES) {
        ran = 0;
        const res = await call(route, `${role}.active.token`);
        if (role === access) {
          expect(res.status, `${role} on ${access}`).toBe(200);
          expect(await res.json()).toEqual({ role });
        } else {
          expect(res.status, `${role} on ${access}`).toBe(403);
          expect((await res.json()).error.code).toBe("AUTHORIZATION_ERROR");
          expect(ran, "handler must not run").toBe(0);
        }
      }
    });
  }

  it("refuses inactive accounts on every role endpoint", async () => {
    for (const access of ROLES) expect((await call(make(access), `${access}.inactive.token`)).status).toBe(403);
  });
  it("refuses a token with no LMS profile", async () => {
    expect((await call(make("student"), "good.token.value")).status).toBe(403);
  });
});

describe("REST input", () => {
  const echo = (method: "GET" | "PATCH" | "DELETE") =>
    endpoint({ method, access: "signed-in", pathParams: () => ({ id: "from-path" }), input: (raw) => raw }, async ({ data }) => data);
  const call = (method: string, url: string, body?: unknown) =>
    new Request(url, { method, headers: { authorization: "Bearer good.token.value", ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });

  it("GET and DELETE read the query string, PATCH the JSON body, and path params override both", async () => {
    expect(await (await echo("GET").handle(call("GET", "http://api.test/api/v1/x?read=unread&page=2"))).json()).toEqual({ read: "unread", page: "2", id: "from-path" });
    expect(await (await echo("DELETE").handle(call("DELETE", "http://api.test/api/v1/x"))).json()).toEqual({ id: "from-path" });
    expect(await (await echo("PATCH").handle(call("PATCH", "http://api.test/api/v1/x", { status: "active", id: "from-body" }))).json()).toEqual({ status: "active", id: "from-path" });
  });
});
