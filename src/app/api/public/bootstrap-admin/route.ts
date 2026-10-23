import { bootstrapAdminSchema, zodDetails } from "@/features/auth/schemas/auth.schemas";
import { AppError, toAppError } from "@/lib/errors";
import { readJson } from "@backend/lib/http/body";
import { PUBLIC_SECRET } from "@backend/lib/http/limits";
import { clientIp, enforce } from "@backend/lib/http/rate-limit";
import { bootstrapFirstAdmin, verifyBootstrapToken } from "@backend/server/auth/bootstrap.server";

/**
 * One-time first-administrator bootstrap. See docs/SECURITY.md.
 * - requires header `x-bootstrap-token` equal to the server secret ADMIN_BOOTSTRAP_TOKEN
 * - refuses permanently once any administrator (or the bootstrap flag) exists
 * - rate limited per IP; never returns or logs the password
 * Server-to-server only: no CORS headers, so browsers on other sites can't read the response.
 */
export async function POST(request: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  try {
    enforce(`bootstrap:${clientIp(request)}`, PUBLIC_SECRET);
    verifyBootstrapToken(request.headers.get("x-bootstrap-token"), process.env["ADMIN_BOOTSTRAP_TOKEN"]);
    const body = await readJson(request).catch(() => null);
    const parsed = bootstrapAdminSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", undefined, { details: zodDetails(parsed.error) });
    const result = await bootstrapFirstAdmin(parsed.data, correlationId);
    return Response.json({ ok: true, userId: result.userId, mustChangePassword: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const appError = toAppError(error);
    return Response.json({ ok: false, error: { ...appError.toPayload(), correlationId } }, { status: appError.status, headers: { "Cache-Control": "no-store" } });
  }
}
