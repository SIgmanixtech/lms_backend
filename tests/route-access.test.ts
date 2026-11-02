import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { API_ROUTES, APP_ROLES, DATA_TABLES, ROLE_API, ROLE_FUNCTIONS, ROLE_SEGMENT, roleApiPath, tableMethods, tableSegment, type RoleOperation } from "@/lib/api/contracts";
import { serve } from "@backend/api/data-routes";
import { ROLE_HANDLERS } from "@backend/api/role-handlers";

const ROOT = "src/app";
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const routes = walk(path.join(ROOT, "api"))
  .filter((f) => f.endsWith("route.ts"))
  .map((f) => ({ url: "/" + path.relative(ROOT, path.dirname(f)).split(path.sep).join("/"), source: readFileSync(f, "utf8") }));
const byUrl = new Map(routes.map((r) => [r.url, r.source]));
const OPS = Object.keys(ROLE_API) as RoleOperation[];

/** First `:param` is `[id]`, the second `[subId]` (Next needs one name per level). */
const folderOf = (template: string) => {
  let n = 0;
  return template.replace(/:\w+/g, () => (n++ === 0 ? "[id]" : "[subId]"));
};
const exportsMethod = (source: string, m: string) => source.includes(`export const ${m} = routes.${m}!`);

describe("role route files", () => {
  it("match contracts.ts exactly (npm run generate-routes -- --check)", () => {
    expect(() => execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "scripts/generate-role-routes.ts", "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it("give every role its own operations, and none it may not use", () => {
    for (const op of OPS) for (const role of APP_ROLES) {
      const def = ROLE_API[op];
      const source = byUrl.get(`/api/v1/${ROLE_SEGMENT[role]}/${folderOf(def.path)}`) ?? "";
      const allowed = (def.roles as readonly string[]).includes(role);
      expect(source.includes(`"op":"${op}"`), `${role} ${op}`).toBe(allowed);
      if (allowed) {
        expect(source).toContain(`serve("${role}"`);
        expect(exportsMethod(source, def.method), `${role} ${op}`).toBe(true);
      }
      expect(roleApiPath(role, op) !== null).toBe(allowed);
    }
  });

  it("give every role only its own tables and methods", () => {
    for (const role of APP_ROLES) for (const table of DATA_TABLES) {
      const { collection, item } = tableMethods(role, table);
      const col = byUrl.get(`/api/v1/${ROLE_SEGMENT[role]}/${tableSegment(table)}`) ?? "";
      const one = byUrl.get(`/api/v1/${ROLE_SEGMENT[role]}/${tableSegment(table)}/[id]`) ?? "";
      for (const m of ["GET", "POST", "PATCH", "DELETE"] as const) {
        if ((collection as string[]).includes(m)) expect(exportsMethod(col, m), `${role} ${m} ${table}`).toBe(true);
        if ((item as string[]).includes(m)) expect(exportsMethod(one, m), `${role} ${m} ${table}/:id`).toBe(true);
      }
      expect(col.includes(`"table":"${table}"`), `${role} ${table}`).toBe(collection.length > 0);
    }
  });

  it("keep answer keys and settings away from students", () => {
    for (const t of ["assessment_answer_keys", "assignment_answer_keys", "system_settings"] as const) {
      expect(byUrl.has(`/api/v1/student/${tableSegment(t)}`), t).toBe(false);
      expect(tableMethods("student", t).collection).toEqual([]);
    }
    expect(tableMethods("student", "payments").collection).toEqual(["GET"]);
    expect(tableMethods("trainer", "payments").collection).toEqual(["GET"]);
  });

  it("give every role only its own database functions", () => {
    for (const [fn, def] of Object.entries(ROLE_FUNCTIONS)) for (const role of APP_ROLES) {
      const source = byUrl.get(`/api/v1/${ROLE_SEGMENT[role]}/${def.path}`) ?? "";
      expect(source.includes(`"fn":"${fn}"`), `${role} ${fn}`).toBe((def.roles as readonly string[]).includes(role));
    }
  });

  it("refuse to bind an operation or function to a role that doesn't have it", () => {
    expect(Object.keys(ROLE_HANDLERS).sort()).toEqual([...OPS].sort());
    expect(() => serve("student", [{ op: "createClass" }])).toThrow();
    expect(() => serve("trainer", [{ op: "createStudent" }])).toThrow();
    expect(() => serve("admin", [{ fn: "start_assessment_attempt" }])).toThrow();
  });
});

describe("other routes", () => {
  it("only versioned role/session routes, public routes and health exist (no generic database route)", () => {
    for (const r of routes) expect(/^\/api\/(v1\/(auth|admin|tutor|student)\/|public\/)|^\/api\/health$/.test(r.url), r.url).toBe(true);
    expect(routes.some((r) => r.url.startsWith("/api/db"))).toBe(false);
  });

  it("serve every non-role path in the contract", () => {
    for (const p of Object.values(API_ROUTES)) expect(byUrl.has(p), p).toBe(true);
  });

  it("let any signed-in user reach the session routes", () => {
    for (const r of routes.filter((x) => x.url.startsWith("/api/v1/auth/") && x.source.includes("endpoint({")))
      expect(r.source, r.url).toContain('access: "signed-in"');
  });
});
