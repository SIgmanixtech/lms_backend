import { AppError } from "@/lib/errors";

/** Path rules and limits for the data gateway (/api/db). See src/app/api/db/[...path]/route.ts. */
export const METHODS = "GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS";
export const ALLOW_HEADERS = "authorization, apikey, content-type, prefer, range, range-unit, accept, accept-profile, content-profile, x-client-info, x-upsert, cache-control";
export const PREFIX = "/api/db/";
export const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
export const REST_MAX_BODY = 2 * 1024 * 1024;
export const STORAGE_MAX_BODY = 55 * 1024 * 1024; // largest upload in the app is a 50 MB recording
export const FORWARD_REQUEST_HEADERS = ["content-type", "prefer", "range", "range-unit", "accept", "accept-profile", "content-profile", "x-client-info", "x-upsert", "cache-control"];
export const FORWARD_RESPONSE_HEADERS = ["content-type", "content-range", "preference-applied", "etag", "last-modified", "accept-ranges"];

export interface Target { upstreamPath: string; logPath: string; maxBody: number }

/** Validates the path after /api/db/ and returns where to forward it, or throws. */
export function resolveTarget(pathname: string, method: string): Target {
  if (!pathname.startsWith(PREFIX)) throw new AppError("NOT_FOUND");
  const raw = pathname.slice(PREFIX.length).split("/");
  let segs: string[];
  try { segs = raw.map((s) => decodeURIComponent(s)); } catch { throw new AppError("VALIDATION_ERROR"); }
  // Each segment must stay one segment: no encoded slashes, no "." / ".." anywhere, no control characters.
  if (segs.some((s) => s === "" || s === "." || s.includes("..") || /[/\\\u0000-\u001f]/.test(s))) throw new AppError("NOT_FOUND");
  const enc = segs.map(encodeURIComponent).join("/");

  // PostgREST: /rest/v1/<table>  or  /rest/v1/rpc/<function>
  if (segs[0] === "rest" && segs[1] === "v1") {
    const rest = segs.slice(2);
    if (rest.length === 1 && IDENT.test(rest[0]!)) return { upstreamPath: enc, logPath: `${PREFIX}rest/v1/${rest[0]}`, maxBody: REST_MAX_BODY };
    if (rest.length === 2 && rest[0] === "rpc" && IDENT.test(rest[1]!) && (method === "POST" || method === "GET" || method === "HEAD")) {
      return { upstreamPath: enc, logPath: `${PREFIX}rest/v1/rpc/${rest[1]}`, maxBody: REST_MAX_BODY };
    }
    throw new AppError("NOT_FOUND");
  }

  // Storage objects only: /storage/v1/object/<bucket>/<path...>  and  /storage/v1/object/sign/<bucket>/<path...>
  if (segs[0] === "storage" && segs[1] === "v1" && segs[2] === "object") {
    const rest = segs.slice(3);
    const signing = rest[0] === "sign";
    const bucketAt = signing ? 1 : 0;
    const bucket = rest[bucketAt];
    if (!bucket || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket) || rest.length < bucketAt + 2) throw new AppError("NOT_FOUND");
    if (["list", "move", "copy", "public", "authenticated", "info", "upload"].includes(bucket)) throw new AppError("NOT_FOUND");
    if (signing && method !== "POST") throw new AppError("NOT_FOUND");
    // File names are left out of the log; the bucket is enough to see what happened.
    return { upstreamPath: enc, logPath: `${PREFIX}storage/v1/object/${signing ? "sign/" : ""}${bucket}/…`, maxBody: STORAGE_MAX_BODY };
  }
  throw new AppError("NOT_FOUND");
}


/** Private buckets whose signed links may be downloaded through /api/public/files. */
export const FILE_BUCKETS = ["avatars", "course-resources", "submissions", "recordings", "certificates"] as const;

/**
 * Validates a signed-download request and returns the upstream storage path, or throws NOT_FOUND.
 * The signed token (issued by Storage after its policies allowed the caller) is the authorization.
 */
export function resolveSignedFile(bucket: string | null, path: string | null, token: string | null): string {
  if (!bucket || !(FILE_BUCKETS as readonly string[]).includes(bucket)) throw new AppError("NOT_FOUND");
  if (!token || token.length > 4096 || !/^[A-Za-z0-9_.-]+$/.test(token)) throw new AppError("NOT_FOUND");
  if (!path || path.length > 1024) throw new AppError("NOT_FOUND");
  const segs = path.split("/");
  if (segs.some((s) => s === "" || s === "." || s.includes("..") || /[\\\u0000-\u001f]/.test(s))) throw new AppError("NOT_FOUND");
  return `storage/v1/object/sign/${bucket}/${segs.map(encodeURIComponent).join("/")}?token=${encodeURIComponent(token)}`;
}
