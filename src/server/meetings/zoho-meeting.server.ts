import {
  classifyZoho, sanitizeZohoError, durationMs, parseParticipants, parseRecordings, parseSession, readZohoConfig, zohoStartTime, ZohoError,
  type ZohoConfig, type ZohoParticipant, type ZohoRecording, type ZohoSession,
} from "@/features/meetings/services/zoho-policy";

/**
 * Server-only Zoho Meeting adapter. Isolated from LMS rules; never logs or
 * returns credentials. Endpoints follow Zoho's official Meeting API docs.
 */

let cachedToken: { value: string; expiresAt: number; forClient: string; forToken: string } | null = null;
const TIMEOUT_MS = 15_000;

export function zohoStatus(): { configured: boolean; missing: string[] } {
  const { missing } = readZohoConfig(process.env);
  return { configured: missing.length === 0, missing };
}

function config(): ZohoConfig {
  const { config: c, missing } = readZohoConfig(process.env);
  if (!c) throw new ZohoError("not_configured", `Zoho Meeting is not configured (missing: ${missing.join(", ")})`);
  return c;
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  catch { throw new ZohoError("transient", "Zoho could not be reached"); }
  finally { clearTimeout(timer); }
}

/** Refresh-token grant. The access token lives only in memory for this worker. */
async function accessToken(c: ZohoConfig, force = false): Promise<string> {
  if (!force && cachedToken && cachedToken.forClient === c.clientId && cachedToken.forToken === c.refreshToken.slice(-12) && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const body = new URLSearchParams({ refresh_token: c.refreshToken, client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token" });
  const res = await timedFetch(`${c.accountsBase}/oauth/v2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    if (res.status === 429 || res.status >= 500) throw new ZohoError("transient", `Zoho sign-in unavailable (${res.status})`, res.status);
    throw new ZohoError("auth", `Zoho sign-in failed${json.error ? ` (${String(json.error).slice(0, 40)})` : ""}`, res.status);
  }
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000, forClient: c.clientId, forToken: c.refreshToken.slice(-12) };
  return json.access_token;
}

async function call(path: string, init: { method: string; body?: unknown } = { method: "GET" }): Promise<unknown> {
  const c = config();
  const send = async (token: string) => timedFetch(`${c.apiBase}${path}`, {
    method: init.method,
    headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json;charset=UTF-8" },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  let res = await send(await accessToken(c));
  if (res.status === 401) res = await send(await accessToken(c, true)); // token revoked/expired early
  if (res.status === 204) return null;
  let text = await res.text().catch(() => "");
  // A warm worker may hold an access token minted from an older refresh token with fewer scopes.
  if (!res.ok && /INVALID_OAUTHSCOPE/i.test(text)) {
    res = await send(await accessToken(c, true));
    if (res.status === 204) return null;
    text = await res.text().catch(() => "");
  }
  if (!res.ok) {
    const err = classifyZoho(res.status, text);
    console.warn("[zoho]", init.method, path.replace(/\d{6,}/g, ":id"), err.kind, res.status);
    throw err;
  }
  try { return text ? JSON.parse(text) : null; } catch { throw new ZohoError("permanent", "Zoho returned a non-JSON response"); }
}

export interface MeetingInput { topic: string; agenda?: string | null; classDate: string; startTime: string; endTime: string }

function sessionBody(c: ZohoConfig, m: MeetingInput) {
  return { session: {
    topic: m.topic.slice(0, 200), ...(m.agenda ? { agenda: m.agenda.slice(0, 1000) } : {}),
    presenter: Number(c.presenterId), startTime: zohoStartTime(m.classDate, m.startTime),
    duration: durationMs(m.startTime, m.endTime), timezone: "Asia/Calcutta",
  } };
}

/** POST /{zsoid}/sessions.json */
export async function createMeeting(m: MeetingInput): Promise<ZohoSession> {
  const c = config();
  return parseSession(await call(`/api/v2/${encodeURIComponent(c.orgId)}/sessions.json`, { method: "POST", body: sessionBody(c, m) }));
}

/** GET /{zsoid}/sessions/{meetingKey}.json — also the only source of the presenter start link. */
export async function getMeeting(meetingKey: string): Promise<ZohoSession> {
  const c = config();
  return parseSession(await call(`/api/v2/${encodeURIComponent(c.orgId)}/sessions/${encodeURIComponent(meetingKey)}.json`));
}

/** PUT /{zsoid}/sessions/{meetingKey}.json */
export async function updateMeeting(meetingKey: string, m: MeetingInput): Promise<ZohoSession> {
  const c = config();
  return parseSession(await call(`/api/v2/${encodeURIComponent(c.orgId)}/sessions/${encodeURIComponent(meetingKey)}.json`, { method: "PUT", body: sessionBody(c, m) }));
}

/** DELETE /{zsoid}/sessions/{meetingKey}.json — a meeting that is already gone counts as cancelled. */
export async function deleteMeeting(meetingKey: string): Promise<void> {
  const c = config();
  try { await call(`/api/v2/${encodeURIComponent(c.orgId)}/sessions/${encodeURIComponent(meetingKey)}.json`, { method: "DELETE" }); }
  catch (e) { if (!(e instanceof ZohoError && e.kind === "not_found")) throw e; }
}

/** GET /{zsoid}/participant/{meetingKey}.json?index&count — paged until all rows are read (bounded). */
export async function getParticipants(meetingKey: string): Promise<ZohoParticipant[]> {
  const c = config();
  const all: ZohoParticipant[] = [];
  const count = 100;
  for (let index = 1; index <= 20; index++) {
    const page = parseParticipants(await call(`/api/v2/${encodeURIComponent(c.orgId)}/participant/${encodeURIComponent(meetingKey)}.json?index=${index}&count=${count}`));
    all.push(...page.participants);
    if (page.participants.length < count || all.length >= page.total) break;
  }
  return all;
}

/** GET /meeting/api/v2/{zsoid}/recordings.json, filtered to one meeting. */
export async function getRecordingsForMeeting(meetingKey: string): Promise<ZohoRecording[]> {
  const c = config();
  const list = parseRecordings(await call(`/meeting/api/v2/${encodeURIComponent(c.orgId)}/recordings.json`));
  return list.filter((r) => r.meetingKey === meetingKey);
}

/**
 * GET {downloadUrl} (scopes ZohoMeeting.meetinguds.READ + ZohoFiles.files.READ). Streams the
 * recording file with the caller's Range header; nothing is stored. Errors are classified.
 */
export async function fetchRecordingFile(downloadUrl: string, range: string | null): Promise<Response> {
  const c = config();
  const once = (token: string) => timedFetch(downloadUrl, { method: "GET", headers: { Authorization: `Zoho-oauthtoken ${token}`, ...(range ? { Range: range } : {}) } });
  // Zoho's file host occasionally drops a connection; one quick retry keeps a single media chunk from failing playback.
  const send = async (token: string) => {
    try { return await once(token); }
    catch (e) {
      if (!(e instanceof ZohoError) || e.kind !== "transient") throw e;
      console.warn("[zoho] GET recording file: connection failed, retrying once");
      await new Promise((r) => setTimeout(r, 300));
      return once(token);
    }
  };
  let res = await send(await accessToken(c));
  if (res.status === 401) res = await send(await accessToken(c, true));
  if (res.status >= 500) { await res.body?.cancel().catch(() => undefined); res = await send(await accessToken(c)); }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = classifyZoho(res.status, text);
    console.warn("[zoho] GET recording file", err.kind, res.status);
    throw err;
  }
  return res;
}

/**
 * Admin diagnostic: GET /api/v2/user.json. Returns only the org/user IDs and a
 * sanitized Zoho error code — never tokens or raw responses.
 */
export async function checkZohoIdentity(): Promise<{
  signIn: "ok" | "failed"; httpStatus: number | null; zohoCode: string | null;
  zsoid: string | null; zuid: string | null; orgIdMatches: boolean | null; presenterIdMatches: boolean | null;
}> {
  const c = config();
  let token: string;
  try { token = await accessToken(c, true); }
  catch (e) { return { signIn: "failed", httpStatus: e instanceof ZohoError ? e.status ?? null : null, zohoCode: e instanceof ZohoError ? sanitizeZohoError(e.message) : null, zsoid: null, zuid: null, orgIdMatches: null, presenterIdMatches: null }; }
  const res = await timedFetch(`${c.apiBase}/api/v2/user.json`, { method: "GET", headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  const u = (json["userDetails"] ?? json) as Record<string, unknown>;
  const zsoid = u["zsoid"] != null ? String(u["zsoid"]) : null;
  const zuid = u["zuid"] != null ? String(u["zuid"]) : null;
  const err = (json["error"] ?? {}) as Record<string, unknown>;
  const code = !res.ok ? sanitizeZohoError(String(err["code"] ?? json["code"] ?? "") + " " + String(err["message"] ?? json["message"] ?? "").slice(0, 150)).trim() || null : null;
  return { signIn: "ok", httpStatus: res.status, zohoCode: code, zsoid, zuid,
    orgIdMatches: zsoid ? zsoid === c.orgId : null, presenterIdMatches: zuid ? zuid === c.presenterId : null };
}
