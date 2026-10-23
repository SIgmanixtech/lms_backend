/**
 * The HTTP contract between the frontend and the Next.js backend (`backend/`).
 * Both sides import this file, so paths and response shapes can't drift apart.
 * Types only and constants: no runtime dependencies, safe in either bundle.
 */
import type { AccessState } from "@/features/auth/services/access-state";
import type { Profile } from "@/types/profile";

export const API_ROUTES = {
  // Sign-in (public: no user token)
  login: "/api/auth/login",
  // Accounts (admin)
  createStudent: "/api/accounts/students/create",
  createTrainer: "/api/accounts/trainers/create",
  updateStudent: "/api/accounts/students/update",
  updateTrainer: "/api/accounts/trainers/update",
  resetPassword: "/api/accounts/reset-password",
  deleteAccount: "/api/accounts/delete",
  // Auth
  myAccess: "/api/auth/access",
  changePassword: "/api/auth/change-password",
  accountStatus: "/api/auth/account-status",
  // Attendance
  overrideAttendance: "/api/attendance/override",
  attendanceReview: "/api/attendance/review",
  markAttendanceReviewed: "/api/attendance/review/mark",
  retryAttendance: "/api/attendance/retry",
  // Classes & Zoho
  createClass: "/api/classes/create",
  updateClass: "/api/classes/update",
  moveClassDay: "/api/classes/move",
  retryClassMeeting: "/api/classes/retry-meeting",
  classStartLink: "/api/classes/start-link",
  endClass: "/api/classes/end",
  settleClasses: "/api/classes/settle",
  findClassRecordings: "/api/classes/recordings/find",
  zohoStatus: "/api/zoho/status",
  zohoCheck: "/api/zoho/check",
  // Recordings
  openZohoRecording: "/api/recordings/open",
  recordingStream: "/api/public/recordings/stream",
  // Curriculum & scheduling
  deleteCurriculumItem: "/api/curriculum/delete",
  deleteBatch: "/api/batches/delete",
  deleteAssignment: "/api/assignments/delete",
  uploadAssignmentAttachment: "/api/assignments/attachment/upload",
  assignmentAttachmentUrl: "/api/assignments/attachment/url",
  // Notifications & delivery
  adminDailyWelcome: "/api/notifications/admin-welcome",
  deliveryConfig: "/api/notifications/delivery-config",
  runDelivery: "/api/notifications/run-delivery",
  // Integrations
  firebaseWebApiKey: "/api/firebase/web-api-key",
  // Public (no user token): bootstrap secret / cron secret
  bootstrapAdmin: "/api/public/bootstrap-admin",
  cronDeliverNotifications: "/api/public/cron/deliver-notifications",
} as const;

export type ApiRoute = (typeof API_ROUTES)[keyof typeof API_ROUTES];

export interface OkResult { ok: true }
export interface EmailStatus { sent: boolean; reason?: string }

export interface CreatedAccount { profileId: string; fullName: string; email: string; code: string; temporaryPassword: string; courseName?: string; batchName?: string; enrollmentWarning?: string; emailStatus: EmailStatus }
export interface ResetPasswordResult { fullName: string; email: string; temporaryPassword: string; emailStatus: EmailStatus }
export type DeleteOutcome = { outcome: "deleted" | "deactivated" };

export interface AccessResult { state: AccessState; role: string | null }

/** Supabase session issued at sign-in; the frontend hands it to the Supabase client, which refreshes it. */
export interface LoginSession { access_token: string; refresh_token: string; expires_at: number | null; expires_in: number; token_type: string }
/** Returned only for accounts that may continue (state "active" or "must_change_password"). */
export interface LoginResult { session: LoginSession; user: { id: string; email: string | null }; profile: Profile; state: AccessState }

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

export interface DeliveryConfigResult { email: boolean; push: boolean; appUrl: boolean }
export interface DispatchSummaryResult { claimed: number; sent: number; failed: number; skipped: number; retrying: number }
export interface WelcomeResult { ok: boolean }
export interface FirebaseWebApiKeyResult { apiKey: string | null }

/** Error body for every non-2xx JSON response. */
export interface ApiErrorBody { error: { code: string; message: string; details?: Record<string, string[]>; correlationId?: string } }
