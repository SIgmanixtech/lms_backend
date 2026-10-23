import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Checks a scheduler request's Bearer token against the configured cron secrets
 * (LOVABLE_CRON_SECRET, or CRON_SECRET sent by Vercel Cron). With no secret
 * configured, every request is rejected. Comparison is constant-time.
 */
export function cronAuthorized(authorization: string | null, secrets: (string | undefined)[]): boolean {
  const token = /^Bearer ([^\s,]+)$/.exec(authorization ?? "")?.[1];
  const configured = secrets.filter((s): s is string => !!s);
  if (!token || !configured.length) return false;
  const d = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return configured.some((s) => timingSafeEqual(d(token), d(s)));
}
