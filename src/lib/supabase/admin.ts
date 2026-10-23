import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createSupabaseFetch, requireEnv } from "./fetch";

function createSupabaseAdminClient() {
  const [url, serviceKey] = requireEnv("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") as [string, string];
  return createClient<Database>(url, serviceKey, {
    global: { fetch: createSupabaseFetch(serviceKey) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

let instance: ReturnType<typeof createSupabaseAdminClient> | undefined;

/**
 * Service-role client: bypasses RLS. Use only after the caller's authorization was
 * established (RLS-scoped check or an authorizing RPC). Never returned to clients.
 */
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!instance) instance = createSupabaseAdminClient();
    return Reflect.get(instance, prop, receiver);
  },
});
