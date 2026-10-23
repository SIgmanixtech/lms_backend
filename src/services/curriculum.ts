import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { CurriculumDeleteOutcome } from "@/lib/api/contracts";
import type { AuthContext } from "@backend/lib/supabase/auth";
import { supabaseAdmin as db } from "@backend/lib/supabase/admin";
import { assertActiveAdmin } from "@backend/server/accounts/accounts.server";

export const curriculumDeleteSchema = z.object({ kind: z.enum(["course", "module", "lesson", "resource"]), id: z.string().uuid() });

type CountTable = "batches" | "enrollments" | "course_modules" | "lessons" | "classes" | "assignments" | "lesson_resources" | "lesson_progress";

/**
 * Admin-only curriculum removal. History is never destroyed: a course with
 * batches/enrollments/modules is archived; modules and lessons with dependants are refused.
 */
export async function deleteCurriculumItem(auth: AuthContext, data: z.output<typeof curriculumDeleteSchema>): Promise<CurriculumDeleteOutcome> {
  await assertActiveAdmin(auth.supabase as never, auth.userId);
  const count = async (table: CountTable, column: string) => {
    const { count: n, error } = await db.from(table).select("id", { head: true, count: "exact" }).eq(column as never, data.id as never);
    if (error) throw new AppError("DATABASE_ERROR");
    return n ?? 0;
  };
  const audit = (action: string) => db.from("audit_events").insert({ actor_id: auth.userId, action, entity_type: data.kind, entity_id: data.id });

  if (data.kind === "course") {
    const deps = (await count("batches", "course_id")) + (await count("enrollments", "course_id")) + (await count("course_modules", "course_id"));
    if (deps > 0) {
      const { error } = await db.from("courses").update({ status: "archived" }).eq("id", data.id);
      if (error) throw new AppError("DATABASE_ERROR");
      await audit("course.archived");
      return { outcome: "archived" };
    }
    const { error } = await db.from("courses").delete().eq("id", data.id);
    if (error) throw new AppError("CONFLICT", "This course is still referenced elsewhere, so it was not deleted.");
    await audit("course.deleted");
    return { outcome: "deleted" };
  }
  if (data.kind === "module") {
    if ((await count("lessons", "module_id")) + (await count("classes", "module_id")) + (await count("assignments", "module_id")) > 0)
      throw new AppError("CONFLICT", "Remove this module's lessons first. Modules linked to classes or assignments can't be deleted — set the status to Archived instead.");
    const { error } = await db.from("course_modules").delete().eq("id", data.id);
    if (error) throw new AppError("CONFLICT", "This module is still referenced elsewhere, so it was not deleted.");
    await audit("module.deleted");
    return { outcome: "deleted" };
  }
  if (data.kind === "lesson") {
    if ((await count("lesson_resources", "lesson_id")) > 0) throw new AppError("CONFLICT", "Remove this lesson's resources first.");
    if ((await count("lesson_progress", "lesson_id")) > 0) throw new AppError("CONFLICT", "Students have progress on this lesson, so it can't be deleted. Set the status to Archived instead.");
    const { error } = await db.from("lessons").delete().eq("id", data.id);
    if (error) throw new AppError("CONFLICT", "This lesson is still referenced elsewhere, so it was not deleted.");
    await audit("lesson.deleted");
    return { outcome: "deleted" };
  }
  const { data: res } = await db.from("lesson_resources").select("storage_path").eq("id", data.id).maybeSingle();
  if (!res) throw new AppError("NOT_FOUND");
  const { error } = await db.from("lesson_resources").delete().eq("id", data.id);
  if (error) throw new AppError("DATABASE_ERROR");
  if (res.storage_path) await db.storage.from("course-resources").remove([res.storage_path]);
  await audit("resource.deleted");
  return { outcome: "deleted" };
}
