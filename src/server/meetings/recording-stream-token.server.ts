/**
 * Short-lived signed tickets for streaming a Zoho recording through the LMS server.
 * Issued only after RLS has confirmed the user may see the recording. The signing key is
 * derived from the service-role key (server-only, already configured on every deployment).
 */
const TTL_MS = 4 * 3600_000;
const enc = new TextEncoder();

async function key(): Promise<CryptoKey> {
  const base = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!base) throw new Error("Server signing key not configured");
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`recording-stream:v1:${base}`));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

const b64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function signRecordingTicket(recordingId: string, userId: string, now = Date.now()): Promise<string> {
  const payload = `${recordingId}.${userId}.${now + TTL_MS}`;
  const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(payload));
  return `${payload}.${b64u(sig)}`;
}

/** Returns the recording id when the ticket is authentic and unexpired, else null. */
export async function verifyRecordingTicket(ticket: string, now = Date.now()): Promise<string | null> {
  const parts = ticket.split(".");
  if (parts.length !== 4) return null;
  const [rec, user, exp, sig] = parts as [string, string, string, string];
  if (!/^[0-9a-f-]{36}$/.test(rec) || !/^[0-9a-f-]{36}$/.test(user) || !/^\d+$/.test(exp) || Number(exp) < now) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), fromB64u(sig), enc.encode(`${rec}.${user}.${exp}`));
    return ok ? rec : null;
  } catch { return null; }
}
