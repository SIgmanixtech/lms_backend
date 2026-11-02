/**
 * The HTTP contract between the frontend and the Next.js backend (`backend/`).
 * Both sides import this file, so paths and response shapes can't drift apart.
 * Types only and constants: no runtime dependencies, safe in either bundle.
 */
import type { AccessState } from "@/features/auth/services/access-state";
import type { AppRole, Profile } from "@/types/profile";
import type { Notification } from "@/types/notification";

/** Version prefix of the backend API. Infrastructure paths (/api/public, /api/health) are not versioned. */
export const API_V1 = "/api/v1";

/**
 * Routes with no role in the path:
 * - /api/v1/auth/*  session: sign-in, renewal, sign-out, own password, `me` (any signed-in user)
 * - /api/public/*   no user token (signed tickets or shared secrets; called by external schedulers too)
 * Everything else is a role API, listed once in ROLE_API below.
 */
export const API_ROUTES = {
  // Session (public: no user token yet)
  login: "/api/v1/auth/login",
  refreshSession: "/api/v1/auth/refresh",
  // Session (any signed-in user, including one who must change their password)
  /** The caller's access state and role (minimal; the full profile is GET /api/v1/<role>/profile). */
  myAccess: "/api/v1/auth/me",
  signOut: "/api/v1/auth/logout",
  changePassword: "/api/v1/auth/change-password",

  // Public (no user token): signed tickets / bootstrap secret / cron secret
  recordingStream: "/api/public/recordings/stream",
  signedFile: "/api/public/files",
  bootstrapAdmin: "/api/public/bootstrap-admin",
  cronDeliverNotifications: "/api/public/cron/deliver-notifications",
} as const;

export const APP_ROLES = ["admin", "trainer", "student"] as const satisfies readonly AppRole[];

/** URL segment of each role: trainers are "tutor" in URLs (the stored role value stays "trainer"). */
export const ROLE_SEGMENT = { admin: "admin", trainer: "tutor", student: "student" } as const satisfies Record<AppRole, string>;

const ALL = APP_ROLES;
const ADMIN = ["admin"] as const;
const TEACHING = ["admin", "trainer"] as const;
const STUDENT = ["student"] as const;

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Role APIs. Each role has its own endpoints: an operation is served at `/api/v1/<role segment>/<path>`
 * for each role listed, and only that role may call that path (checked on the server before anything
 * runs). An operation available to several roles behaves the same for each: every path runs the same
 * backend handler, and the data is still limited to what that user may see (Row Level Security).
 *
 * `:name` in a path is filled from the request field of the same name (and removed from the body).
 * GET and DELETE send any other fields as query parameters; the other methods send them as JSON.
 */
export const ROLE_API = {
  // Own account and data (every role)
  profile: { method: "GET", path: "profile", roles: ALL },
  dashboard: { method: "GET", path: "dashboard", roles: ALL },
  myNotifications: { method: "GET", path: "notifications", roles: ALL },
  myUnreadCount: { method: "GET", path: "notifications/unread-count", roles: ALL },
  markNotificationRead: { method: "PATCH", path: "notifications/:id", roles: ALL },
  markAllNotificationsRead: { method: "POST", path: "notifications/read-all", roles: ALL },
  firebaseWebApiKey: { method: "GET", path: "firebase-key", roles: ALL },
  openZohoRecording: { method: "POST", path: "recordings/:id/open", roles: ALL },
  assignmentAttachmentUrl: { method: "GET", path: "assignments/:id/attachment", roles: ALL },

  // Accounts, curriculum, batches and delivery (admin)
  createStudent: { method: "POST", path: "students", roles: ADMIN },
  createTrainer: { method: "POST", path: "tutors", roles: ADMIN },
  updateStudent: { method: "PATCH", path: "students/:profileId", roles: ADMIN },
  updateTrainer: { method: "PATCH", path: "tutors/:profileId", roles: ADMIN },
  resetPassword: { method: "POST", path: "users/:profileId/reset-password", roles: ADMIN },
  deleteAccount: { method: "DELETE", path: "users/:profileId", roles: ADMIN },
  accountStatus: { method: "PATCH", path: "users/:profileId/status", roles: ADMIN },
  deleteCurriculumItem: { method: "DELETE", path: "curriculum/:kind/:id", roles: ADMIN },
  deleteBatch: { method: "DELETE", path: "batches/:id", roles: ADMIN },
  adminDailyWelcome: { method: "POST", path: "notifications/welcome", roles: ADMIN },
  deliveryConfig: { method: "GET", path: "notifications/delivery-config", roles: ADMIN },
  runDelivery: { method: "POST", path: "notifications/run-delivery", roles: ADMIN },
  zohoCheck: { method: "POST", path: "zoho/check", roles: ADMIN },

  // Classes, attendance and assignments (admin and tutor)
  overrideAttendance: { method: "PATCH", path: "classes/:class_id/attendance/:student_id", roles: TEACHING },
  attendanceReview: { method: "GET", path: "classes/:id/attendance-review", roles: TEACHING },
  markAttendanceReviewed: { method: "POST", path: "classes/:id/attendance-review", roles: TEACHING },
  retryAttendance: { method: "POST", path: "classes/:id/attendance/retry", roles: TEACHING },
  createClass: { method: "POST", path: "classes", roles: TEACHING },
  updateClass: { method: "PATCH", path: "classes/:id", roles: TEACHING },
  moveClassDay: { method: "PATCH", path: "classes/:id/date", roles: TEACHING },
  retryClassMeeting: { method: "POST", path: "classes/:id/meeting/retry", roles: TEACHING },
  classStartLink: { method: "POST", path: "classes/:id/start", roles: TEACHING },
  endClass: { method: "POST", path: "classes/:id/end", roles: TEACHING },
  settleClasses: { method: "POST", path: "classes/settle", roles: TEACHING },
  findClassRecordings: { method: "POST", path: "classes/:id/recordings/find", roles: TEACHING },
  zohoStatus: { method: "GET", path: "zoho/status", roles: TEACHING },
  deleteAssignment: { method: "DELETE", path: "assignments/:id", roles: TEACHING },
  uploadAssignmentAttachment: { method: "PUT", path: "assignments/:id/attachment", roles: TEACHING },
  /** Progress for a whole students-table page in one request. */
  studentsProgress: { method: "POST", path: "students/progress", roles: TEACHING },

  // Student
  /** The calling student's own progress per enrollment (other students' ids are refused). */
  myProgress: { method: "POST", path: "progress", roles: STUDENT },
} as const satisfies Record<string, { method: ApiMethod; path: string; roles: readonly AppRole[] }>;

export type RoleOperation = keyof typeof ROLE_API;

/** `/api/v1/<role segment>/<path template>` for an operation, or null when that role has no such endpoint. */
export function roleApiPath(role: AppRole, op: RoleOperation): string | null {
  const def = ROLE_API[op];
  return (def.roles as readonly AppRole[]).includes(role) ? `${API_V1}/${ROLE_SEGMENT[role]}/${def.path}` : null;
}

/** Names of the `:params` in an operation's path, in order. */
export function pathParams(op: RoleOperation): string[] {
  return [...ROLE_API[op].path.matchAll(/:(\w+)/g)].map((m) => m[1]!);
}

export type ApiRoute = (typeof API_ROUTES)[keyof typeof API_ROUTES] | `${typeof API_V1}/${string}`;

// ---- Data endpoints: tables, database functions and files, per role ----

type DataMethod = "GET" | "POST" | "PATCH" | "DELETE";
const READ = ["GET"] as const;
const WRITE = ["GET", "POST", "PATCH", "DELETE"] as const;

/** Every table the app reads or writes (notifications have their own endpoints above). */
export const DATA_TABLES = [
  "announcements", "assessment_access", "assessment_answer_keys", "assessment_attempt_answers", "assessment_attempts",
  "assessment_questions", "assessments", "assignment_answer_keys", "assignment_questions", "assignments", "attendance",
  "batches", "certificates", "classes", "course_modules", "courses", "enrollments", "internships", "lesson_progress",
  "lesson_resources", "lessons", "payments", "profiles", "push_subscriptions", "recording_views", "recordings", "students",
  "submission_answers", "submission_files", "submissions", "system_settings", "trainer_assignments", "trainers",
] as const;
export type DataTable = (typeof DATA_TABLES)[number];

const allTables = (methods: readonly DataMethod[], except: readonly DataTable[] = []) =>
  Object.fromEntries(DATA_TABLES.filter((t) => !except.includes(t)).map((t) => [t, methods])) as Partial<Record<DataTable, readonly DataMethod[]>>;

/**
 * Which tables each role may use, and how. Served at `/api/v1/<role segment>/<table with dashes>` (a page of
 * rows, with the usual select/filter/order/range query) and `/api/v1/<role segment>/<table>/:id` (one row).
 * The backend refuses anything not listed here for that role; Row Level Security still decides which rows.
 */
export const ROLE_TABLES: Record<AppRole, Partial<Record<DataTable, readonly DataMethod[]>>> = {
  admin: allTables(WRITE),
  trainer: {
    ...allTables(READ, ["system_settings"]),
    assessments: WRITE, assessment_questions: WRITE, assessment_answer_keys: WRITE, assessment_access: WRITE,
    assignments: WRITE, assignment_questions: WRITE, assignment_answer_keys: WRITE,
    attendance: ["GET", "POST", "PATCH"], submissions: ["GET", "PATCH"],
    course_modules: ["GET", "POST", "PATCH"], lessons: ["GET", "POST", "PATCH"], lesson_resources: ["GET", "POST", "PATCH"],
    recordings: ["GET", "POST"], push_subscriptions: WRITE,
  },
  student: {
    ...allTables(READ, ["assessment_answer_keys", "assignment_answer_keys", "system_settings"]),
    profiles: ["GET", "PATCH"], students: ["GET", "PATCH"],
    submissions: ["GET", "POST", "PATCH"], submission_files: ["GET", "POST"], push_subscriptions: WRITE,
  },
};

/** Database functions, each at its own path per role (POST). */
export const ROLE_FUNCTIONS = {
  class_tutor_names: { path: "classes/tutor-names", roles: ALL },
  submit_assignment_answers: { path: "assignments/submit-answers", roles: STUDENT },
  start_assessment_attempt: { path: "assessments/attempts/start", roles: STUDENT },
  submit_assessment_attempt: { path: "assessments/attempts/submit", roles: STUDENT },
  grade_submission_answer: { path: "submissions/grade-answer", roles: TEACHING },
  grade_assessment_answer: { path: "assessments/grade-answer", roles: TEACHING },
} as const satisfies Record<string, { path: string; roles: readonly AppRole[] }>;
export type DataFunction = keyof typeof ROLE_FUNCTIONS;

/** Private storage buckets each role may upload to (`POST /api/v1/<role>/files/<bucket>/<path>`). Signed links (`files/sign/...`) are open to every role; Storage policies decide. */
export const FILE_BUCKETS_ALL = ["avatars", "course-resources", "submissions", "recordings", "certificates"] as const;
export const ROLE_UPLOAD_BUCKETS: Record<AppRole, readonly (typeof FILE_BUCKETS_ALL)[number][]> = {
  admin: FILE_BUCKETS_ALL,
  trainer: ["course-resources", "recordings"],
  student: ["avatars", "submissions"],
};

/** URL name of a table: underscores become dashes (`trainer_assignments` -> `trainer-assignments`). */
export const tableSegment = (table: string) => table.replace(/_/g, "-");

/** Path templates (with `:id`) taken by the role operations above, per role and method; data routes never reuse them. */
function opTaken(role: AppRole, method: string, template: string): boolean {
  return (Object.keys(ROLE_API) as RoleOperation[]).some((op) => {
    const d = ROLE_API[op];
    return d.method === method && (d.roles as readonly AppRole[]).includes(role) && d.path.replace(/:\w+/g, ":id") === template;
  });
}

/** Methods a role may use on a table, split into the collection path and the `/:id` path (minus routes taken by operations). */
export function tableMethods(role: AppRole, table: DataTable): { collection: DataMethod[]; item: DataMethod[] } {
  const allowed = ROLE_TABLES[role][table] ?? [];
  const seg = tableSegment(table);
  return {
    collection: allowed.filter((m) => !opTaken(role, m, seg)),
    item: allowed.filter((m) => m !== "POST" && !opTaken(role, m, `${seg}/:id`)),
  };
}

export interface OkResult { ok: true }
export interface EmailStatus { sent: boolean; reason?: string }

export interface CreatedAccount { profileId: string; fullName: string; email: string; code: string; temporaryPassword: string; courseName?: string; batchName?: string; enrollmentWarning?: string; emailStatus: EmailStatus }
export interface ResetPasswordResult { fullName: string; email: string; temporaryPassword: string; emailStatus: EmailStatus }
export type DeleteOutcome = { outcome: "deleted" | "deactivated" };

export interface AccessResult { state: AccessState; role: string | null }

/** Session issued at sign-in. The frontend stores it and renews it only through /api/v1/auth/refresh. */
export interface LoginSession { access_token: string; refresh_token: string; expires_at: number | null; expires_in: number; token_type: string }
/** Returned only for accounts that may continue (state "active" or "must_change_password"). */
export interface LoginResult { session: LoginSession; user: { id: string; email: string | null }; profile: Profile; state: AccessState }

/** Renewed session (POST /api/v1/auth/refresh); refused for inactive or unprovisioned accounts. */
export interface RefreshResult { session: LoginSession; user: { id: string; email: string | null } }

export interface AttendanceReview { attendanceStatus: string; lastError: string | null; processedAt: string | null; unmatched: { email: string | null; minutes: number }[] }
export interface RetryAttendanceResult { ok: true; message: string }
export interface RecordingLinkResult { found: number; linked: number; generating: number }

export interface ClassSaveResult { id: string; meeting: "none" | "created" | "updated" | "cancelled" | "failed"; warning?: string }
export interface UrlResult { url: string }
export interface SettleResult { completed: number }
export interface ZohoStatusResult { configured: boolean }
export type ZohoCheckResult =
  | { configured: false; missing: string[] }
  | { configured: true; signIn: "ok" | "failed"; httpStatus: number | null; zohoCode: string | null; zsoid: string | null; zuid: string | null; orgIdMatches: boolean | null; presenterIdMatches: boolean | null };

export type CurriculumDeleteOutcome = { outcome: "deleted" | "archived" };
export type RemovalOutcome = { outcome: "deleted" | "archived" | "closed" };

/** Overall progress (0..1, or null when there isn't enough data), in the same order as the request's items. */
export interface StudentsProgressResult { progress: (number | null)[] }

/** Dashboard tile values by metric key (see features/dashboard/dashboard-metrics.ts); fees in minor units. */
export interface DashboardSummary { role: string; counts: Record<string, number>; outstandingFees: number | null }

export interface DeliveryConfigResult { email: boolean; push: boolean; appUrl: boolean }
export interface DispatchSummaryResult { claimed: number; sent: number; failed: number; skipped: number; retrying: number }
export interface WelcomeResult { ok: boolean }
export interface FirebaseWebApiKeyResult { apiKey: string | null }

/** GET /api/v1/<role>/profile: the caller's own profile. */
export interface MyProfileResult { userId: string; email: string | null; profile: Profile }

/** GET /api/v1/<role>/notifications: one page (25 rows) of the caller's notifications, newest first. */
export interface MyNotificationsResult { rows: Notification[]; count: number }
export interface UnreadCountResult { unread: number }
/** PATCH /api/v1/<role>/notifications/:id: when the notification was read (already-read rows keep their time). */
export interface MarkReadResult { id: string; readAt: string }
export interface MarkAllReadResult { marked: number }

/** Error body for every non-2xx JSON response. */
export interface ApiErrorBody { error: { code: string; message: string; details?: Record<string, string[]>; correlationId?: string } }
