function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/** New Supabase API keys are opaque strings, not bearer JWTs: send them only as `apikey`. */
export function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) headers.delete("Authorization");
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

/** Reads required server configuration; logs variable names only, never values. */
export function requireEnv(...names: string[]): string[] {
  const values = names.map((n) => process.env[n]);
  const missing = names.filter((_, i) => !values[i]);
  if (missing.length) {
    console.error(`[config] Missing environment variable(s): ${missing.join(", ")}`);
    throw new Error(`Missing environment variable(s): ${missing.join(", ")}`);
  }
  return values as string[];
}
