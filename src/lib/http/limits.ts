import type { RateLimit } from "./rate-limit";

/** Password verification: slows guessing of the current password. */
export const PASSWORD: RateLimit = { limit: 5, windowMs: 15 * 60_000 };
/** Admin account/status/destructive operations. */
export const ADMIN_WRITE: RateLimit = { limit: 30, windowMs: 60_000 };
/** Calls that reach the Zoho API, so one user can't exhaust the shared Zoho quota. */
export const ZOHO: RateLimit = { limit: 30, windowMs: 60_000 };
/** Large uploads. */
export const UPLOAD: RateLimit = { limit: 20, windowMs: 60_000 };
/** Sign-in attempts per client IP (covers password spraying across many emails). */
export const LOGIN_IP: RateLimit = { limit: 20, windowMs: 15 * 60_000 };
/** Sign-in attempts per email address (covers guessing one account's password from many IPs). */
export const LOGIN_EMAIL: RateLimit = { limit: 10, windowMs: 15 * 60_000 };
/** Public endpoints guarded by a shared secret, keyed by IP. */
export const PUBLIC_SECRET: RateLimit = { limit: 10, windowMs: 15 * 60_000 };
