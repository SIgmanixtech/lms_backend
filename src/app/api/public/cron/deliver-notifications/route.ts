import { logged } from "@backend/lib/http/endpoint";
import { supabaseAdmin } from "@backend/lib/supabase/admin";
import { cronAuthorized } from "@backend/server/delivery/cron-auth";
import { runClassLifecycle } from "@backend/server/classes/class-lifecycle.server";
import { processDueAttendance } from "@backend/server/attendance/attendance-processor.server";
import { processDueDeliveries } from "@backend/server/delivery/dispatcher.server";

export const maxDuration = 60;

/**
 * The only scheduler. Callers must present the cron secret as a Bearer token. Each run:
 * 1) queues due class reminders, 2) completes classes past their scheduled end and checks recordings,
 * 3) processes finished classes' attendance (max 5), then completes ready classes on the next run,
 * 4) delivers queued email/push (max 50). Steps fail independently and take no caller input.
 */
async function run(request: Request): Promise<Response> {
  if (!cronAuthorized(request.headers.get("authorization"), [process.env["LOVABLE_CRON_SECRET"], process.env["CRON_SECRET"]])) {
    return new Response("Unauthorized", { status: 401 });
  }
  const headers = { "Cache-Control": "no-store" };
  const out: Record<string, unknown> = {};
  try {
    const { data, error } = await supabaseAdmin.rpc("run_class_reminders" as never);
    out["reminders"] = error ? { error: "Reminder run failed" } : { queued: data };
  } catch { out["reminders"] = { error: "Reminder run failed" }; }
  try {
    const { data, error } = await supabaseAdmin.rpc("run_assignment_due_reminders" as never);
    out["assignmentReminders"] = error ? { error: "Assignment reminder run failed" } : { queued: data };
  } catch { out["assignmentReminders"] = { error: "Assignment reminder run failed" }; }
  try {
    out["lifecycle"] = await runClassLifecycle(supabaseAdmin as never);
  } catch { out["lifecycle"] = { error: "Class lifecycle run failed" }; }
  try {
    out["attendance"] = await processDueAttendance(supabaseAdmin as never, 5);
  } catch { out["attendance"] = { error: "Attendance run failed" }; }
  try {
    out["deliveries"] = await processDueDeliveries(supabaseAdmin as never, 50);
  } catch {
    return Response.json({ ...out, deliveries: { error: "Delivery run failed" } }, { status: 500, headers });
  }
  console.log(JSON.stringify({ level: "info", type: "cron", ...out }));
  return Response.json(out, { headers });
}

export const GET = logged(run);
export const POST = logged(run);
