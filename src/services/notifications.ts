import type { DeliveryConfigResult, DispatchSummaryResult, FirebaseWebApiKeyResult, WelcomeResult } from "@/lib/api/contracts";
import type { AuthContext } from "@backend/lib/supabase/auth";
import { supabaseAdmin } from "@backend/lib/supabase/admin";
import { assertActiveAdmin } from "@backend/server/accounts/accounts.server";
import { appUrl, emailConfigured } from "@backend/server/delivery/resend.server";
import { pushConfigured } from "@backend/server/delivery/fcm.server";
import { processDueDeliveries } from "@backend/server/delivery/dispatcher.server";

/** Creates the admin's welcome notification at most once per IST day (idempotent in the database). */
export async function sendAdminDailyWelcome(auth: AuthContext): Promise<WelcomeResult> {
  await assertActiveAdmin(auth.supabase, auth.userId);
  const { error } = await supabaseAdmin.rpc("notify_admin_daily_welcome" as never, { _admin_id: auth.userId } as never);
  if (error) console.warn("[notifications] admin welcome failed", error.code);
  return { ok: !error };
}

/** Admin-only: which delivery channels are configured on the server (booleans only, never values). */
export async function getDeliveryConfig(auth: AuthContext): Promise<DeliveryConfigResult> {
  await assertActiveAdmin(auth.supabase, auth.userId);
  return { email: emailConfigured(), push: pushConfigured(), appUrl: appUrl() !== null };
}

/** Admin-only: processes queued deliveries now. Takes no recipient input. */
export async function runDeliveryNow(auth: AuthContext): Promise<DispatchSummaryResult> {
  await assertActiveAdmin(auth.supabase, auth.userId);
  return processDueDeliveries(supabaseAdmin as never, 50);
}

/**
 * Returns the Firebase Web API key (public by Firebase design) to signed-in
 * users only. It lives in the secret store so it is not committed to source.
 * No private Firebase credential is ever read or returned here.
 */
export async function getFirebaseWebApiKey(): Promise<FirebaseWebApiKeyResult> {
  const apiKey = (process.env["GOOGLE_API_KEY"] ?? "").trim();
  return { apiKey: apiKey || null };
}
