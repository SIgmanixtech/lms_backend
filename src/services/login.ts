import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AppError } from "@/lib/errors";
import { deriveAccessState } from "@/features/auth/services/access-state";
import type { LoginInput } from "@/features/auth/schemas/auth.schemas";
import type { LoginResult } from "@/lib/api/contracts";
import type { Profile } from "@/types/profile";
import { enforce } from "@backend/lib/http/rate-limit";
import { LOGIN_EMAIL, LOGIN_IP } from "@backend/lib/http/limits";
import { supabaseAdmin } from "@backend/lib/supabase/admin";
import { createSupabaseFetch, requireEnv } from "@backend/lib/supabase/fetch";

const WRONG_CREDENTIALS = "Email or password is incorrect.";
const INACTIVE = "This account is inactive. Contact an administrator.";
const NO_PROFILE = "This sign-in has no valid LMS profile or role. Contact an administrator.";

/**
 * Email + password sign-in. Rate limited per IP and per email before Supabase is called.
 * Wrong email and wrong password get the same message, so accounts can't be discovered.
 * Inactive or unprovisioned accounts are refused and the session just created is revoked,
 * so only accounts that may use the LMS ever receive tokens.
 */
export async function login(data: LoginInput, ip: string): Promise<LoginResult> {
  enforce(`login:ip:${ip}`, LOGIN_IP);
  enforce(`login:email:${data.email}`, LOGIN_EMAIL);

  const [url, key] = requireEnv("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY") as [string, string];
  const client = createClient<Database>(url, key, {
    global: { fetch: createSupabaseFetch(key) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error } = await client.auth.signInWithPassword({ email: data.email, password: data.password });
  if (error || !auth.session || !auth.user) {
    // Supabase reports a ban only after the password matched; deactivated accounts are banned.
    if (error?.code === "user_banned") throw new AppError("AUTHORIZATION_ERROR", INACTIVE);
    if (error && error.status !== undefined && error.status >= 500) throw new AppError("INTEGRATION_UNAVAILABLE", "Sign-in is unavailable right now. Please try again shortly.", { cause: error });
    throw new AppError("AUTHENTICATION_ERROR", WRONG_CREDENTIALS);
  }

  // The caller's own row; read with the service client so an inactive account can still be told why.
  const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
  if (profileError) {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    throw new AppError("DATABASE_ERROR", undefined, { cause: profileError });
  }

  const state = deriveAccessState(profile);
  if (state === "inactive" || state === "no_profile" || state === "invalid_role") {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    throw new AppError("AUTHORIZATION_ERROR", state === "inactive" ? INACTIVE : NO_PROFILE);
  }

  const s = auth.session;
  return {
    session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? null, expires_in: s.expires_in, token_type: s.token_type },
    user: { id: auth.user.id, email: auth.user.email ?? null },
    profile: profile as Profile,
    state,
  };
}
