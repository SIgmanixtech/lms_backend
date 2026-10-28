import { AppError } from "@/lib/errors";
import type { DashboardSummary } from "@/lib/api/contracts";
import { DASHBOARD_METRICS, type DashboardMetric } from "@/features/dashboard/dashboard-metrics";
import type { AppRole } from "@/types/profile";
import type { AuthContext } from "@backend/lib/supabase/auth";

// The metric list is data (table + filters), so the typed client is used untyped here.
type Db = { from: (t: string) => any };

async function count(db: Db, m: DashboardMetric): Promise<number> {
  let q = db.from(m.table).select("*", { count: "exact", head: true });
  for (const [column, value] of Object.entries(m.filters)) q = value === null ? q.is(column, null) : q.eq(column, value);
  const { count: n, error } = await q;
  if (error) throw new AppError("DATABASE_ERROR", undefined, { cause: error });
  return n ?? 0;
}

/** Sum of (fee - payments) over active/completed enrollments, in minor units. Paged so it scales. */
async function outstandingFees(db: Db): Promise<number> {
  let outstanding = 0;
  for (let start = 0; ; start += 500) {
    const enrollments = await db.from("enrollments").select("id, fee_amount").in("status", ["active", "completed"]).order("id").range(start, start + 499);
    if (enrollments.error) throw new AppError("DATABASE_ERROR", undefined, { cause: enrollments.error });
    const rows = (enrollments.data ?? []) as { id: string; fee_amount: number }[];
    if (!rows.length) break;
    const paid = new Map<string, number>();
    for (let p = 0; ; p += 1000) {
      const payments = await db.from("payments").select("enrollment_id, amount").in("enrollment_id", rows.map((e) => e.id)).order("id").range(p, p + 999);
      if (payments.error) throw new AppError("DATABASE_ERROR", undefined, { cause: payments.error });
      const prow = (payments.data ?? []) as { enrollment_id: string; amount: number }[];
      for (const x of prow) paid.set(x.enrollment_id, (paid.get(x.enrollment_id) ?? 0) + x.amount);
      if (prow.length < 1000) break;
    }
    for (const e of rows) outstanding += Math.max(0, e.fee_amount - (paid.get(e.id) ?? 0));
    if (rows.length < 500) break;
  }
  return outstanding;
}

/**
 * Every dashboard tile in one request. Runs as the caller (RLS), so each number covers only what
 * that user may see, exactly as the separate queries did; the role comes from their own profile.
 */
export async function getDashboardSummary(auth: AuthContext): Promise<DashboardSummary> {
  const db = auth.supabase as unknown as Db;
  const { data: profile, error } = await auth.supabase.from("profiles").select("role, account_status").eq("id", auth.userId).maybeSingle();
  if (error) throw new AppError("DATABASE_ERROR", undefined, { cause: error });
  if (!profile || profile.account_status !== "active") throw new AppError("AUTHORIZATION_ERROR");
  const role = profile.role as AppRole;
  const metrics = DASHBOARD_METRICS[role];
  if (!metrics) throw new AppError("AUTHORIZATION_ERROR");

  const countable = metrics.filter((m) => !m.fees);
  const [values, fees] = await Promise.all([
    Promise.all(countable.map((m) => count(db, m))),
    metrics.some((m) => m.fees) ? outstandingFees(db) : Promise.resolve(null),
  ]);
  const counts: Record<string, number> = {};
  countable.forEach((m, i) => { counts[m.key] = values[i]!; });
  return { role, counts, outstandingFees: fees };
}
