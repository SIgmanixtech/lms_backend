import type { SupabaseClient } from "@supabase/supabase-js";
import { backoffMinutes, channelEnabled, MAX_ATTEMPTS, safeError, type PreferenceRow, type ProviderOutcome } from "@/features/delivery/services/delivery-policy";
import { notificationEmail } from "@/features/delivery/services/email-templates";
import { appUrl, sendEmail } from "./resend.server";
import { sendPush } from "./fcm.server";

const FCM_PREFIX = "https://fcm.googleapis.com/fcm/send/";

interface DeliveryRow { id: string; notification_id: string; channel: "email" | "push"; attempts: number }
interface NotificationRow { id: string; recipient_id: string; category: string; title: string; body: string | null; link: string | null }
type Result = { status: "sent" | "failed" | "skipped" | "retry"; reason?: string; ref?: string | undefined };

export interface DispatchSummary { claimed: number; sent: number; failed: number; skipped: number; retrying: number }

/**
 * Processes due deliveries. Rows are claimed atomically in the database, so
 * overlapping runs never send the same (notification, channel) twice. Only the
 * recipient recorded on the notification is ever targeted.
 */
export async function processDueDeliveries(db: SupabaseClient, limit = 50): Promise<DispatchSummary> {
  const summary: DispatchSummary = { claimed: 0, sent: 0, failed: 0, skipped: 0, retrying: 0 };
  const { data: claimed, error } = await db.rpc("claim_due_deliveries", { _limit: limit });
  if (error) throw new Error("claim failed");
  const rows = (claimed ?? []) as DeliveryRow[];
  summary.claimed = rows.length;
  for (const row of rows) {
    let result: Result;
    try { result = await deliver(db, row); } catch { result = { status: "retry", reason: "Unexpected delivery error" }; }
    await record(db, row, result);
    if (result.status === "retry") summary.retrying++; else summary[result.status]++;
  }
  return summary;
}

async function deliver(db: SupabaseClient, row: DeliveryRow): Promise<Result> {
  const { data: n } = await db.from("notifications").select("id, recipient_id, category, title, body, link").eq("id", row.notification_id).maybeSingle<NotificationRow>();
  if (!n) return { status: "skipped", reason: "Notification no longer exists" };
  const { data: profile } = await db.from("profiles").select("email, account_status").eq("id", n.recipient_id).maybeSingle<{ email: string; account_status: string }>();
  if (!profile || profile.account_status !== "active") return { status: "skipped", reason: "Recipient account is not active" };
  const { data: prefs } = await db.from("notification_preferences").select("category, email_enabled, push_enabled").eq("user_id", n.recipient_id);
  if (!channelEnabled((prefs ?? []) as PreferenceRow[], n.category, row.channel)) return { status: "skipped", reason: "Turned off in preferences" };
  const site = appUrl();
  if (row.channel === "email") return toResult(await sendEmail(String(profile.email), notificationEmail({ title: n.title, body: n.body, link: n.link, appUrl: site })), row);

  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint").eq("user_id", n.recipient_id).is("disabled_at", null);
  const devices = ((subs ?? []) as { id: string; endpoint: string }[]).filter((s) => s.endpoint.startsWith(FCM_PREFIX));
  if (!devices.length) return { status: "skipped", reason: "No active browser registered" };
  let anySent = false; let transient: string | null = null; let permanent: string | null = null; let ref: string | undefined;
  for (const d of devices) {
    const out = await sendPush(d.endpoint.slice(FCM_PREFIX.length), { notificationId: n.id, title: n.title, body: n.body ?? "", path: n.link, appUrl: site });
    if (out.kind === "sent") { anySent = true; ref ??= out.ref; await db.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", d.id); }
    else if (out.kind === "transient") transient = out.reason;
    else {
      permanent = out.reason;
      if (out.reason.startsWith("Device token")) await db.from("push_subscriptions").update({ disabled_at: new Date().toISOString(), disabled_reason: "unregistered" }).eq("id", d.id);
    }
  }
  if (anySent) return { status: "sent", ref };
  if (transient) return toResult({ kind: "transient", reason: transient }, row);
  return { status: "failed", reason: permanent ?? "Push failed" };
}

function toResult(out: ProviderOutcome, row: DeliveryRow): Result {
  if (out.kind === "sent") return { status: "sent", ref: out.ref };
  if (out.kind === "permanent") return { status: "failed", reason: out.reason };
  return row.attempts >= MAX_ATTEMPTS ? { status: "failed", reason: `${out.reason}; gave up after ${row.attempts} attempts` } : { status: "retry", reason: out.reason };
}

async function record(db: SupabaseClient, row: DeliveryRow, r: Result): Promise<void> {
  const now = new Date();
  const patch = r.status === "retry"
    ? { status: "pending", last_error: safeError(r.reason ?? ""), next_attempt_at: new Date(now.getTime() + backoffMinutes(row.attempts) * 60_000).toISOString() }
    : { status: r.status, last_error: r.reason ? safeError(r.reason) : null, provider_ref: r.ref ?? null, sent_at: r.status === "sent" ? now.toISOString() : null };
  await db.from("notification_deliveries").update(patch).eq("id", row.id);
}
