import { AppError } from "@/lib/errors";
import type { AppRole } from "@/types/profile";
import { errorResponse, withAccessLog } from "@backend/lib/http/endpoint";
import { readRaw } from "@backend/lib/http/body";
import { corsHeaders, isAllowedOrigin } from "@backend/lib/http/cors";
import { clientIp, enforce } from "@backend/lib/http/rate-limit";
import { DB_IP, DB_USER } from "@backend/lib/http/limits";
import { authenticate, authorizeCaller } from "@backend/lib/supabase/auth";
import { requireEnv } from "@backend/lib/supabase/fetch";
import { ALLOW_HEADERS, FORWARD_REQUEST_HEADERS, FORWARD_RESPONSE_HEADERS } from "@backend/lib/http/db-gateway";

export interface ProxyTarget {
  /** Path at the database API, e.g. `rest/v1/enrollments` (query added by the caller of this function). */
  upstreamPath: string;
  /** What the access log shows (no file names or query strings). */
  logPath: string;
  maxBody: number;
}

/**
 * Runs one data request (table rows, a database function, or a file) for the signed-in user of `role`:
 * allowed origin, IP and user rate limits, verified token, exact role and active account (server-side),
 * then forwarded AS THE USER with the publishable key, so Row Level Security and Storage policies still
 * decide every row and file. The service-role key is never used here.
 */
export function proxyAsCaller(request: Request, role: AppRole, methods: string, resolve: (url: URL) => ProxyTarget): Promise<Response> {
  const correlationId = crypto.randomUUID();
  return withAccessLog(request, correlationId, async (setUser, setPath) => {
    try {
      const url = new URL(request.url);
      setPath(url.pathname.replace(/\/files\/.*/, "/files/…"));
      const origin = request.headers.get("origin");
      if (origin && !isAllowedOrigin(origin)) throw new AppError("AUTHORIZATION_ERROR");
      enforce(`db:ip:${clientIp(request)}`, DB_IP);

      const auth = await authenticate(request);
      setUser(auth.userId);
      enforce(`db:user:${auth.userId}`, DB_USER);
      await authorizeCaller(auth, role);

      const target = resolve(url);
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
        upstream = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/${target.upstreamPath}`, {
          method: request.method, headers, ...(body ? { body } : {}), redirect: "manual", cache: "no-store",
          signal: AbortSignal.timeout(60_000),
        });
      } catch (cause) {
        throw new AppError("INTEGRATION_UNAVAILABLE", "The database couldn't be reached. Please try again.", { cause });
      }

      const out = new Headers({ ...corsHeaders(request, methods, ALLOW_HEADERS), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Correlation-Id": correlationId });
      for (const h of FORWARD_RESPONSE_HEADERS) { const v = upstream.headers.get(h); if (v) out.set(h, v); }
      if (request.method === "HEAD") { await upstream.body?.cancel().catch(() => undefined); return new Response(null, { status: upstream.status, headers: out }); }
      return new Response(upstream.body, { status: upstream.status, headers: out });
    } catch (error) {
      return errorResponse(request, methods, error, correlationId);
    }
  });
}
