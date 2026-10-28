import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AppError } from "@/lib/errors";
import { deriveAccessState } from "@/features/auth/services/access-state";
import type { RefreshSessionInput } from "@/features/auth/schemas/auth.schemas";
import type { OkResult, RefreshResult } from "@/lib/api/contracts";
import { enforce } from "@backend/lib/http/rate-limit";
import { REFRESH_IP } from "@backend/lib/http/limits";
import { supabaseAdmin } from "@backend/lib/supabase/admin";
import { createSupabaseFetch, requireEnv } from "@backend/lib/supabase/fetch";

const EXPIRED = "Your session has ended. Please sign in again.";

function anonClient() {
  const [url, key] = requireEnv("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY") as [string, string];
  return createClient<Database>(url, key, {
    global: { fetch: createSupabaseFetch(key) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Renews a session from its refresh token, so the browser never talks to Supabase Auth.
 * Banned (deactivated) users already fail at Supabase; the profile is re-checked too, so an
 * account made inactive or unprovisioned since sign-in stops receiving tokens.
 */
export async function refreshSession(data: RefreshSessionInput, ip: string): Promise<RefreshResult> {
  enforce(`refresh:ip:${ip}`, REFRESH_IP);
  const client = anonClient();
  const { data: auth, error } = await client.auth.refreshSession({ refresh_token: data.refreshToken });
  if (error || !auth.session || !auth.user) {
    if (error?.status !== undefined && error.status >= 500) throw new AppError("INTEGRATION_UNAVAILABLE", "Sign-in is unavailable right now. Please try again shortly.", { cause: error });
    throw new AppError("AUTHENTICATION_ERROR", EXPIRED);
  }

  const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("role, account_status, must_change_password").eq("id", auth.user.id).maybeSingle();
  if (profileError) throw new AppError("DATABASE_ERROR", undefined, { cause: profileError });
  const state = deriveAccessState(profile);
  if (state === "inactive" || state === "no_profile" || state === "invalid_role") {
    await supabaseAdmin.auth.admin.signOut(auth.session.access_token, "local").catch(() => undefined);
    throw new AppError("AUTHENTICATION_ERROR", EXPIRED);
  }

  const s = auth.session;
  return {
    session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? null, expires_in: s.expires_in, token_type: s.token_type },
    user: { id: auth.user.id, email: auth.user.email ?? null },
  };
}

/** Ends the caller's current session (this device only); its refresh token stops working. */
export async function signOutSession(accessToken: string): Promise<OkResult> {
  const { error } = await supabaseAdmin.auth.admin.signOut(accessToken, "local");
  // An already-ended session is the outcome the caller wanted.
  if (error && error.status !== undefined && error.status >= 500) throw new AppError("INTEGRATION_UNAVAILABLE", undefined, { cause: error });
  return { ok: true };
}
