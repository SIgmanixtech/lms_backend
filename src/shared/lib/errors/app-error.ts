import { ERROR_MESSAGES, ERROR_STATUS, type ErrorCode } from "./error-codes";

export interface AppErrorPayload {
  code: ErrorCode;
  message: string;
  /** Field-level messages for VALIDATION_ERROR. */
  details?: Record<string, string[]> | undefined;
  /** Correlation id linking the user-facing failure to server logs. */
  correlationId?: string | undefined;
}

/** The single error type crossing every layer boundary of the LMS. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, string[]> | undefined;
  readonly correlationId: string | undefined;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: { details?: Record<string, string[]>; correlationId?: string; cause?: unknown },
  ) {
    super(message ?? ERROR_MESSAGES[code], { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = options?.details;
    this.correlationId = options?.correlationId;
  }

  toPayload(): AppErrorPayload {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      correlationId: this.correlationId,
    };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Narrow an unknown thrown value into an AppError without leaking internals. */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  // The generated auth middleware throws plain "Unauthorized: …" errors; show them as a sign-in problem.
  if (value instanceof Error && value.message.startsWith("Unauthorized")) return new AppError("AUTHENTICATION_ERROR", undefined, { cause: value });
  return new AppError("INTERNAL_ERROR", undefined, { cause: value });
}

/** Message safe to render in the UI. */
export function userMessage(value: unknown): string {
  const error = toAppError(value);
  return error.code === "INTERNAL_ERROR" ? ERROR_MESSAGES.INTERNAL_ERROR : error.message;
}
