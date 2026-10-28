import { AppError } from "@/lib/errors";
import { errorResponse, withAccessLog } from "@backend/lib/http/endpoint";
import { corsHeaders, preflight } from "@backend/lib/http/cors";
import { clientIp, enforce } from "@backend/lib/http/rate-limit";
import { FILES_IP } from "@backend/lib/http/limits";
import { resolveSignedFile } from "@backend/lib/http/db-gateway";
import { requireEnv } from "@backend/lib/supabase/fetch";

/**
 * Streams a private-storage file to the browser: GET /api/public/files?bucket=&path=&token=.
 * Public prefix because <img>, <a> and new tabs can't send a bearer token. The short-lived
 * signed token was issued by Storage only after its policies allowed the caller, and Storage
 * checks it again here, so this route grants nothing by itself.
 * Files are user uploads served from the API's origin, so they are sandboxed (no scripts) and
 * never sniffed as another type.
 */
const METHODS = "GET, HEAD, OPTIONS";
const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];

async function handle(request: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  return withAccessLog(request, correlationId, async (_setUser, setPath) => {
    try {
      const url = new URL(request.url);
      const bucket = url.searchParams.get("bucket");
      setPath(`/api/public/files/${bucket && /^[a-z-]{1,40}$/.test(bucket) ? bucket : "?"}/…`);
      enforce(`files:ip:${clientIp(request)}`, FILES_IP);
      const upstreamPath = resolveSignedFile(bucket, url.searchParams.get("path"), url.searchParams.get("token"));
      const download = url.searchParams.get("download") === "1";

      const [supabaseUrl, publishableKey] = requireEnv("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY") as [string, string];
      const headers = new Headers({ apikey: publishableKey });
      const range = request.headers.get("range");
      if (range && range.length < 100) headers.set("range", range);
      let upstream: Response;
      try {
        upstream = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/${upstreamPath}${download ? "&download" : ""}`, {
          method: request.method === "HEAD" ? "HEAD" : "GET", headers, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(60_000),
        });
      } catch (cause) {
        throw new AppError("INTEGRATION_UNAVAILABLE", "The file couldn't be reached. Please try again.", { cause });
      }
      if (upstream.status === 400 || upstream.status === 401 || upstream.status === 403 || upstream.status === 404) {
        await upstream.body?.cancel().catch(() => undefined);
        throw new AppError("NOT_FOUND", "This file link has expired or the file isn't available. Go back and open it again.");
      }
      if (!upstream.ok) {
        await upstream.body?.cancel().catch(() => undefined);
        throw new AppError("INTEGRATION_UNAVAILABLE", "The file couldn't be loaded. Please try again.");
      }

      const out = new Headers({
        ...corsHeaders(request, METHODS),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex",
        "X-Correlation-Id": correlationId,
      });
      for (const h of PASS_HEADERS) { const v = upstream.headers.get(h); if (v) out.set(h, v); }
      // PDFs, images, audio and video render inline (Chrome won't show a PDF in a sandbox).
      // Anything that could run script here (HTML, SVG, XML, unknown) is sandboxed and downloaded.
      const type = (out.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      const inlineSafe = type === "application/pdf" || (/^(image|video|audio)\//.test(type) && !type.includes("svg"));
      if (!inlineSafe) out.set("Content-Security-Policy", "default-src 'none'; sandbox");
      if (download || !inlineSafe) out.set("Content-Disposition", "attachment");
      if (request.method === "HEAD") { await upstream.body?.cancel().catch(() => undefined); return new Response(null, { status: upstream.status, headers: out }); }
      return new Response(upstream.body, { status: upstream.status, headers: out });
    } catch (error) {
      return errorResponse(request, METHODS, error, correlationId);
    }
  });
}

export const dynamic = "force-dynamic";
export const GET = handle;
export const HEAD = handle;
export const OPTIONS = (request: Request) => preflight(request, METHODS);
