/**
 * Pure notification filter rules. Types come from the existing `event_key`
 * prefixes written by the database triggers / server code — no second taxonomy.
 */
export type ReadFilter = "all" | "unread" | "read";

export interface NotificationType { value: string; label: string; prefixes: string[] }

export const NOTIFICATION_TYPES: NotificationType[] = [
  { value: "assignment_published", label: "Assignment published", prefixes: ["assignment.published:"] },
  { value: "assignment_deadline", label: "Assignment deadline changed / due soon", prefixes: ["assignment.deadline:", "assignment.due:"] },
  { value: "submission_submitted", label: "Assignment submitted", prefixes: ["submission.submitted:"] },
  { value: "submission_graded", label: "Submission graded", prefixes: ["submission.graded:"] },
  { value: "submission_reopened", label: "Submission reopened", prefixes: ["submission.reopened:"] },
  { value: "payment_received", label: "Payment received", prefixes: ["payment.received:"] },
  { value: "class_completed", label: "Class completed", prefixes: ["class.completed:"] },
  { value: "recording_available", label: "Recording available", prefixes: ["recording.available:"] },
  { value: "attendance_absent", label: "Student marked absent", prefixes: ["attendance.absent:"] },
  { value: "attendance_processed", label: "Attendance processed", prefixes: ["attendance.processed:", "attendance.review:"] },
  { value: "class_scheduled", label: "Class scheduled", prefixes: ["class.scheduled:"] },
  { value: "class_rescheduled", label: "Class moved", prefixes: ["class.rescheduled:"] },
  { value: "class_cancelled", label: "Class cancelled", prefixes: ["class.cancelled:"] },
  { value: "class_reminder", label: "Class reminders", prefixes: ["class.reminder."] },
  { value: "tutor_assigned", label: "Tutor assigned", prefixes: ["tutor.assigned:"] },
  { value: "account_created", label: "Account created / welcome", prefixes: ["account.created:"] },
  { value: "admin_welcome", label: "Admin sign-in", prefixes: ["admin.welcome:"] },
  { value: "certificate_issued", label: "Certificate issued", prefixes: ["certificate.issued:"] },
  { value: "certificate_revoked", label: "Certificate revoked", prefixes: ["certificate.revoked:"] },
  { value: "internship", label: "Internship created / status changed", prefixes: ["internship."] },
  { value: "announcement", label: "Announcement published", prefixes: ["announcement.published:"] },
];

export const OTHER_TYPE = "other";

export interface NotificationFilters { read: ReadFilter; type: string; search: string }
export const DEFAULT_FILTERS: NotificationFilters = { read: "all", type: "", search: "" };

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const safeSearch = (s: string) => s.trim().replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();

/** Minimal query surface so this logic is testable without a live client. */
export interface FilterableQuery<Q> {
  is(column: string, value: null): Q;
  not(column: string, op: string, value: unknown): Q;
  or(filter: string): Q;
}

/** Applies filters server-side (PostgREST). Each call narrows; filters combine with AND. */
export function applyNotificationFilters<Q extends FilterableQuery<Q>>(query: Q, f: NotificationFilters): Q {
  let q = query;
  if (f.read === "unread") q = q.is("read_at", null);
  if (f.read === "read") q = q.not("read_at", "is", null);
  if (f.type === OTHER_TYPE) {
    // Rows without any known prefix (including rows without an event_key).
    const known = NOTIFICATION_TYPES.flatMap((t) => t.prefixes).map((p) => `event_key.not.like.${likeEscape(p)}*`).join(",");
    q = q.or(`event_key.is.null,and(${known})`);
  } else if (f.type) {
    const t = NOTIFICATION_TYPES.find((x) => x.value === f.type);
    if (t) q = q.or(t.prefixes.map((p) => `event_key.like.${likeEscape(p)}*`).join(","));
  }
  const s = safeSearch(f.search);
  if (s) q = q.or(`title.ilike.*${s}*,body.ilike.*${s}*`);
  return q;
}

/** Label for a notification's type, derived from its event_key. */
export function typeOf(eventKey: string | null | undefined): NotificationType | undefined {
  if (!eventKey) return undefined;
  return NOTIFICATION_TYPES.find((t) => t.prefixes.some((p) => eventKey.startsWith(p)));
}

/** In-memory equivalent of applyNotificationFilters (used for optimistic cache updates and tests). */
export function matchesFilters(n: { read_at: string | null; event_key: string | null; title: string; body: string | null }, f: NotificationFilters): boolean {
  if (f.read === "unread" && n.read_at) return false;
  if (f.read === "read" && !n.read_at) return false;
  if (f.type === OTHER_TYPE && typeOf(n.event_key)) return false;
  if (f.type && f.type !== OTHER_TYPE && typeOf(n.event_key)?.value !== f.type) return false;
  const s = safeSearch(f.search).toLowerCase();
  if (s && !`${n.title} ${n.body ?? ""}`.toLowerCase().includes(s)) return false;
  return true;
}

/** Only allow in-app relative links (never navigate to external URLs from a notification). */
export function safeLink(link: string | null | undefined): string | null {
  return link && link.startsWith("/") && !link.startsWith("//") ? link : null;
}
