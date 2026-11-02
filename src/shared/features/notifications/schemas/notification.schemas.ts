import { z } from "zod";

/** Rows per page of the notifications list (shared so the pager and the backend agree). */
export const NOTIFICATIONS_PAGE_SIZE = 25;

/** A filtered page of the caller's notifications (what the backend service works with). */
export const myNotificationsSchema = z.object({
  filters: z.object({
    read: z.enum(["all", "unread", "read"]),
    type: z.string().max(64),
    search: z.string().max(200),
  }),
  page: z.number().int().min(1).max(10_000),
});
export type MyNotificationsInput = z.infer<typeof myNotificationsSchema>;

/**
 * GET /api/v1/<role>/notifications?read=&type=&search=&page= (query values arrive as strings).
 * Same rules as `myNotificationsSchema`, reshaped into it.
 */
export const myNotificationsQuerySchema = z
  .object({
    read: z.enum(["all", "unread", "read"]).default("all"),
    type: z.string().max(64).default(""),
    search: z.string().max(200).default(""),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .transform(({ page, ...filters }): MyNotificationsInput => ({ filters, page }));

export const notificationIdSchema = z.object({ id: z.string().uuid() });
