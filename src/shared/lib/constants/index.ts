/** Organization-wide defaults. Values are per-record in the database; these are
 *  only the defaults used when creating new records. */
export const DEFAULT_CURRENCY = "INR" as const;
export const DISPLAY_TIME_ZONE = "Asia/Kolkata" as const;
export const DEFAULT_LOCALE = "en-IN" as const;

/** Database stores all timestamps in UTC. */
export const DATABASE_TIME_ZONE = "UTC" as const;

export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export const APP_ROLES = ["admin", "trainer", "student"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ACCOUNT_STATUSES = ["active", "inactive"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
