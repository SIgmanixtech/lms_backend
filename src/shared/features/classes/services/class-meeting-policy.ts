/** Pure decision rules for keeping a class and its Zoho meeting in step. No I/O. */
export type ClassType = "online" | "offline" | "hybrid";
export interface ClassState { class_type: ClassType; status: string; title: string; class_date: string; start_time: string; end_time: string; zoho_meeting_key: string | null }
export type MeetingAction = "none" | "create" | "update" | "delete";

export const needsMeeting = (t: ClassType) => t === "online" || t === "hybrid";

export function meetingAction(before: ClassState | null, after: ClassState): MeetingAction {
  const key = before?.zoho_meeting_key ?? null;
  const wants = needsMeeting(after.class_type) && after.status !== "cancelled" && after.status !== "completed";
  if (!wants) return key && (after.status === "cancelled" || !needsMeeting(after.class_type)) ? "delete" : "none";
  if (!key) return after.status === "scheduled" || after.status === "live" ? "create" : "none";
  const changed = !before || before.title !== after.title || before.class_date !== after.class_date
    || before.start_time.slice(0, 5) !== after.start_time.slice(0, 5) || before.end_time.slice(0, 5) !== after.end_time.slice(0, 5);
  return changed ? "update" : "none";
}

/** Only these roles see the presenter start link, and a tutor only for their own class. */
export function canStartClass(role: string | null, callerTrainerId: string | null, classTrainerId: string): boolean {
  if (role === "admin") return true;
  return role === "trainer" && !!callerTrainerId && callerTrainerId === classTrainerId;
}
