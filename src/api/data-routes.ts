import { AppError } from "@/lib/errors";
import { FILE_BUCKETS_ALL, ROLE_API, ROLE_FUNCTIONS, ROLE_SEGMENT, ROLE_UPLOAD_BUCKETS, tableMethods, tableSegment, type ApiMethod, type DataFunction, type DataTable, type RoleOperation } from "@/lib/api/contracts";
import type { AppRole } from "@/types/profile";
import { preflight } from "@backend/lib/http/cors";
import { ALLOW_HEADERS, REST_MAX_BODY, safeObjectPath, STORAGE_MAX_BODY } from "@backend/lib/http/db-gateway";
import { proxyAsCaller } from "@backend/lib/http/supabase-proxy";
import { ROLE_HANDLERS } from "./role-handlers";

/**
 * Role data endpoints: table rows, database functions and files for one role (lists in contracts.ts).
 * Each request runs as the user (see supabase-proxy.ts), after a server-side check of the exact role.
 */
type Handler = (request: Request) => Promise<Response>;
type HttpVerb = ApiMethod | "HEAD";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** `/api/v1/<role>/<table>`: a page of rows (select/filter/order/range in the query), inserts, filtered updates/deletes. */
function tableCollection(role: AppRole, table: DataTable, methods: string): Partial<Record<HttpVerb, Handler>> {
  const out: Partial<Record<HttpVerb, Handler>> = {};
  const handler: Handler = (request) => proxyAsCaller(request, role, methods, (url) => ({
    upstreamPath: `rest/v1/${table}${url.search}`, logPath: `/api/v1/${ROLE_SEGMENT[role]}/${tableSegment(table)}`, maxBody: REST_MAX_BODY,
  }));
  for (const m of tableMethods(role, table).collection) out[m] = handler;
  if (out.GET) out.HEAD = handler;
  return out;
}

/** `/api/v1/<role>/<table>/:id`: one row by id. */
function tableItem(role: AppRole, table: DataTable, methods: string): Partial<Record<HttpVerb, Handler>> {
  const out: Partial<Record<HttpVerb, Handler>> = {};
  const seg = tableSegment(table);
  const handler: Handler = (request) => proxyAsCaller(request, role, methods, (url) => {
    const id = decodeURIComponent(new RegExp(`/${seg}/([^/]+)/?$`).exec(url.pathname)?.[1] ?? "");
    if (!ID.test(id)) throw new AppError("NOT_FOUND");
    // Single records are addressed by id alone: no filters, fields or other query on this route.
    if (url.search) throw new AppError("VALIDATION_ERROR", "Single records are fetched by id only; send no query parameters.");
    return { upstreamPath: `rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, logPath: `/api/v1/${ROLE_SEGMENT[role]}/${seg}/:id`, maxBody: REST_MAX_BODY };
  });
  for (const m of tableMethods(role, table).item) out[m] = handler;
  if (out.GET) out.HEAD = handler;
  return out;
}

/** `/api/v1/<role>/<function path>`: one database function (POST). */
function functionRoute(role: AppRole, fn: DataFunction, methods: string): Partial<Record<HttpVerb, Handler>> {
  if (!(ROLE_FUNCTIONS[fn].roles as readonly AppRole[]).includes(role)) throw new Error(`${role} has no "${fn}" function`);
  return {
    POST: (request) => proxyAsCaller(request, role, methods, (url) => ({
      upstreamPath: `rest/v1/rpc/${fn}${url.search}`, logPath: `/api/v1/${ROLE_SEGMENT[role]}/${ROLE_FUNCTIONS[fn].path}`, maxBody: REST_MAX_BODY,
    })),
  };
}

/** `/api/v1/<role>/files/<bucket>/<path>` (upload) and `/api/v1/<role>/files/sign/<bucket>/<path>` (short-lived signed link). */
function filesRoute(role: AppRole, kind: "upload" | "sign", methods: string): Partial<Record<HttpVerb, Handler>> {
  const marker = kind === "sign" ? "/files/sign/" : "/files/";
  return {
    POST: (request) => proxyAsCaller(request, role, methods, (url) => {
      const tail = url.pathname.slice(url.pathname.indexOf(marker) + marker.length).split("/");
      const bucket = tail[0] ?? "";
      const allowed: readonly string[] = kind === "sign" ? FILE_BUCKETS_ALL : ROLE_UPLOAD_BUCKETS[role];
      if (!allowed.includes(bucket)) throw new AppError("AUTHORIZATION_ERROR");
      const object = safeObjectPath(tail.slice(1));
      return {
        upstreamPath: `storage/v1/object/${kind === "sign" ? "sign/" : ""}${bucket}/${object}${url.search}`,
        logPath: `/api/v1/${ROLE_SEGMENT[role]}/files/${kind === "sign" ? "sign/" : ""}${bucket}/…`,
        maxBody: kind === "sign" ? REST_MAX_BODY : STORAGE_MAX_BODY,
      };
    }),
  };
}

export type ServeEntry =
  | { op: RoleOperation }
  | { table: DataTable; scope: "collection" | "item" }
  | { fn: DataFunction }
  | { files: "upload" | "sign" };

/**
 * Everything one route file serves for one role: role operations (src/api/role-handlers.ts) and data
 * endpoints on the same path. Throws at build time if two entries claim the same method.
 */
export function serve(role: AppRole, entries: readonly ServeEntry[]): Partial<Record<HttpVerb, Handler>> & { OPTIONS: (request: Request) => Response } {
  // Methods are known before the handlers are built, so CORS answers list them all.
  const verbs = new Set<string>();
  const parts: Partial<Record<HttpVerb, Handler>>[] = [];
  const build = (methods: string) => entries.map((e): Partial<Record<HttpVerb, Handler>> => {
    if ("op" in e) {
      if (!(ROLE_API[e.op].roles as readonly AppRole[]).includes(role)) throw new Error(`${role} has no "${e.op}" endpoint`);
      return { [ROLE_API[e.op].method]: ROLE_HANDLERS[e.op](role).handle };
    }
    if ("table" in e) return e.scope === "collection" ? tableCollection(role, e.table, methods) : tableItem(role, e.table, methods);
    if ("fn" in e) return functionRoute(role, e.fn, methods);
    return filesRoute(role, e.files, methods);
  });
  for (const p of build("")) for (const m of Object.keys(p)) verbs.add(m);
  const methods = [...verbs, "OPTIONS"].join(", ");
  parts.push(...build(methods));
  const out: Partial<Record<HttpVerb, Handler>> = {};
  for (const p of parts) for (const [m, h] of Object.entries(p) as [HttpVerb, Handler][]) {
    if (out[m]) throw new Error(`${role}: two handlers for ${m} on the same path`);
    out[m] = h;
  }
  return { ...out, OPTIONS: (request: Request) => preflight(request, methods, ALLOW_HEADERS) };
}
