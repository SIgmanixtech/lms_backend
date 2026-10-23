const DEV_ORIGINS = ["http://localhost:8080", "http://127.0.0.1:8080"];

/** Exact-match allowlist from ALLOWED_ORIGINS (comma separated). Local dev origins are allowed outside production. */
export function allowedOrigins(): string[] {
  const configured = (process.env["ALLOWED_ORIGINS"] ?? "").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
  return process.env.NODE_ENV === "production" ? configured : [...configured, ...DEV_ORIGINS];
}

export function isAllowedOrigin(origin: string | null): boolean {
  return !!origin && allowedOrigins().includes(origin);
}

/**
 * CORS headers for an allowed origin only. Credentials are never allowed: the API authenticates
 * with an explicit bearer token, so no cookie is ever sent cross-site (which also rules out CSRF).
 */
export function corsHeaders(request: Request, methods: string): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !isAllowedOrigin(origin)) return { Vary: "Origin" };
  return {
    Vary: "Origin",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "authorization, content-type, range",
    "Access-Control-Expose-Headers": "content-range, content-length, accept-ranges",
    "Access-Control-Max-Age": "600",
  };
}

export function preflight(request: Request, methods: string): Response {
  if (!isAllowedOrigin(request.headers.get("origin"))) return new Response(null, { status: 403, headers: { Vary: "Origin" } });
  return new Response(null, { status: 204, headers: corsHeaders(request, methods) });
}
