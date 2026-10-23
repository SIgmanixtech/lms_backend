import { AppError, toAppError } from "@/lib/errors";
import { authenticate, type AuthContext } from "@backend/lib/supabase/auth";
import { readJson, DEFAULT_MAX_BODY_BYTES } from "./body";
import { corsHeaders, isAllowedOrigin, preflight } from "./cors";
import { clientIp, enforce, RateLimitedError, type RateLimit } from "./rate-limit";

export interface EndpointContext<I> {
  data: I;
  auth: AuthContext;
  request: Request;
  correlationId: string;
}

export interface EndpointOptions<I> {
  method: "GET" | "POST";
  /** Validates the untrusted body; must throw AppError on bad input. Omitted = no input accepted. */
  input?: (raw: unknown) => I;
  maxBodyBytes?: number;
  /** Extra per-user limit for sensitive operations (on top of the default limits). */
  rateLimit?: RateLimit;
}

const PER_IP: RateLimit = { limit: 300, windowMs: 60_000 };
const PER_USER: RateLimit = { limit: 120, windowMs: 60_000 };

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

export function errorResponse(request: Request, methods: string, error: unknown, correlationId: string): Response {
  const appError = toAppError(error);
  if (appError.code === "INTERNAL_ERROR") {
    // Server-side only; the client receives the safe message and the correlation id.
    const cause = appError.cause;
    console.error(JSON.stringify({ level: "error", correlationId, path: new URL(request.url).pathname, error: cause instanceof Error ? `${cause.name}: ${cause.message}`.slice(0, 500) : String(cause).slice(0, 200) }));
  }
  const payload = { ...appError.toPayload(), correlationId };
  const extra: Record<string, string> = error instanceof RateLimitedError ? { "Retry-After": String(error.retryAfterS) } : {};
  return new Response(JSON.stringify({ error: payload }), { status: appError.status, headers: { ...JSON_HEADERS, ...corsHeaders(request, methods), ...extra } });
}

/**
 * Wraps an authenticated JSON endpoint. Every request: origin allowlist, IP + user rate limits,
 * Supabase token verification, bounded JSON body, schema validation, and errors returned only
 * as safe AppError payloads (raw database/provider messages never leave the server).
 */
export function endpoint<I = undefined, O = unknown>(opts: EndpointOptions<I>, handler: (ctx: EndpointContext<I>) => Promise<O>) {
  const methods = `${opts.method}, OPTIONS`;
  async function handle(request: Request): Promise<Response> {
    const correlationId = crypto.randomUUID();
    try {
      const origin = request.headers.get("origin");
      // Browsers always send Origin cross-site; refuse unknown sites outright (defense in depth).
      if (origin && !isAllowedOrigin(origin)) throw new AppError("AUTHORIZATION_ERROR");
      const ip = clientIp(request);
      enforce(`ip:${ip}`, PER_IP);
      const auth = await authenticate(request);
      enforce(`user:${auth.userId}`, PER_USER);
      if (opts.rateLimit) enforce(`user:${auth.userId}:${new URL(request.url).pathname}`, opts.rateLimit);
      const raw = opts.method === "POST" ? await readJson(request, opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES) : {};
      const data = (opts.input ? opts.input(raw) : undefined) as I;
      const result = await handler({ data, auth, request, correlationId });
      return new Response(JSON.stringify(result ?? null), { status: 200, headers: { ...JSON_HEADERS, ...corsHeaders(request, methods) } });
    } catch (error) {
      return errorResponse(request, methods, error, correlationId);
    }
  }
  return { handle, options: (request: Request) => preflight(request, methods) };
}

export interface PublicEndpointContext<I> {
  data: I;
  request: Request;
  correlationId: string;
  ip: string;
}

/**
 * Wraps a JSON endpoint that runs before the user has a token (sign-in). Same origin allowlist,
 * IP rate limit, bounded body, validation and safe errors as `endpoint()`, minus token checks;
 * the handler must apply its own stricter limits.
 */
export function publicEndpoint<I, O>(opts: Omit<EndpointOptions<I>, "rateLimit"> & { input: (raw: unknown) => I }, handler: (ctx: PublicEndpointContext<I>) => Promise<O>) {
  const methods = `${opts.method}, OPTIONS`;
  async function handle(request: Request): Promise<Response> {
    const correlationId = crypto.randomUUID();
    try {
      const origin = request.headers.get("origin");
      if (origin && !isAllowedOrigin(origin)) throw new AppError("AUTHORIZATION_ERROR");
      const ip = clientIp(request);
      enforce(`ip:${ip}`, PER_IP);
      const raw = opts.method === "POST" ? await readJson(request, opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES) : {};
      const data = opts.input(raw);
      const result = await handler({ data, request, correlationId, ip });
      return new Response(JSON.stringify(result ?? null), { status: 200, headers: { ...JSON_HEADERS, ...corsHeaders(request, methods) } });
    } catch (error) {
      return errorResponse(request, methods, error, correlationId);
    }
  }
  return { handle, options: (request: Request) => preflight(request, methods) };
}
