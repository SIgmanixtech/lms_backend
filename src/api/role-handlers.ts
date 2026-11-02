import { createStudentSchema, createTrainerSchema, deleteAccountSchema, resetPasswordSchema, updateStudentSchema, updateTrainerSchema } from "@/features/accounts/schemas/account.schemas";
import { setAccountStatusSchema } from "@/features/auth/schemas/auth.schemas";
import { myNotificationsQuerySchema, notificationIdSchema } from "@/features/notifications/schemas/notification.schemas";
import { pathParams, ROLE_API, ROLE_SEGMENT, type RoleOperation } from "@/lib/api/contracts";
import { progressBatchSchema } from "@/lib/progress/progress-batch";
import type { AppRole } from "@/types/profile";
import { endpoint, type EndpointContext, type EndpointOptions } from "@backend/lib/http/endpoint";
import { ADMIN_WRITE, UPLOAD, ZOHO } from "@backend/lib/http/limits";
import { parseBare, parseWith, parseWithDetails } from "@backend/services/validation";
import { createStudentAccount, createTrainerAccount, deleteAccount, resetAccountPassword, updateStudentAccount, updateTrainerAccount } from "@backend/services/accounts";
import { setAccountStatus } from "@backend/services/auth";
import { findClassRecordings, getAttendanceReview, markAttendanceReviewed, openZohoRecording, overrideAttendance, overrideSchema, retryAttendance } from "@backend/services/attendance";
import { checkZohoConnection, createClassSchema, createClassWithMeeting, endClassNow, getClassStartLink, getZohoStatus, idSchema, moveClassDay, moveClassSchema, retryClassMeeting, settleClassStatuses, updateClassSchema, updateClassWithMeeting } from "@backend/services/classes";
import { curriculumDeleteSchema, deleteCurriculumItem } from "@backend/services/curriculum";
import { getDashboardSummary } from "@backend/services/dashboard";
import { countMyUnread, getMyProfile, listMyNotifications, markAllMyNotificationsRead, markMyNotificationRead } from "@backend/services/me";
import { getDeliveryConfig, getFirebaseWebApiKey, runDeliveryNow, sendAdminDailyWelcome } from "@backend/services/notifications";
import { getMyProgress, getStudentsProgress } from "@backend/services/progress";
import { deleteAssignment, deleteBatch, getAssignmentAttachmentUrl, UPLOAD_MAX_BODY_BYTES, uploadAssignmentAttachment, uploadSchema } from "@backend/services/scheduling";

/**
 * One handler per role operation (ROLE_API in contracts.ts). Each role gets its own endpoint for every
 * operation it may use, at /api/v1/<role segment>/<path>; all of them run the handler defined here, so
 * the behaviour is identical for every role. A handler bound to a role accepts only that role's callers,
 * checked on the server before the handler runs.
 */
export interface RoleRoute {
  handle: (request: Request) => Promise<Response>;
  options: (request: Request) => Response;
}

type HandlerFor = (role: AppRole) => RoleRoute;

/** Reads the `:params` of an operation's path template from a request path. */
function paramReader(op: RoleOperation, role: AppRole): ((pathname: string) => Record<string, string>) | undefined {
  const names = pathParams(op);
  if (!names.length) return undefined;
  const pattern = new RegExp(`/${ROLE_SEGMENT[role]}/${ROLE_API[op].path.replace(/:\w+/g, "([^/]+)")}/?$`);
  return (pathname) => {
    const m = pattern.exec(pathname);
    const out: Record<string, string> = {};
    names.forEach((n, i) => { const v = m?.[i + 1]; if (v !== undefined) out[n] = decodeURIComponent(v); });
    return out;
  };
}

function define<I, O>(op: RoleOperation, opts: Omit<EndpointOptions<I>, "method" | "access" | "pathParams">, handler: (ctx: EndpointContext<I> & { role: AppRole }) => Promise<O>): HandlerFor {
  return (role) => {
    const params = paramReader(op, role);
    return endpoint<I, O>({ ...opts, method: ROLE_API[op].method, access: role, ...(params ? { pathParams: params } : {}) }, (ctx) => handler({ ...ctx, role }));
  };
}

export const ROLE_HANDLERS: Record<RoleOperation, HandlerFor> = {
  // Own account and data (every role)
  profile: define("profile", {}, ({ auth }) => getMyProfile(auth)),
  dashboard: define("dashboard", {}, ({ auth, role }) => getDashboardSummary(auth, role)),
  myNotifications: define("myNotifications", { input: parseBare(myNotificationsQuerySchema) }, ({ auth, data }) => listMyNotifications(auth, data)),
  myUnreadCount: define("myUnreadCount", {}, ({ auth }) => countMyUnread(auth)),
  markNotificationRead: define("markNotificationRead", { input: parseBare(notificationIdSchema), maxBodyBytes: 1024 }, ({ auth, data }) => markMyNotificationRead(auth, data)),
  markAllNotificationsRead: define("markAllNotificationsRead", {}, ({ auth }) => markAllMyNotificationsRead(auth)),
  firebaseWebApiKey: define("firebaseWebApiKey", {}, () => getFirebaseWebApiKey()),
  openZohoRecording: define("openZohoRecording", { input: parseWith(idSchema), rateLimit: ZOHO }, ({ auth, data, request }) => openZohoRecording(auth, data, request)),
  assignmentAttachmentUrl: define("assignmentAttachmentUrl", { input: parseBare(idSchema) }, ({ auth, data }) => getAssignmentAttachmentUrl(auth, data)),

  // Accounts, curriculum, batches and delivery (admin)
  createStudent: define("createStudent", { input: parseWith(createStudentSchema), rateLimit: ADMIN_WRITE }, ({ auth, data }) => createStudentAccount(auth, data)),
  createTrainer: define("createTrainer", { input: parseWith(createTrainerSchema), rateLimit: ADMIN_WRITE }, ({ auth, data }) => createTrainerAccount(auth, data)),
  updateStudent: define("updateStudent", { input: parseWith(updateStudentSchema) }, ({ auth, data }) => updateStudentAccount(auth, data)),
  updateTrainer: define("updateTrainer", { input: parseWith(updateTrainerSchema) }, ({ auth, data }) => updateTrainerAccount(auth, data)),
  resetPassword: define("resetPassword", { input: parseWith(resetPasswordSchema), rateLimit: ADMIN_WRITE }, ({ auth, data }) => resetAccountPassword(auth, data)),
  deleteAccount: define("deleteAccount", { input: parseWith(deleteAccountSchema), rateLimit: ADMIN_WRITE }, ({ auth, data }) => deleteAccount(auth, data)),
  accountStatus: define("accountStatus", { input: parseWithDetails(setAccountStatusSchema), rateLimit: ADMIN_WRITE }, ({ auth, data }) => setAccountStatus(auth, data)),
  deleteCurriculumItem: define("deleteCurriculumItem", { input: parseBare(curriculumDeleteSchema), rateLimit: ADMIN_WRITE }, ({ auth, data }) => deleteCurriculumItem(auth, data)),
  deleteBatch: define("deleteBatch", { input: parseBare(idSchema), rateLimit: ADMIN_WRITE }, ({ auth, data }) => deleteBatch(auth, data)),
  adminDailyWelcome: define("adminDailyWelcome", {}, ({ auth }) => sendAdminDailyWelcome(auth)),
  deliveryConfig: define("deliveryConfig", {}, ({ auth }) => getDeliveryConfig(auth)),
  runDelivery: define("runDelivery", { rateLimit: ADMIN_WRITE }, ({ auth }) => runDeliveryNow(auth)),
  zohoCheck: define("zohoCheck", { rateLimit: ZOHO }, ({ auth }) => checkZohoConnection(auth)),

  // Classes, attendance and assignments (admin and trainer)
  overrideAttendance: define("overrideAttendance", { input: parseWith(overrideSchema) }, ({ auth, data }) => overrideAttendance(auth, data)),
  attendanceReview: define("attendanceReview", { input: parseWith(idSchema) }, ({ auth, data }) => getAttendanceReview(auth, data)),
  markAttendanceReviewed: define("markAttendanceReviewed", { input: parseWith(idSchema) }, ({ auth, data }) => markAttendanceReviewed(auth, data)),
  retryAttendance: define("retryAttendance", { input: parseWith(idSchema) }, ({ auth, data }) => retryAttendance(auth, data)),
  createClass: define("createClass", { input: parseWith(createClassSchema) }, ({ auth, data }) => createClassWithMeeting(auth, data)),
  updateClass: define("updateClass", { input: parseWith(updateClassSchema) }, ({ auth, data }) => updateClassWithMeeting(auth, data)),
  moveClassDay: define("moveClassDay", { input: parseWith(moveClassSchema) }, ({ auth, data }) => moveClassDay(auth, data)),
  retryClassMeeting: define("retryClassMeeting", { input: parseWith(idSchema), rateLimit: ZOHO }, ({ auth, data }) => retryClassMeeting(auth, data)),
  classStartLink: define("classStartLink", { input: parseWith(idSchema), rateLimit: ZOHO }, ({ auth, data }) => getClassStartLink(auth, data)),
  endClass: define("endClass", { input: parseWith(idSchema) }, ({ auth, data }) => endClassNow(auth, data)),
  settleClasses: define("settleClasses", {}, ({ auth }) => settleClassStatuses(auth)),
  findClassRecordings: define("findClassRecordings", { input: parseWith(idSchema), rateLimit: ZOHO }, ({ auth, data }) => findClassRecordings(auth, data)),
  zohoStatus: define("zohoStatus", {}, ({ auth }) => getZohoStatus(auth)),
  deleteAssignment: define("deleteAssignment", { input: parseBare(idSchema) }, ({ auth, data }) => deleteAssignment(auth, data)),
  uploadAssignmentAttachment: define("uploadAssignmentAttachment", { input: parseBare(uploadSchema), rateLimit: UPLOAD, maxBodyBytes: UPLOAD_MAX_BODY_BYTES }, ({ auth, data }) => uploadAssignmentAttachment(auth, data)),
  studentsProgress: define("studentsProgress", { input: parseWithDetails(progressBatchSchema), maxBodyBytes: 32 * 1024 }, ({ auth, data }) => getStudentsProgress(auth, data)),

  // Student
  myProgress: define("myProgress", { input: parseWithDetails(progressBatchSchema), maxBodyBytes: 32 * 1024 }, ({ auth, data }) => getMyProgress(auth, data)),
};
