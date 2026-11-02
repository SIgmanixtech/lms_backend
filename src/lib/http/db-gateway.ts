import { AppError } from "@/lib/errors";

/**
 * Shared rules for the role data endpoints (/api/v1/<role>/<table>, functions and files; see
 * src/api/data-routes.ts and src/lib/http/supabase-proxy.ts) and for signed file downloads.
 */
export const ALLOW_HEADERS = "authorization, apikey, content-type, prefer, range, range-unit, accept, accept-profile, content-profile, x-client-info, x-upsert, cache-control";
export const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
export const REST_MAX_BODY = 2 * 1024 * 1024;
export const STORAGE_MAX_BODY = 55 * 1024 * 1024; // largest upload in the app is a 50 MB recording
export const FORWARD_REQUEST_HEADERS = ["content-type", "prefer", "range", "range-unit", "accept", "accept-profile", "content-profile", "x-client-info", "x-upsert", "cache-control"];
export const FORWARD_RESPONSE_HEADERS = ["content-type", "content-range", "preference-applied", "etag", "last-modified", "accept-ranges"];

/** A storage object path: each segment stays one segment (no encoded slashes, no "." / "..", no control characters). */
export function safeObjectPath(segments: string[]): string {
  let segs: string[];
  try { segs = segments.map((s) => decodeURIComponent(s)); } catch { throw new AppError("VALIDATION_ERROR"); }
  if (!segs.length || segs.length > 20 || segs.some((s) => s === "" || s === "." || s.includes("..") || /[/\\\u0000-\u001f]/.test(s))) throw new AppError("NOT_FOUND");
  return segs.map(encodeURIComponent).join("/");
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
