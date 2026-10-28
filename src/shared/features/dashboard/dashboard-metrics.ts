import type { AppRole } from "@/types/profile";

/**
 * Dashboard tiles per role. Shared with the backend (`npm run sync-shared`), which counts them all
 * in one request (GET /api/dashboard/summary) as the caller, so Row Level Security scopes every number.
 * `fees` tiles show the outstanding fee total instead of a row count.
 */
export type MetricFilterValue = string | null;
export interface DashboardMetric {
  key: string;
  label: string;
  table: string;
  filters: Record<string, MetricFilterValue>;
  fees?: true;
}

export const DASHBOARD_METRICS: Record<AppRole, readonly DashboardMetric[]> = {
  admin: [
    { key: "students", label: "Students", table: "students", filters: {} },
    { key: "tutors", label: "Tutors", table: "trainers", filters: {} },
    { key: "courses", label: "Courses", table: "courses", filters: {} },
    { key: "batches", label: "Batches", table: "batches", filters: {} },
    {
      key: "upcomingClasses",
      label: "Upcoming Classes",
      table: "classes",
      filters: { status: "scheduled" },
    },
    {
      key: "pendingSubmissions",
      label: "Pending Submissions",
      table: "submissions",
      filters: { status: "submitted" },
    },
    {
      key: "outstandingFees",
      label: "Outstanding Fees",
      table: "enrollments",
      filters: {},
      fees: true,
    },
    {
      key: "certificates",
      label: "Certificates",
      table: "certificates",
      filters: { status: "issued" },
    },
  ],
  trainer: [
    {
      key: "assignedBatches",
      label: "Assigned Batches",
      table: "trainer_assignments",
      filters: {},
    },
    { key: "students", label: "Students", table: "enrollments", filters: { status: "active" } },
    {
      key: "upcomingClasses",
      label: "Upcoming Classes",
      table: "classes",
      filters: { status: "scheduled" },
    },
    {
      key: "pendingSubmissions",
      label: "Pending Submissions",
      table: "submissions",
      filters: { status: "submitted" },
    },
    {
      key: "notifications",
      label: "Notifications",
      table: "notifications",
      filters: { read_at: null },
    },
  ],
  student: [
    {
      key: "enrolledCourses",
      label: "Enrolled Courses",
      table: "enrollments",
      filters: { status: "active" },
    },
    {
      key: "upcomingClasses",
      label: "Upcoming Classes",
      table: "classes",
      filters: { status: "scheduled" },
    },
    {
      key: "assignments",
      label: "Assignments",
      table: "assignments",
      filters: { status: "published" },
    },
    { key: "attendance", label: "Attendance Records", table: "attendance", filters: {} },
    { key: "payments", label: "Payments", table: "payments", filters: {} },
    {
      key: "certificates",
      label: "Certificates",
      table: "certificates",
      filters: { status: "issued" },
    },
    {
      key: "unreadNotifications",
      label: "Unread Notifications",
      table: "notifications",
      filters: { read_at: null },
    },
  ],
};
