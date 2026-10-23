/**
 * Structured logging. Never log secrets, tokens, passwords or full payloads
 * that may contain credentials.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  correlationId?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  [key: string]: unknown;
}

const REDACTED_KEYS = /pass|token|secret|key|authorization|cookie/i;

function redact(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      REDACTED_KEYS.test(key) ? "[redacted]" : value,
    ]),
  );
}

function emit(level: LogLevel, message: string, context: LogContext = {}) {
  const entry = { level, message, at: new Date().toISOString(), ...redact(context) };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};

export function newCorrelationId(): string {
  return crypto.randomUUID();
}
