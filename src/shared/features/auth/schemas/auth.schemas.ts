import { z } from "zod";

import { emailSchema, passwordSchema, uuidSchema } from "@/lib/validation/common.schemas";

/** One-time first-admin bootstrap request (server route body). */
export const bootstrapAdminSchema = z.object({
  email: emailSchema.transform((v) => v.toLowerCase()),
  fullName: z.string().trim().min(2, "Enter the administrator's full name").max(120),
  temporaryPassword: passwordSchema,
});
export type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>;

/** Sign-in request. Password strength is not checked here: existing passwords must always be accepted. */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Enter your email.").max(255).email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Session renewal request (refresh tokens are opaque strings issued at sign-in). */
export const refreshSessionSchema = z.object({ refreshToken: z.string().min(1).max(4096) });
export type RefreshSessionInput = z.infer<typeof refreshSessionSchema>;

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "Choose a password different from the current one",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const setAccountStatusSchema = z.object({
  profileId: uuidSchema,
  status: z.enum(["active", "inactive"]),
});
export type SetAccountStatusInput = z.infer<typeof setAccountStatusSchema>;

/** Flatten zod issues into the AppError details shape. */
export function zodDetails(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (details[key] ??= []).push(issue.message);
  }
  return details;
}
