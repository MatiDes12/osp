// ---------------------------------------------------------------------------
//  OSP Structured Logger
//  Inspired by AEO's logging patterns: structured JSON, sensitive-field
//  masking, request tracing, and clear startup/shutdown banners.
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = new Set([
  "password",
  "token",
  "secret",
  "key",
  "authorization",
  "cookie",
  "ssn",
  "credit_card",
  "api_key",
  "access_token",
  "refresh_token",
  "supabase_service_role_key",
]);

const REDACTED = "[REDACTED]";

function redact(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(data)) {
    const lower = field.toLowerCase().replace(/[-_]/g, "");
    const isSensitive = Array.from(SENSITIVE_PATTERNS).some((p) =>
      lower.includes(p.replace(/[-_]/g, "")),
    );

    if (isSensitive) {
      result[field] = REDACTED;
    } else if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      result[field] = redact(value as Record<string, unknown>);
    } else {
      result[field] = value;
    }
  }
  return result;
}

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const configuredLevel: LogLevel =
  (process.env["LOG_LEVEL"] as LogLevel) ?? "info";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  requestId?: string;
  tenantId?: string;
  message: string;
  data?: Record<string, unknown>;
  duration_ms?: number;
  error?: { message: string; stack?: string };
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[configuredLevel];
}

function write(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return;

  const output = JSON.stringify(entry);
  if (entry.level === "error") {
    process.stderr.write(output + "\n");
  } else {
    process.stdout.write(output + "\n");
  }
}

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  child(context: Record<string, string>): Logger;
}

export function createLogger(
  service: string,
  context?: Record<string, string>,
): Logger {
  const ctx = context ?? {};

  function log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
    };

    if (ctx["requestId"]) entry.requestId = ctx["requestId"];
    if (ctx["tenantId"]) entry.tenantId = ctx["tenantId"];

    if (data !== undefined) {
      if (data["duration_ms"] !== undefined) {
        entry.duration_ms = data["duration_ms"] as number;
        const rest = { ...data };
        delete rest["duration_ms"];
        if (Object.keys(rest).length > 0) entry.data = redact(rest);
      } else if (data["error"] instanceof Error) {
        entry.error = {
          message: data["error"].message,
          stack: data["error"].stack,
        };
        const rest = { ...data };
        delete rest["error"];
        if (Object.keys(rest).length > 0) entry.data = redact(rest);
      } else {
        entry.data = redact(data);
      }
    }

    write(entry);
  }

  return {
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
    debug: (msg, data) => log("debug", msg, data),
    child(childCtx: Record<string, string>): Logger {
      return createLogger(service, { ...ctx, ...childCtx });
    },
  };
}

// ---------------------------------------------------------------------------
//  Startup / Shutdown Banners
// ---------------------------------------------------------------------------

export function logStartupBanner(
  service: string,
  port: number,
  extras?: Record<string, string>,
): void {
  const logger = createLogger(service);
  const lines: string[] = [`${service} started on port ${port}`];
  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      lines.push(`  ${key}: ${value}`);
    }
  }

  const maxLen = Math.max(...lines.map((l) => l.length));
  const border = "+" + "-".repeat(maxLen + 4) + "+";

  process.stdout.write("\n");
  process.stdout.write(border + "\n");
  for (const line of lines) {
    process.stdout.write("|  " + line.padEnd(maxLen) + "  |\n");
  }
  process.stdout.write(border + "\n");
  process.stdout.write("\n");

  logger.info("Service started", {
    port: port as unknown as string,
    ...extras,
  } as Record<string, unknown>);
}

export function logShutdownBanner(service: string): void {
  const logger = createLogger(service);
  const msg = `${service} shutting down gracefully...`;
  const border = "+" + "-".repeat(msg.length + 4) + "+";

  process.stdout.write("\n" + border + "\n");
  process.stdout.write("|  " + msg + "  |\n");
  process.stdout.write(border + "\n\n");

  logger.info("Service shutdown initiated");
}

// ---------------------------------------------------------------------------
//  Connection Check Helpers
// ---------------------------------------------------------------------------

export function logConnectionStatus(
  logger: Logger,
  name: string,
  ok: boolean,
  detail?: string,
): void {
  const status = ok ? "connected" : "FAILED";
  const symbol = ok ? "[OK]" : "[FAIL]";

  if (ok) {
    logger.info(
      `${symbol} ${name}: ${status}`,
      detail ? { detail } : undefined,
    );
  } else {
    logger.error(
      `${symbol} ${name}: ${status}`,
      detail ? { detail } : undefined,
    );
  }
}
