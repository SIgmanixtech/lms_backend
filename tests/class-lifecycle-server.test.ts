import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { advanceTimed } from "@backend/server/classes/class-lifecycle.server";
import { canStartClass } from "@/features/classes/services/class-meeting-policy";

/** Minimal fake of the conditional-update query builder used by advanceTimed. */
function fakeDb(rows: Record<string, unknown>[]) {
  const updates: { id: unknown; patch: Record<string, unknown> }[] = [];
  const chain = (result: unknown) => { const c: any = new Proxy({}, { get: (_t, k) => k === "then" ? (r: any) => r(result) : () => c }); return c; };
  return {
    updates,
    from: (t: string) => ({
      select: () => chain({ data: rows }),
      update: (patch: Record<string, unknown>) => ({ eq: (_k: string, id: unknown) => ({ eq: (_s: string, st: unknown) => { const row = rows.find((r) => r["id"] === id && r["status"] === st); if (row) { updates.push({ id, patch }); Object.assign(row, patch); } return chain({ data: row ? [{ id }] : [] }); } }) }),
      insert: () => chain({ data: null }),
      _t: t,
    }),
  };
}

const row = (id: string, status: string, extra: Record<string, unknown> = {}) => ({ id, status, class_date: "2026-10-09", start_time: "15:45:00", end_time: "16:40:00", zoho_meeting_key: null, recording_status: "not_applicable", ...extra });

describe("scheduled completion step", () => {
  const after = Date.parse("2026-10-09T12:00:00Z");
  it("completes unstarted and started classes after their end, and legacy processing rows", async () => {
    const db = fakeDb([row("a", "scheduled"), row("b", "live", { zoho_meeting_key: "k", started_at: "2026-10-09T10:15:00Z" }), row("c", "processing", { recording_status: "pending" })]);
    const s = { completed: 0 };
    await advanceTimed(db as never, after, s);
    expect(s.completed).toBe(3);
    expect(db.updates.map((u) => u.patch["status"])).toEqual(["completed", "completed", "completed"]);
    expect(db.updates[1]!.patch["recording_status"]).toBe("pending"); // recording lookup continues independently
  });
  it("leaves running classes alone and is a no-op on a second run", async () => {
    const db = fakeDb([row("a", "live")]);
    const s = { completed: 0 };
    await advanceTimed(db as never, Date.parse("2026-10-09T10:30:00Z"), s);
    expect(s.completed).toBe(0);
    const done = fakeDb([row("a", "completed")]);
    await advanceTimed(done as never, after, s);
    expect(done.updates).toHaveLength(0);
  });
});

describe("start/end safeguards", () => {
  it("12. a tutor can only start/end their own classes", () => {
    expect(canStartClass("trainer", "t1", "t1")).toBe(true);
    expect(canStartClass("trainer", "t1", "t2")).toBe(false);
    expect(canStartClass("student", null, "t1")).toBe(false);
    expect(canStartClass("admin", null, "t1")).toBe(true);
  });
  it("14/15. Live is written only after a start link is obtained; no second scheduler exists", () => {
    const src = readFileSync("src/services/classes.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function getClassStartLink"), src.indexOf("export async function endClassNow"));
    expect(fn.indexOf('status: "live"')).toBeGreaterThan(fn.indexOf("url = s.startLink"));
    const cron = readFileSync("src/server/classes/class-lifecycle.server.ts", "utf8");
    expect(cron).not.toContain('"live" }');
    expect(src).not.toMatch(/setInterval/);
  });
});
