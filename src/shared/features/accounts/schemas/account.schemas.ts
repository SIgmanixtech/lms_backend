import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : null));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform((v) => (v ? v : null));
const base = {
  full_name: z.string().trim().min(2, "Enter the full name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(255),
  phone: z.string().trim().min(1, "Phone number is required.").transform((v, ctx) => {
    const d = v.replace(/[\s\-()]/g, "");
    const m = d.match(/^(?:\+?91|0)?([6-9]\d{9})$/);
    if (m) return `+91${m[1]}`;
    if (/^\+[1-9]\d{7,14}$/.test(d)) return d;
    ctx.addIssue({ code: "custom", message: "Enter a valid phone number (10-digit Indian mobile or +country code)." }); return z.NEVER;
  }),
};

export const createStudentSchema = z.object({
  ...base,
  course_id: z.string().uuid("Course is required."),
  batch_id: z.string().uuid("Batch is required."),
  date_of_birth: date,
  gender: z.enum(["female", "male", "other", "prefer_not_to_say"]).optional().or(z.literal("")).transform((v) => (v ? v : null)),
  address: text(300), city: text(80), state: text(80),
  pincode: z.string().trim().regex(/^\d{0,10}$/, "Use digits only.").optional().or(z.literal("")).transform((v) => (v ? v : null)),
  emergency_contact_name: text(120), emergency_contact_phone: text(20),
  admission_date: date, education: z.string().trim().min(2, "Highest qualification is required.").max(200), institution: text(200),
});

export const createTrainerSchema = z.object({
  ...base,
  specialization: text(120), qualification: text(200),
  experience_years: z.union([z.string(), z.number()]).optional().transform((v, ctx) => {
    if (v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 60) { ctx.addIssue({ code: "custom", message: "Enter whole years between 0 and 60." }); return z.NEVER; }
    return n;
  }),
  location: text(120), bio: text(1000), joining_date: date,
});

export const updateStudentSchema = createStudentSchema.omit({ course_id: true, batch_id: true, email: true }).extend({ profileId: z.string().uuid() });
export const updateTrainerSchema = createTrainerSchema.omit({ email: true }).extend({ profileId: z.string().uuid() });
export const deleteAccountSchema = z.object({ profileId: z.string().uuid() });
export const resetPasswordSchema = z.object({ profileId: z.string().uuid() });
