import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AppError } from "@/lib/errors";
import { createSupabaseFetch, requireEnv } from "./fetch";
import { roleAllowed, type Caller } from "@backend/lib/http/access";
import type { AppRole } from "@/types/profile";

export interface AuthContext {
  /** RLS-scoped client acting as the caller. */
  supabase: SupabaseClient<Database>;
  userId: string;
  claims: Record<string, unknown> & { sub: string; email?: unknown };
}

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

/** Verifies the caller's Supabase access token (signature + expiry via getClaims) and builds an RLS-scoped client. */
export async function authenticate(request: Request): Promise<AuthContext> {
  const token = BEARER.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token || token.length > 8192) throw new AppError("AUTHENTICATION_ERROR");
  const [url, key] = requireEnv("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY") as [string, string];
  const supabase = createClient<Database>(url, key, {
    global: { fetch: createSupabaseFetch(key), headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string" || !sub) throw new AppError("AUTHENTICATION_ERROR");
  return { supabase, userId: sub, claims: data.claims as AuthContext["claims"] };
}

/**
 * Role gate for `endpoint({ access: role })`: reads the caller's own profile as them (RLS allows a
 * user to read their own row) and refuses unless the account is active and has exactly that role.
 */
export async function authorizeCaller(auth: AuthContext, role: AppRole): Promise<Caller> {
  const { data, error } = await auth.supabase.from("profiles").select("role, account_status").eq("id", auth.userId).maybeSingle();
  if (error) throw new AppError("DATABASE_ERROR", undefined, { cause: error });
  if (!roleAllowed(role, data)) throw new AppError("AUTHORIZATION_ERROR");
  return { role: data.role };
}
