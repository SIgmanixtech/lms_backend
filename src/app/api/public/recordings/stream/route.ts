import { logged } from "@backend/lib/http/endpoint";
import { planRange, playerPage, totalFromContentRange, wantsPlayerPage } from "@/features/meetings/services/recording-range";
import { ZohoError } from "@/features/meetings/services/zoho-policy";
import { corsHeaders, preflight } from "@backend/lib/http/cors";
import { supabaseAdmin } from "@backend/lib/supabase/admin";
import { verifyRecordingTicket } from "@backend/server/meetings/recording-stream-token.server";
import { fetchRecordingFile, getRecordingsForMeeting } from "@backend/server/meetings/zoho-meeting.server";

/**
 * Streams a Zoho cloud recording to an authorized viewer. Public prefix because a <video>/tab
 * can't send a bearer token: the caller must present a short-lived signed ticket that
 * openZohoRecording issues only after RLS confirmed access. Nothing is stored.
 * A tab navigation gets a small player page; the <video> then fetches bounded byte ranges
 * (see recording-range.ts for why ranges are always explicit and capped).
 * CORS (allowlisted origins only) lets the in-page player probe a failed stream for its status.
 */
type Entry = { url: string; total: number | null; at: number };
const urlCache = new Map<string, Entry>();
const URL_TTL_MS = 10 * 60_000;
const METHODS = "GET, HEAD, OPTIONS";

async function handle(request: Request): Promise<Response> {
  const cors = corsHeaders(request, METHODS);
  const fail = (status: number, message: string, extra?: Record<string, string>) =>
    new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...cors, ...extra } });

  const reqUrl = new URL(request.url);
  const ticket = reqUrl.searchParams.get("t") ?? "";
  if (ticket.length > 512) return fail(403, "This recording link has expired. Go back to the LMS and click Watch recording again.");
  const recId = await verifyRecordingTicket(ticket);
  if (!recId) return fail(403, "This recording link has expired. Go back to the LMS and click Watch recording again.");
  const db = supabaseAdmin as unknown as { from: (t: string) => any };
  const range = request.headers.get("range");

  if (wantsPlayerPage(request.headers.get("accept"), range, reqUrl.searchParams.get("raw") === "1")) {
    const { data: rec } = await db.from("recordings").select("title").eq("id", recId).maybeSingle();
    if (!rec) return fail(404, "Recording not found.");
    const media = `${reqUrl.pathname}?t=${encodeURIComponent(ticket)}&raw=1`;
    return new Response(request.method === "HEAD" ? null : playerPage(String(rec.title ?? "Recording"), media), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" },
    });
  }

  try {
    let entry = urlCache.get(recId);
    if (!entry || Date.now() - entry.at > URL_TTL_MS) {
      const { data: rec } = await db.from("recordings").select("zoho_recording_id, class_id").eq("id", recId).maybeSingle();
      const { data: cls } = rec ? await db.from("classes").select("zoho_meeting_key").eq("id", rec.class_id).maybeSingle() : { data: null };
      if (!rec?.zoho_recording_id || !cls?.zoho_meeting_key) return fail(404, "Recording not found.");
      const match = (await getRecordingsForMeeting(cls.zoho_meeting_key)).find((r) => r.id === rec.zoho_recording_id);
      if (!match) return fail(404, "Zoho no longer has this recording.");
      if (match.generating) return fail(409, "Zoho is still processing this recording. Try again in a few minutes.");
      if (!match.downloadUrl) return fail(404, "Zoho has no playable file for this recording.");
      entry = { url: match.downloadUrl, total: entry?.url === match.downloadUrl ? entry.total : null, at: Date.now() };
      urlCache.set(recId, entry);
    }

    let plan = planRange(range, entry.total);
    if (plan.kind === "needs_size") {
      const probe = await fetchRecordingFile(entry.url, "bytes=0-0");
      await probe.body?.cancel().catch(() => undefined);
      entry.total = totalFromContentRange(probe.headers.get("content-range"));
      plan = entry.total == null ? { kind: "range", start: 0, end: null } : planRange(range, entry.total);
    }
    if (plan.kind !== "range") return fail(416, "Requested range not satisfiable.", entry.total != null ? { "Content-Range": `bytes */${entry.total}` } : {});

    const upstream = await fetchRecordingFile(entry.url, `bytes=${plan.start}-${plan.end ?? ""}`);
    const upstreamRange = upstream.headers.get("content-range");
    const total = totalFromContentRange(upstreamRange);
    if (total != null) entry.total = total;

    const headers = new Headers({ "Cache-Control": "private, no-store", "Content-Disposition": "inline", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", ...cors });
    const type = upstream.headers.get("content-type") ?? "";
    headers.set("Content-Type", type.startsWith("video/") || type.startsWith("audio/") ? type : "video/mp4");
    // Only forward well-formed framing headers; a malformed Content-Range/Length would break the connection.
    if (total != null && upstreamRange) headers.set("Content-Range", upstreamRange);
    const len = upstream.headers.get("content-length");
    if (len && /^\d+$/.test(len) && (upstream.status !== 206 || total != null)) headers.set("Content-Length", len);
    if (request.method === "HEAD") { await upstream.body?.cancel().catch(() => undefined); return new Response(null, { status: upstream.status, headers }); }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    urlCache.delete(recId);
    const kind = e instanceof ZohoError ? e.kind : "unknown";
    console.warn("[recording] stream failed", { recording: recId, kind, status: e instanceof ZohoError ? e.status : undefined });
    if (kind === "auth") return fail(502, "The LMS couldn't sign in to Zoho. An admin needs to reconnect Zoho.");
    if (kind === "scope") return fail(502, "The Zoho connection isn't allowed to play recordings yet. An admin needs to add recording file access to the Zoho token.");
    if (kind === "not_found") return fail(404, "Zoho no longer has this recording file.");
    if (kind === "rate_limited" || kind === "transient") return fail(503, "Zoho is busy or unreachable. Try again in a minute.");
    if (kind === "not_configured") return fail(503, "Zoho Meeting is not configured on this server.");
    return fail(502, "Zoho refused to play this recording. Contact an admin.");
  }
}

export const GET = logged(handle);
export const HEAD = logged(handle);
export const OPTIONS = (request: Request) => preflight(request, METHODS);
