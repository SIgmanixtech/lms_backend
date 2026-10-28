import { AppError } from "@/lib/errors";
import type { StudentsProgressResult } from "@/lib/api/contracts";
import { progressForAll, type ProgressBatchInput, type ProgressSources } from "@/lib/progress/progress-batch";
import type { AuthContext } from "@backend/lib/supabase/auth";

type Db = { from: (t: string) => any };
const PAGE = 1000; // PostgREST's default row cap: read every source page by page

async function all<T>(build: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().order("id").range(from, from + PAGE - 1);
    if (error) throw new AppError("DATABASE_ERROR", undefined, { cause: error });
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

const uniq = (v: string[]) => [...new Set(v)];

/**
 * Progress for a page of students in ONE request: each source table is read once for all of them
 * (8 queries total instead of 8 per student). Runs as the caller, so RLS decides which rows count,
 * exactly as the per-student queries did.
 */
export async function getStudentsProgress(auth: AuthContext, data: ProgressBatchInput): Promise<StudentsProgressResult> {
  if (!data.items.length) return { progress: [] };
  const db = auth.supabase as unknown as Db;
  const students = uniq(data.items.map((i) => i.studentId));
  const courses = uniq(data.items.map((i) => i.courseId));
  const batches = uniq(data.items.map((i) => i.batchId));

  const [lessons, lessonProgress, completedClasses, attendance, assignments, gradedSubmissions, recordings, recordingViews] = await Promise.all([
    all<{ id: string; course_modules: { course_id: string } }>(() => db.from("lessons").select("id, course_modules!inner(course_id)").in("course_modules.course_id", courses).eq("status", "published")),
    all<ProgressSources["lessonProgress"][number]>(() => db.from("lesson_progress").select("id, student_id, lesson_id, completed").in("student_id", students)),
    all<ProgressSources["completedClasses"][number]>(() => db.from("classes").select("id, batch_id").in("batch_id", batches).eq("status", "completed")),
    all<ProgressSources["attendance"][number]>(() => db.from("attendance").select("id, student_id, class_id, status").in("student_id", students)),
    all<ProgressSources["assignments"][number]>(() => db.from("assignments").select("id, batch_id, max_score").in("batch_id", batches)),
    all<ProgressSources["gradedSubmissions"][number]>(() => db.from("submissions").select("id, student_id, assignment_id, score").in("student_id", students).eq("status", "graded")),
    all<{ id: string; classes: { batch_id: string } }>(() => db.from("recordings").select("id, classes!inner(batch_id)").in("classes.batch_id", batches)),
    all<ProgressSources["recordingViews"][number]>(() => db.from("recording_views").select("id, student_id, recording_id, completed").in("student_id", students)),
  ]);

  return {
    progress: progressForAll(data.items, {
      lessons: lessons.map((l) => ({ id: l.id, course_id: l.course_modules.course_id })),
      lessonProgress,
      completedClasses,
      attendance,
      assignments,
      gradedSubmissions,
      recordings: recordings.map((r) => ({ id: r.id, batch_id: r.classes.batch_id })),
      recordingViews,
    }),
  };
}
