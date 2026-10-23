/**
 * Canonical error taxonomy shared by the frontend, server functions and the
 * database layer. Every failure surfaced to a user must map to one of these.
 */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "AUTHENTICATION_ERROR",
  "AUTHORIZATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "INTEGRATION_UNAVAILABLE",
  "DATABASE_ERROR",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** HTTP status used when an error crosses a server boundary. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  AUTHENTICATION_ERROR: 401,
  AUTHORIZATION_ERROR: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTEGRATION_UNAVAILABLE: 503,
  DATABASE_ERROR: 500,
  INTERNAL_ERROR: 500,
};

/**
 * User-facing copy. Never leak database internals or provider errors; those are
 * logged server-side with a correlation id instead.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Some of the information provided isn't valid.",
  AUTHENTICATION_ERROR: "You need to sign in to continue.",
  AUTHORIZATION_ERROR: "You don't have permission to do this.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  CONFLICT: "This conflicts with existing information.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  INTEGRATION_UNAVAILABLE: "This service isn't available right now.",
  DATABASE_ERROR: "We couldn't complete that operation.",
  INTERNAL_ERROR: "Something went wrong on our end.",
};
