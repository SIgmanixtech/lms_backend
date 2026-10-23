import { classifyFcm, safeError, type ProviderOutcome } from "@/features/delivery/services/delivery-policy";

interface ServiceAccount { client_email: string; private_key: string; project_id: string }
let cached: { token: string; exp: number } | null = null;

function readServiceAccount(): ServiceAccount | null {
  const raw = (process.env["FIREBASE_SERVICE_ACCOUNT_JSON"] ?? "").trim();
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as Partial<ServiceAccount>;
    return sa.client_email && sa.private_key && sa.project_id ? (sa as ServiceAccount) : null;
  } catch { return null; }
}

export const pushConfigured = () => readServiceAccount() !== null;

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const der = Buffer.from(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const enc = new TextEncoder();
  const unsigned = `${b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })))}.${b64url(enc.encode(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })))}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(sig)}` }),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, exp: now + body.expires_in };
  return body.access_token;
}

export interface PushMessage { notificationId: string; title: string; body: string; path: string | null; appUrl: string | null }

/** Sends a data-only message; the existing service worker displays it and routes clicks internally. */
export async function sendPush(deviceToken: string, m: PushMessage): Promise<ProviderOutcome> {
  const sa = readServiceAccount();
  if (!sa) return { kind: "permanent", reason: "Push is not configured (FIREBASE_SERVICE_ACCOUNT_JSON missing)" };
  let token: string;
  try { token = await accessToken(sa); } catch { return { kind: "transient", reason: "Push provider sign-in failed" }; }
  const data: Record<string, string> = { notification_id: m.notificationId, title: m.title, body: m.body };
  if (m.path) data["url"] = m.path;
  const link = m.appUrl && m.path ? `${m.appUrl.replace(/\/$/, "")}${m.path}` : undefined;
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { token: deviceToken, data, ...(link ? { webpush: { fcm_options: { link } } } : {}) } }),
    });
    const text = res.ok ? "" : await res.text().catch(() => "");
    const outcome = classifyFcm(res.status, text);
    if (outcome.kind === "sent") return { kind: "sent", ref: ((await res.json().catch(() => ({}))) as { name?: string }).name };
    console.warn("[push] fcm rejected", res.status, safeError(text).slice(0, 120));
    return outcome;
  } catch {
    return { kind: "transient", reason: "Push provider could not be reached" };
  }
}
