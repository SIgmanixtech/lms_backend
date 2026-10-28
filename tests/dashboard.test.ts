import { describe, expect, it } from "vitest";
import { getDashboardSummary } from "@backend/services/dashboard";
import type { AuthContext } from "@backend/lib/supabase/auth";

// A fake RLS-scoped client: records each query and answers counts / rows per table.
function fakeDb(role: string, opts: { counts?: Record<string, number>; enrollments?: unknown[]; payments?: unknown[]; status?: string } = {}) {
  const queries: string[] = [];
  const from = (table: string) => {
    const parts: string[] = [table];
    let head = false;
    const q: any = {
      select: (_cols: string, o?: { head?: boolean }) => { head = !!o?.head; return q; },
      eq: (c: string, v: unknown) => { parts.push(`${c}=${String(v)}`); return q; },
      is: (c: string, v: unknown) => { parts.push(`${c} is ${String(v)}`); return q; },
      in: () => q, order: () => q, range: () => q,
      maybeSingle: () => Promise.resolve({ data: { role, account_status: opts.status ?? "active" }, error: null }),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        queries.push(parts.join(" "));
        const value = head ? { count: opts.counts?.[table] ?? 0, error: null }
          : { data: table === "enrollments" ? opts.enrollments ?? [] : table === "payments" ? opts.payments ?? [] : [], error: null };
        return Promise.resolve(value).then(res, rej);
      },
    };
    return q;
  };
  return { auth: { supabase: { from }, userId: "u1", claims: { sub: "u1" } } as unknown as AuthContext, queries };
}

describe("dashboard summary", () => {
  it("counts every admin tile in one call and computes outstanding fees", async () => {
    const { auth, queries } = fakeDb("admin", {
      counts: { students: 12, trainers: 3, classes: 4 },
      enrollments: [{ id: "e1", fee_amount: 10000 }, { id: "e2", fee_amount: 5000 }],
      payments: [{ enrollment_id: "e1", amount: 4000 }, { enrollment_id: "e2", amount: 9000 }],
    });
    const s = await getDashboardSummary(auth);
    expect(s.role).toBe("admin");
    expect(s.counts).toMatchObject({ students: 12, tutors: 3, upcomingClasses: 4, courses: 0 });
    expect(s.counts["outstandingFees"]).toBeUndefined(); // fees tile isn't a row count
    expect(s.outstandingFees).toBe(6000); // overpayment on e2 never goes negative
    expect(queries).toContain("classes status=scheduled");
  });
  it("uses the caller's own role and filters (student unread notifications)", async () => {
    const { auth, queries } = fakeDb("student", { counts: { notifications: 2 } });
    const s = await getDashboardSummary(auth);
    expect(s.counts["unreadNotifications"]).toBe(2);
    expect(s.outstandingFees).toBeNull();
    expect(queries).toContain("notifications read_at is null");
  });
  it("refuses inactive accounts", async () => {
    const { auth } = fakeDb("admin", { status: "inactive" });
    await expect(getDashboardSummary(auth)).rejects.toMatchObject({ code: "AUTHORIZATION_ERROR" });
  });
});
