import { classifyResend, safeError, type ProviderOutcome } from "@/features/delivery/services/delivery-policy";
import type { EmailContent } from "@/features/delivery/services/email-templates";

/** Public site URL used in links, e.g. https://lms.example.com. Server config, not a secret. */
export function appUrl(): string | null {
  const v = (process.env["PUBLIC_APP_URL"] ?? "").trim();
  return /^https:\/\//.test(v) ? v : null;
}

export function emailConfigured(): boolean {
  return !!(process.env["RESEND_API_KEY"] ?? "").trim() && !!(process.env["RESEND_FROM_EMAIL"] ?? "").trim();
}

/** Sends one email through Resend. Only a 2xx from Resend counts as sent. */
export async function sendEmail(to: string, content: EmailContent): Promise<ProviderOutcome> {
  const key = (process.env["RESEND_API_KEY"] ?? "").trim();
  const from = (process.env["RESEND_FROM_EMAIL"] ?? "").trim();
  if (!key || !from) return { kind: "permanent", reason: "Email is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL missing)" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: content.subject, html: content.html, text: content.text }),
    });
    const outcome = classifyResend(res.status);
    if (outcome.kind === "sent") {
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return { kind: "sent", ref: body.id };
    }
    const detail = safeError(await res.text().catch(() => ""));
    console.warn("[email] resend rejected", res.status, detail);
    return outcome;
  } catch {
    return { kind: "transient", reason: "Email provider could not be reached" };
  }
}
