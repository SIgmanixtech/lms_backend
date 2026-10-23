import type { SupabaseClient } from "@supabase/supabase-js";
import { welcomeEmail, type WelcomeInput } from "@/features/delivery/services/email-templates";
import { appUrl, sendEmail } from "./resend.server";

export interface EmailStatus { sent: boolean; reason?: string }

/**
 * Sends the welcome / temporary-password email directly (the password is never
 * queued or stored). Audits the outcome without any password or secret.
 */
export async function sendWelcomeEmail(db: SupabaseClient, actorId: string, profileId: string, input: Omit<WelcomeInput, "appUrl">): Promise<EmailStatus> {
  const out = await sendEmail(input.email, welcomeEmail({ ...input, appUrl: appUrl() }));
  const sent = out.kind === "sent";
  const reason = out.kind === "sent" ? "" : out.reason;
  await db.from("audit_events").insert({
    actor_id: actorId, action: sent ? "email.welcome_sent" : "email.welcome_failed", entity_type: "profile", entity_id: profileId,
    after_data: { kind: input.reset ? "password_reset" : "welcome", ...(sent ? {} : { reason }) },
  });
  return sent ? { sent: true } : { sent: false, reason };
}
