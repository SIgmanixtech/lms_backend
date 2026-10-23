import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email");

/** Server-side password policy; mirrored by the auth provider configuration. */
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use at most 128 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens");

export const currencySchema = z.string().length(3).toUpperCase();

/** Money is stored as integer minor units to avoid floating point drift. */
export const amountMinorSchema = z.number().int().nonnegative();

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(60).optional(),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const dateRangeSchema = z
  .object({ start: z.string().datetime(), end: z.string().datetime() })
  .refine((v) => new Date(v.end) >= new Date(v.start), {
    message: "End must be on or after start",
    path: ["end"],
  });
