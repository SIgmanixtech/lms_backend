/** Liveness probe for deploy checks. Reveals nothing about configuration. */
export function GET(): Response {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
