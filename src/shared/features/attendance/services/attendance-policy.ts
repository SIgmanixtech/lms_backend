/**
 * Pure attendance rules for automatic (Zoho) attendance. No I/O.
 * Present: >= 75% of scheduled duration.
 * Late: joined after scheduled start AND 25% <= attended < 75%.
 * Absent: no participation, < 25%, or 25–75% without a late join.
 */
export type AutoStatus = "present" | "late" | "absent";
export interface Session { joinMs: number; leaveMs: number }

export const PRESENT_THRESHOLD = 75;
export const LATE_THRESHOLD = 25;

/** Clips sessions to the class window and merges overlaps so time is never counted twice. */
export function mergeSessions(sessions: Session[], windowStart: number, windowEnd: number): Session[] {
  const clipped = sessions
    .map((s) => ({ joinMs: Math.max(s.joinMs, windowStart), leaveMs: Math.min(s.leaveMs, windowEnd) }))
    .filter((s) => s.leaveMs > s.joinMs)
    .sort((a, b) => a.joinMs - b.joinMs);
  const out: Session[] = [];
  for (const s of clipped) {
    const last = out[out.length - 1];
    if (last && s.joinMs <= last.leaveMs) last.leaveMs = Math.max(last.leaveMs, s.leaveMs);
    else out.push({ ...s });
  }
  return out;
}

export interface AttendanceResult { status: AutoStatus; attendedMs: number; percent: number; firstJoinMs: number | null; lastLeaveMs: number | null; joinedLate: boolean; merged: Session[] }

export function calculateAttendance(sessions: Session[], windowStart: number, windowEnd: number): AttendanceResult {
  const scheduled = windowEnd - windowStart;
  if (!(scheduled > 0)) throw new Error("Scheduled duration must be positive");
  const merged = mergeSessions(sessions, windowStart, windowEnd);
  const attendedMs = merged.reduce((t, s) => t + (s.leaveMs - s.joinMs), 0);
  const percent = Math.floor((attendedMs / scheduled) * 10000) / 100; // two decimals, never rounded up across a boundary
  const firstJoinRaw = sessions.length ? Math.min(...sessions.map((s) => s.joinMs)) : null;
  const joinedLate = firstJoinRaw !== null && firstJoinRaw > windowStart;
  const status: AutoStatus = percent >= PRESENT_THRESHOLD ? "present" : percent >= LATE_THRESHOLD && joinedLate ? "late" : "absent";
  return {
    status, attendedMs, percent, joinedLate, merged,
    firstJoinMs: firstJoinRaw, lastLeaveMs: sessions.length ? Math.max(...sessions.map((s) => s.leaveMs)) : null,
  };
}
