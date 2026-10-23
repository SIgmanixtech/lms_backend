/**
 * Pure delivery rules shared by the dispatcher and tests. No I/O, no secrets.
 */
export type Channel = "email" | "push";
export interface PreferenceRow { category: string; email_enabled: boolean; push_enabled: boolean }

export const MAX_ATTEMPTS = 5;

/** A missing preference row means the channel is on; an explicit row wins. */
export function channelEnabled(prefs: PreferenceRow[], category: string, channel: Channel): boolean {
  const row = prefs.find((p) => p.category === category);
  if (!row) return true;
  return channel === "email" ? row.email_enabled : row.push_enabled;
}

/** Exponential backoff: 1, 2, 4, 8 … minutes, capped at 60. */
export function backoffMinutes(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts - 1));
}

export type ProviderOutcome =
  | { kind: "sent"; ref?: string | undefined }
  | { kind: "transient"; reason: string }
  | { kind: "permanent"; reason: string };

/** Resend: 429 and 5xx retry; other 4xx (bad sender, bad key, validation) do not. */
export function classifyResend(status: number): ProviderOutcome {
  if (status >= 200 && status < 300) return { kind: "sent" };
  if (status === 429 || status >= 500) return { kind: "transient", reason: `Email provider unavailable (${status})` };
  return { kind: "permanent", reason: `Email provider rejected the message (${status})` };
}

/** FCM HTTP v1: which failures mean this device token is dead for good. */
export function isDeadFcmToken(status: number, body: string): boolean {
  if (status === 404) return true;
  return status === 400 && /UNREGISTERED|registration token is not a valid|INVALID_ARGUMENT/i.test(body);
}

export function classifyFcm(status: number, body: string): ProviderOutcome {
  if (status >= 200 && status < 300) return { kind: "sent" };
  if (isDeadFcmToken(status, body)) return { kind: "permanent", reason: "Device token is no longer valid" };
  if (status === 429 || status >= 500) return { kind: "transient", reason: `Push provider unavailable (${status})` };
  return { kind: "permanent", reason: `Push provider rejected the message (${status})` };
}

/** Keeps stored error text short and free of anything that looks like a credential. */
export function safeError(text: string): string {
  return text
    .replace(/(Bearer\s+)[\w.\-~+/=]+/gi, "$1[redacted]")
    .replace(/re_[A-Za-z0-9_]{8,}/g, "[redacted]")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[redacted]")
    .slice(0, 300);
}
