import type { z } from "zod";
import { AppError } from "@/lib/errors";
import { zodDetails } from "@/features/auth/schemas/auth.schemas";

/** Validation with field details and the standard form message. */
export const parseWith = <S extends z.ZodTypeAny>(schema: S) => (input: unknown): z.output<S> => {
  const r = schema.safeParse(input);
  if (!r.success) throw new AppError("VALIDATION_ERROR", "Please correct the highlighted fields.", { details: zodDetails(r.error) });
  return r.data;
};

/** Validation with field details and the default validation message. */
export const parseWithDetails = <S extends z.ZodTypeAny>(schema: S) => (input: unknown): z.output<S> => {
  const r = schema.safeParse(input);
  if (!r.success) throw new AppError("VALIDATION_ERROR", undefined, { details: zodDetails(r.error) });
  return r.data;
};

/** Validation for id-style inputs where field details aren't useful. */
export const parseBare = <S extends z.ZodTypeAny>(schema: S) => (input: unknown): z.output<S> => {
  const r = schema.safeParse(input);
  if (!r.success) throw new AppError("VALIDATION_ERROR");
  return r.data;
};
