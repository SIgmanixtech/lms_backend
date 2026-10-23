/**
 * Pure class lifecycle rules (all class types):
 *   scheduled → live        only when an authorised Start class succeeds (before the scheduled end)
 *   scheduled|live → completed  at the scheduled end (automatic) or on End class
 *   cancelled / completed   terminal
 * "processing" is a legacy state and is treated as completed. Meeting, attendance and recording
 * statuses are tracked in their own columns and never hold a class open.
 */
export type ClassStatus = "scheduled" | "live" | "processing" | "completed" | "cancelled";
export type RecordingStatus = "not_applicable" | "pending" | "available" | "unavailable";

/** Minutes after the class end at which the recording is looked up: immediately, then 5/10/20/30/60. */
export const RECORDING_RETRY_MINUTES = [0, 5, 10, 20, 30, 60] as const;

/** The persisted transition the scheduled job should make, or null. Time only ever moves a class forward. */
export function nextTimedStatus(status: string, _startMs: number, endMs: number, nowMs: number): "completed" | null {
  if (status === "processing") return "completed";
  if ((status === "scheduled" || status === "live") && nowMs >= endMs) return "completed";
  return null;
}

/** The status every screen shows: the stored status, moved forward by the clock. Never moves backwards. */
export function effectiveClassStatus(status: string, endMs: number, nowMs: number): ClassStatus {
  if (status === "cancelled") return "cancelled";
  return (nextTimedStatus(status, 0, endMs, nowMs) ?? status) as ClassStatus;
}

/** Start is offered only for a class not yet started or ended; End only for a started, still-running class. */
export function classActions(status: string, endMs: number, nowMs: number): { canStart: boolean; canEnd: boolean } {
  const s = effectiveClassStatus(status, endMs, nowMs);
  return { canStart: s === "scheduled", canEnd: s === "live" };
}

/** When the next recording check is due, or null once the retry policy is exhausted. */
export function nextRecordingCheckMs(endMs: number, attemptsDone: number): number | null {
  const m = RECORDING_RETRY_MINUTES[attemptsDone];
  return m === undefined ? null : endMs + m * 60_000;
}

/**
 * The only rule for status changes made through the class edit form. Ended and terminal states
 * can't be overwritten by hand, so a finished class can never go back to Live or Scheduled.
 */
export function manualStatusChangeError(from: string, to: string, zohoManaged: boolean): string | null {
  if (from === to) return null;
  if (from === "cancelled") return "A cancelled class can't be reopened. Schedule a new class instead.";
  if (from === "completed" || from === "processing") return "This class has already ended, so its status can't be changed.";
  if (to === "cancelled") return null;
  if (zohoManaged) return "Online class status is updated automatically. Use Start class / End class instead.";
  if (from === "scheduled" && (to === "live" || to === "completed")) return null;
  if (from === "live" && to === "completed") return null;
  return "That status change isn't allowed.";
}

/**
 * Attendance and recording apply only to a class with a persisted start event (`started_at`).
 * A class that ended or was cancelled without starting shows both as Not applicable, even before
 * the scheduled job persists that.
 */
export function workflowEligible(startedAt: unknown): boolean {
  return typeof startedAt === "string" && startedAt.length > 0;
}

export function displayWorkflowStatuses(effective: string, startedAt: unknown, attendance: string, recording: string): { attendance: string; recording: string } {
  if ((effective === "completed" || effective === "cancelled") && !workflowEligible(startedAt))
    return { attendance: "not_applicable", recording: "not_applicable" };
  return { attendance, recording };
}
