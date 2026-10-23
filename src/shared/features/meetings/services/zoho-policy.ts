/**
 * Pure Zoho Meeting rules shared by the server adapter and tests. No I/O, no secrets.
 * API reference: https://www.zoho.com/meeting/api-integration/meeting-api.html
 */

export type ZohoErrorKind = "not_configured" | "auth" | "scope" | "rate_limited" | "transient" | "not_found" | "permanent";

export class ZohoError extends Error {
  readonly kind: ZohoErrorKind;
  readonly status: number | undefined;
  constructor(kind: ZohoErrorKind, message: string, status?: number) {
    super(message);
    this.name = "ZohoError";
    this.kind = kind;
    this.status = status;
  }
  get retryable(): boolean { return this.kind === "rate_limited" || this.kind === "transient"; }
}

/** Classifies a Zoho HTTP failure. Auth problems are never retried automatically. */
export function classifyZoho(status: number, body: string): ZohoError {
  const text = body.slice(0, 2000);
  if (/INVALID_OAUTHSCOPE/i.test(text)) return new ZohoError("scope", "Zoho token is missing a required permission", status);
  if (/INVALID_OAUTHTOKEN|invalid_code|invalid_client|UNAUTHORIZED_USER|OAUTH_SCOPE_MISMATCH/i.test(text) || status === 401)
    return new ZohoError("auth", `Zoho rejected the credentials (${status})`, status);
  if (status === 429 || /too many requests|RATE_LIMIT/i.test(text)) return new ZohoError("rate_limited", "Zoho rate limit reached", status);
  if (status >= 500) return new ZohoError("transient", `Zoho is unavailable (${status})`, status);
  if (status === 404 || /INVALID_MEETING_KEY/i.test(text)) return new ZohoError("not_found", "Zoho meeting not found", status);
  if (status === 403) return new ZohoError("auth", "Zoho denied access to this organisation", status);
  return new ZohoError("permanent", `Zoho rejected the request (${status})`, status);
}

/** Short, credential-free error text safe to store in the database. */
export function sanitizeZohoError(text: string): string {
  return text
    .replace(/(Zoho-oauthtoken|Bearer)\s+[\w.\-~+/=]+/gi, "$1 [redacted]")
    .replace(/\b1000\.[a-f0-9]{16,}\.[a-f0-9]{16,}\b/gi, "[redacted]")
    .replace(/(refresh_token|client_secret|access_token|client_id)=[^&\s"]+/gi, "$1=[redacted]")
    .slice(0, 300);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Zoho expects "Jun 19, 2020 07:00 PM" in the meeting timezone. LMS class dates
 * and times are already organisation-local (Asia/Kolkata), so no conversion.
 */
export function zohoStartTime(classDate: string, startTime: string): string {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(classDate);
  const t = /^(\d{2}):(\d{2})/.exec(startTime);
  if (!d || !t) throw new ZohoError("permanent", "Invalid class date or time");
  const month = MONTHS[Number(d[2]) - 1];
  if (!month) throw new ZohoError("permanent", "Invalid class month");
  const h = Number(t[1]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${month} ${Number(d[3])}, ${d[1]} ${String(h12).padStart(2, "0")}:${t[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** Scheduled duration in milliseconds from "HH:MM[:SS]" strings on the same day. */
export function durationMs(startTime: string, endTime: string): number {
  const toMin = (v: string) => { const m = /^(\d{2}):(\d{2})/.exec(v); if (!m) throw new ZohoError("permanent", "Invalid time"); return Number(m[1]) * 60 + Number(m[2]); };
  const ms = (toMin(endTime) - toMin(startTime)) * 60_000;
  if (ms <= 0) throw new ZohoError("permanent", "End time must be after start time");
  return ms;
}

export interface ZohoConfig { clientId: string; clientSecret: string; refreshToken: string; accountsBase: string; apiBase: string; orgId: string; presenterId: string }

/** Reads server env. Returns the list of missing names instead of throwing, so callers can report "Not configured". */
export function readZohoConfig(env: Record<string, string | undefined>): { config: ZohoConfig | null; missing: string[] } {
  const pick = (k: string) => (env[k] ?? "").trim();
  const names = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ACCOUNTS_BASE_URL", "ZOHO_API_BASE_URL", "ZOHO_ORG_ID", "ZOHO_PRESENTER_ID"] as const;
  const missing = names.filter((n) => !pick(n));
  for (const n of ["ZOHO_ACCOUNTS_BASE_URL", "ZOHO_API_BASE_URL"] as const) if (pick(n) && !/^https:\/\//.test(pick(n))) missing.push(n);
  if (missing.length) return { config: null, missing };
  const trim = (v: string) => v.replace(/\/+$/, "");
  /** Zoho Meeting is not served from the generic zohoapis.* host (it 404s); map it to meeting.zoho.<dc>. */
  const meetingApiBase = (v: string) => v.replace(/^https:\/\/(?:www\.)?zohoapis\.([a-z.]+)$/i, "https://meeting.zoho.$1");
  return {
    missing: [],
    config: {
      clientId: pick("ZOHO_CLIENT_ID"), clientSecret: pick("ZOHO_CLIENT_SECRET"), refreshToken: pick("ZOHO_REFRESH_TOKEN"),
      accountsBase: trim(pick("ZOHO_ACCOUNTS_BASE_URL")), apiBase: meetingApiBase(trim(pick("ZOHO_API_BASE_URL")).replace(/\/(meeting\/)?api\/v2$/, "")),
      orgId: pick("ZOHO_ORG_ID"), presenterId: pick("ZOHO_PRESENTER_ID"),
    },
  };
}

export interface ZohoSession { meetingKey: string; joinLink: string; startLink: string | null; startTime: string | null; topic: string | null }

/** Normalises a Zoho session payload; rejects responses without a key or an https join link. */
export function parseSession(body: unknown): ZohoSession {
  const raw = (body as { session?: unknown })?.session;
  const s = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
  const key = s?.["meetingKey"];
  const join = s?.["joinLink"];
  if ((typeof key !== "string" && typeof key !== "number") || typeof join !== "string" || !/^https:\/\//.test(join))
    throw new ZohoError("permanent", "Zoho returned an unexpected meeting response");
  const start = s?.["startLink"];
  return {
    meetingKey: String(key), joinLink: join,
    startLink: typeof start === "string" && /^https:\/\//.test(start) ? start : null,
    startTime: typeof s?.["startTime"] === "string" ? (s["startTime"] as string) : null,
    topic: typeof s?.["topic"] === "string" ? (s["topic"] as string) : null,
  };
}

export interface ZohoParticipant { email: string | null; memberId: string | null; role: string | null; joinTime: number; leaveTime: number; durationMs: number }

export function parseParticipants(body: unknown): { total: number; participants: ZohoParticipant[] } {
  const b = body as { participantsCount?: unknown; participants?: unknown };
  const list = Array.isArray(b?.participants) ? (b.participants as Record<string, unknown>[]) : [];
  const participants = list.flatMap((p) => {
    const join = Number(p["joinTime"]); const leave = Number(p["leaveTime"]);
    if (!Number.isFinite(join) || join <= 0) return [];
    const safeLeave = Number.isFinite(leave) && leave >= join ? leave : join;
    return [{
      email: typeof p["email"] === "string" && p["email"] ? String(p["email"]).trim().toLowerCase() : null,
      memberId: p["memberId"] != null ? String(p["memberId"]) : null,
      role: typeof p["role"] === "string" ? String(p["role"]) : null,
      joinTime: join, leaveTime: safeLeave,
      durationMs: Number.isFinite(Number(p["duration"])) ? Number(p["duration"]) : safeLeave - join,
    }];
  });
  const total = Number(b?.participantsCount);
  return { total: Number.isFinite(total) ? total : participants.length, participants };
}

export interface ZohoRecording { id: string; meetingKey: string | null; playUrl: string | null; shareUrl: string | null; downloadUrl: string | null; durationMs: number | null; startMs: number | null; topic: string | null; generating: boolean }

/** Only Zoho-owned https hosts may be fetched server-side with a Zoho token. */
export function isZohoFileUrl(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try { const h = new URL(u); return h.protocol === "https:" && /(^|\.)(zoho\.(in|com|eu|com\.au|jp)|zohopublic\.(in|com|eu|com\.au|jp))$/.test(h.hostname); } catch { return false; }
}

export function parseRecordings(body: unknown): ZohoRecording[] {
  const list = (body as { recordings?: unknown })?.recordings;
  if (!Array.isArray(list)) return [];
  return (list as Record<string, unknown>[]).flatMap((r) => {
    const id = r["erecordingId"] ?? r["id"];
    if (typeof id !== "string" && typeof id !== "number") return [];
    const key = r["meetingKey"] ?? r["short_meeting_key"];
    return [{
      id: String(id), meetingKey: key != null ? String(key) : null,
      playUrl: typeof r["playUrl"] === "string" && /^https:\/\//.test(r["playUrl"] as string) ? (r["playUrl"] as string) : null,
      shareUrl: typeof r["shareUrl"] === "string" && /^https:\/\/[a-z0-9.-]+\.zoho\.(in|com|eu)\//.test(r["shareUrl"] as string) ? (r["shareUrl"] as string) : null,
      downloadUrl: isZohoFileUrl(r["downloadUrl"]) ? (r["downloadUrl"] as string) : null,
      durationMs: Number.isFinite(Number(r["duration"])) ? Number(r["duration"]) : null,
      startMs: Number.isFinite(Number(r["startTimeinMs"])) ? Number(r["startTimeinMs"]) : null,
      topic: typeof r["topic"] === "string" ? (r["topic"] as string) : null,
      generating: r["isGenerating"] === true,
    }];
  });
}

/** Backoff for retryable Zoho failures: 2, 4, 8, 16, 32, 60 minutes. */
export function zohoBackoffMinutes(attempt: number): number {
  return Math.min(60, 2 ** Math.max(1, attempt));
}
