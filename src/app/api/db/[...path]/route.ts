import { AppError } from "@/lib/errors";
import { errorResponse, withAccessLog } from "@backend/lib/http/endpoint";
import { readRaw } from "@backend/lib/http/body";
import { corsHeaders, isAllowedOrigin, preflight } from "@backend/lib/http/cors";
import { clientIp, enforce } from "@backend/lib/http/rate-limit";
import { DB_IP, DB_USER } from "@backend/lib/http/limits";
import { authenticate } from "@backend/lib/supabase/auth";
import { ALLOW_HEADERS, FORWARD_REQUEST_HEADERS, FORWARD_RESPONSE_HEADERS, METHODS, PREFIX, resolveTarget } from "@backend/lib/http/db-gateway";
import { requireEnv } from "@backend/lib/supabase/fetch";

/**
 * Data gateway: the frontend's Supabase client sends every database (PostgREST) and file-storage
 * request here instead of straight to Supabase, so all module traffic passes through, and is logged
 * by, this backend.
 *
 * Security is unchanged from direct access, plus more checks in front:
 * - the request is forwarded AS THE CALLER (their own access token), so Row Level Security and
 *   Storage policies in the database still decide every read and write. The service-role key is
 *   never used here.
 * - only signed-in users (verified token), allowed origins, the public schema, table/RPC names and
 *   storage object paths are accepted; the API root (schema listing) and admin endpoints are refused.
 * - per-user and per-IP rate limits and body size caps apply; responses are never cached.
 */

async function handle(request: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  return withAccessLog(request, correlationId, async (setUser, setPath) => {
    try {
      const url = new URL(request.url);
      setPath(url.pathname.startsWith(PREFIX) ? `${PREFIX}${url.pathname.slice(PREFIX.length).split("/").slice(0, 3).join("/")}` : url.pathname);
      const origin = request.headers.get("origin");
      if (origin && !isAllowedOrigin(origin)) throw new AppError("AUTHORIZATION_ERROR");
      enforce(`db:ip:${clientIp(request)}`, DB_IP);

      // Verified Supabase user token required: the anon/publishable key alone is refused.
      const auth = await authenticate(request);
      setUser(auth.userId);
      enforce(`db:user:${auth.userId}`, DB_USER);

      const target = resolveTarget(url.pathname, request.method);
      setPath(target.logPath);
      for (const h of ["accept-profile", "content-profile"]) {
        const v = request.headers.get(h);
        if (v && v !== "public") throw new AppError("AUTHORIZATION_ERROR");
      }

      const [supabaseUrl, publishableKey] = requireEnv("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY") as [string, string];
      const headers = new Headers({ apikey: publishableKey, Authorization: request.headers.get("authorization")! });
      for (const h of FORWARD_REQUEST_HEADERS) { const v = request.headers.get(h); if (v) headers.set(h, v); }
      const hasBody = !["GET", "HEAD"].includes(request.method);
      const body = hasBody ? await readRaw(request, target.maxBody) : undefined;

      let upstream: Response;
      try {
        upstream = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/${target.upstreamPath}${url.search}`, {
          method: request.method, headers, ...(body ? { body } : {}), redirect: "manual", cache: "no-store",
          signal: AbortSignal.timeout(60_000),
        });
      } catch (cause) {
        throw new AppError("INTEGRATION_UNAVAILABLE", "The database couldn't be reached. Please try again.", { cause });
      }

      const out = new Headers({ ...corsHeaders(request, METHODS, ALLOW_HEADERS), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Correlation-Id": correlationId });
      for (const h of FORWARD_RESPONSE_HEADERS) { const v = upstream.headers.get(h); if (v) out.set(h, v); }
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
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
export const OPTIONS = (request: Request) => preflight(request, METHODS, ALLOW_HEADERS);
