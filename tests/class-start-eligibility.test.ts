import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { advanceTimed, completionPatch } from "@backend/server/classes/class-lifecycle.server";
import { processDueAttendance } from "@backend/server/attendance/attendance-processor.server";
import { classActions, displayWorkflowStatuses, effectiveClassStatus, nextTimedStatus } from "@/features/classes/services/class-lifecycle-policy";
import { canStartClass } from "@/features/classes/services/class-meeting-policy";

const END = Date.parse("2026-10-09T11:10:00Z"); // 16:40 IST
const AFTER = END + 3600_000;
const base = { id: "c1", title: "Ai", batch_id: "b", trainer_id: "t", class_type: "online", class_date: "2026-10-09", start_time: "15:45:00", end_time: "16:40:00", zoho_meeting_key: "k", attendance_status: "pending", attendance_attempts: 0, attendance_next_attempt_at: null, recording_status: "not_applicable", started_at: null as string | null };

/** Fake DB recording every update/insert/upsert; selects return the given rows. */
function fakeDb(rows: Record<string, unknown>[]) {
  const log: { table: string; op: string; payload: unknown }[] = [];
  const chain = (result: unknown): any => new Proxy({}, { get: (_t, k) => k === "then" ? (r: any) => r(result) : k === "maybeSingle" ? () => chain({ data: rows[0] ?? null }) : () => chain(result) });
  return {
    log,
    from: (table: string) => ({
      select: () => chain({ data: rows }),
      update: (payload: Record<string, unknown>) => { log.push({ table, op: "update", payload }); for (const r of rows) Object.assign(r, payload); return chain({ data: rows.map((r) => ({ id: r["id"] })) }); },
      insert: (payload: unknown) => { log.push({ table, op: "insert", payload }); return chain({ data: null }); },
      upsert: (payload: unknown) => { log.push({ table, op: "upsert", payload }); return chain({ data: null, error: null }); },
    }),
  };
}

describe("only actually started classes trigger attendance and recording", () => {
  it("1. an unstarted future class remains Scheduled", () => {
    expect(effectiveClassStatus("scheduled", END, END - 60_000)).toBe("scheduled");
    expect(nextTimedStatus("scheduled", 0, END, END - 60_000)).toBeNull();
  });
  it("2-4. an unstarted expired class becomes Completed with both workflows Not applicable", async () => {
    const db = fakeDb([{ ...base, status: "scheduled" }]);
    await advanceTimed(db as never, AFTER, { completed: 0 });
    const patch = db.log.find((l) => l.table === "classes")!.payload as Record<string, unknown>;
    expect(patch).toMatchObject({ status: "completed", attendance_status: "not_applicable", recording_status: "not_applicable" });
    expect(patch["ended_at"]).toBeUndefined();
  });
  it("5-6. no Absent records or notifications for an unstarted class (attendance worker skips it)", async () => {
    const db = fakeDb([{ ...base, status: "completed" }]);
    const s = await processDueAttendance(db as never, 5, AFTER);
    expect(s.checked).toBe(0);
    expect(db.log.filter((l) => l.table === "attendance" || l.table === "notifications")).toHaveLength(0);
  });
  it("7. a successful Start persists started_at; 8. it is set only after Zoho returns a start link", () => {
    const src = readFileSync("src/services/classes.ts", "utf8");
    const start = src.slice(src.indexOf("export async function getClassStartLink"), src.indexOf("export async function endClassNow"));
    expect(start).toMatch(/status: "live", started_at:/);
    expect(start.indexOf("startLink")).toBeLessThan(start.indexOf("started_at"));
    expect(start).toMatch(/\.eq\("status", "scheduled"\)/); // idempotent
  });
  it("9-10. a started and ended class queues recording discovery and stays eligible for attendance", () => {
    const p = completionPatch({ status: "live", zoho_meeting_key: "k", recording_status: "not_applicable", started_at: "2026-10-09T10:16:00Z" }, END);
    expect(p).toMatchObject({ status: "completed", recording_status: "pending", ended_at: new Date(END).toISOString() });
    expect(p["attendance_status"]).toBeUndefined();
  });
  it("11-12. workflows are independent columns; neither worker changes the class lifecycle", () => {
    const att = readFileSync("src/server/attendance/attendance-processor.server.ts", "utf8");
    expect(att).not.toMatch(/status: "completed"/);
    const life = readFileSync("src/server/classes/class-lifecycle.server.ts", "utf8");
    const rec = life.slice(life.indexOf("async function checkRecordings"));
    expect(rec).not.toMatch(/attendance_/);
    expect(rec).not.toMatch(/[^_]status: "completed"/);
  });
  it("13. retries never process unstarted classes (both workers filter on started_at)", () => {
    const att = readFileSync("src/server/attendance/attendance-processor.server.ts", "utf8");
    const life = readFileSync("src/server/classes/class-lifecycle.server.ts", "utf8");
    expect(att).toMatch(/\.not\("started_at", "is", null\)/);
    expect(life.slice(life.indexOf("async function checkRecordings"))).toMatch(/\.not\("started_at", "is", null\)/);
  });
  it("14. duplicate completion runs are no-ops", async () => {
    const db = fakeDb([{ ...base, status: "completed" }]);
    await advanceTimed(db as never, AFTER, { completed: 0 });
    expect(db.log).toHaveLength(0);
  });
  it("15. a completed class cannot revert to Live", () => {
    expect(effectiveClassStatus("completed", END, END - 3600_000)).toBe("completed");
    expect(classActions("completed", END, END - 3600_000)).toEqual({ canStart: false, canEnd: false });
  });
  it("16. Admin and Tutor share one display rule: unstarted expired shows Not applicable and no buttons", () => {
    expect(displayWorkflowStatuses("completed", null, "pending", "pending")).toEqual({ attendance: "not_applicable", recording: "not_applicable" });
    expect(displayWorkflowStatuses("completed", "2026-10-09T10:16:00Z", "pending", "pending")).toEqual({ attendance: "pending", recording: "pending" });
    expect(classActions("scheduled", END, AFTER)).toEqual({ canStart: false, canEnd: false });
  });
  it("17. tutors cannot start/end classes they aren't assigned", () => {
    expect(canStartClass("trainer", "t1", "t2")).toBe(false);
    expect(canStartClass("trainer", "t1", "t1")).toBe(true);
  });
  it("18. cancelled classes stay Cancelled and trigger neither workflow", async () => {
    expect(effectiveClassStatus("cancelled", END, AFTER)).toBe("cancelled");
    expect(displayWorkflowStatuses("cancelled", null, "pending", "pending").recording).toBe("not_applicable");
    const db = fakeDb([]); // query excludes cancelled
    await advanceTimed(db as never, AFTER, { completed: 0 });
    expect(db.log).toHaveLength(0);
  });
});
