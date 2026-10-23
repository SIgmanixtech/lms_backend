import { timingSafeEqual } from "crypto";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";

import type { BootstrapAdminInput } from "@/features/auth/schemas/auth.schemas";

/** Minimum length for ADMIN_BOOTSTRAP_TOKEN; shorter values count as "not configured". */
const MIN_TOKEN_LENGTH = 32;

export function verifyBootstrapToken(provided: string | null, configured: string | undefined): void {
  if (!configured || configured.length < MIN_TOKEN_LENGTH) {
    throw new AppError("INTEGRATION_UNAVAILABLE", "First-admin bootstrap is not configured.");
  }
  const a = Buffer.from(provided ?? "");
  const b = Buffer.from(configured);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError("AUTHENTICATION_ERROR", "Invalid bootstrap token.");
  }
}

/**
 * Creates the first administrator. The database function
 * bootstrap_first_admin (service_role only) is the real guard: it takes an
 * advisory lock, refuses when any admin or the bootstrap flag exists, and
 * writes the audit event. This wrapper only creates the auth identity and
 * removes it again if the database refuses.
 */
export async function bootstrapFirstAdmin(input: BootstrapAdminInput, correlationId: string) {
  const { supabaseAdmin } = await import("@backend/lib/supabase/admin");

  const { data: available, error: availErr } = await supabaseAdmin.rpc(
    "first_admin_bootstrap_available",
  );
  if (availErr) throw new AppError("DATABASE_ERROR", undefined, { correlationId, cause: availErr });
  if (!available) throw new AppError("CONFLICT", "First-admin bootstrap is no longer available.");

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (createErr || !created.user) {
    logger.warn("bootstrap: auth user creation failed", { correlationId });
    throw new AppError("CONFLICT", "Could not create the administrator sign-in account.", {
      correlationId,
      cause: createErr,
    });
  }

  const { error: rpcErr } = await supabaseAdmin.rpc("bootstrap_first_admin", {
    _user_id: created.user.id,
    _full_name: input.fullName,
    _email: input.email,
  });
  if (rpcErr) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    logger.warn("bootstrap: database refused", { correlationId });
    throw new AppError("CONFLICT", "First-admin bootstrap is no longer available.", {
      correlationId,
      cause: rpcErr,
    });
  }

  logger.info("bootstrap: first administrator created", { correlationId, entityId: created.user.id });
  return { userId: created.user.id };
}
