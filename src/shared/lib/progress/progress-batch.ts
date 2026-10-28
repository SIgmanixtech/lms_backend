import { z } from "zod";
import { calculateProgress } from "./progress";

/**
 * Progress for many students at once (e.g. a page of the Students table). The backend fetches each
 * source ONCE for all requested students (POST /api/students/progress) and this pure function does
 * the same math `loadStudentProgress` always did, per student. Shared with the backend via sync-shared.
 */
export const PROGRESS_BATCH_MAX = 100;

export const progressBatchSchema = z.object({
  items: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        courseId: z.string().uuid(),
        batchId: z.string().uuid(),
      }),
    )
    .max(PROGRESS_BATCH_MAX),
});
export type ProgressBatchInput = z.infer<typeof progressBatchSchema>;
export type ProgressItem = ProgressBatchInput["items"][number];

/** Rows needed for the calculation; each list covers all requested students/courses/batches. */
export interface ProgressSources {
  lessons: { id: string; course_id: string }[];
  lessonProgress: { student_id: string; lesson_id: string; completed: boolean }[];
  completedClasses: { id: string; batch_id: string }[];
  attendance: { student_id: string; class_id: string; status: string }[];
  assignments: { id: string; batch_id: string; max_score: number | string | null }[];
  gradedSubmissions: { student_id: string; assignment_id: string; score: number | string | null }[];
  recordings: { id: string; batch_id: string }[];
  recordingViews: { student_id: string; recording_id: string; completed: boolean }[];
}

const ATTENDED = ["present", "late", "excused"];

function bucket<T, K extends keyof T>(rows: T[], field: K): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = String(r[field]);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/** Overall progress (0..1 or null) for one student in one course/batch, from the shared sources. */
export function progressFor(
  item: ProgressItem,
  s: ProgressSources,
  idx = indexSources(s),
): number | null {
  const lessonIds = new Set((idx.lessonsByCourse.get(item.courseId) ?? []).map((l) => l.id));
  const classIds = new Set((idx.classesByBatch.get(item.batchId) ?? []).map((c) => c.id));
  const assignmentScores = new Map(
    (idx.assignmentsByBatch.get(item.batchId) ?? []).map((a) => [a.id, Number(a.max_score)]),
  );
  const recordingIds = new Set((idx.recordingsByBatch.get(item.batchId) ?? []).map((r) => r.id));
  const completed = idx.progressByStudent.get(item.studentId) ?? [];
  const attendance = idx.attendanceByStudent.get(item.studentId) ?? [];
  const graded = (idx.submissionsByStudent.get(item.studentId) ?? []).filter((x) =>
    assignmentScores.has(x.assignment_id),
  );
  const views = idx.viewsByStudent.get(item.studentId) ?? [];
  const max = graded.reduce((sum, x) => sum + (assignmentScores.get(x.assignment_id) ?? 0), 0);
  return calculateProgress({
    lessons: lessonIds.size
      ? completed.filter((p) => p.completed && lessonIds.has(p.lesson_id)).length / lessonIds.size
      : 0,
    attendance: classIds.size
      ? attendance.filter((a) => classIds.has(a.class_id) && ATTENDED.includes(a.status)).length /
        classIds.size
      : null,
    assignments: max ? graded.reduce((sum, x) => sum + Number(x.score ?? 0), 0) / max : null,
    recordings: recordingIds.size
      ? views.filter((v) => v.completed && recordingIds.has(v.recording_id)).length /
        recordingIds.size
      : null,
  }).overall;
}

export function indexSources(s: ProgressSources) {
  return {
    lessonsByCourse: bucket(s.lessons, "course_id"),
    classesByBatch: bucket(s.completedClasses, "batch_id"),
    assignmentsByBatch: bucket(s.assignments, "batch_id"),
    recordingsByBatch: bucket(s.recordings, "batch_id"),
    progressByStudent: bucket(s.lessonProgress, "student_id"),
    attendanceByStudent: bucket(s.attendance, "student_id"),
    submissionsByStudent: bucket(s.gradedSubmissions, "student_id"),
    viewsByStudent: bucket(s.recordingViews, "student_id"),
  };
}

/** Progress for every requested item, in the same order (a student may appear once per course). */
export function progressForAll(items: ProgressItem[], s: ProgressSources): (number | null)[] {
  const idx = indexSources(s);
  return items.map((item) => progressFor(item, s, idx));
}
