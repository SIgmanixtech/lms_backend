import { AppError } from "@/lib/errors";

/**
 * Fixed-window limiter held in memory. It is per server instance (best effort on serverless),
 * so it slows brute force and abuse; it is not a quota. Keys never contain secrets.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 50_000;

export interface RateLimit { limit: number; windowMs: number }

export class RateLimitedError extends AppError {
  constructor(readonly retryAfterS: number) { super("RATE_LIMITED"); }
}

export function consume(key: string, { limit, windowMs }: RateLimit, now = Date.now()): { ok: boolean; retryAfterS: number } {
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    if (buckets.size >= MAX_KEYS) buckets.clear();
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return { ok: b.count <= limit, retryAfterS: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}

export function enforce(key: string, rule: RateLimit): void {
  const r = consume(key, rule);
  if (!r.ok) throw new RateLimitedError(r.retryAfterS);
}

/** Client IP from the platform proxy headers; used only as a rate-limit key. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || request.headers.get("x-real-ip") || "unknown").slice(0, 64);
}
