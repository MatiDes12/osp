const REDACTED_FIELDS = new Set(["password", "token", "secret", "key"]);
const REDACTED_VALUE = "[REDACTED]";

function redactSensitiveFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(data)) {
    const lower = field.toLowerCase();
    const isSensitive = Array.from(REDACTED_FIELDS).some((keyword) =>
      lower.includes(keyword),
    );

    if (isSensitive) {
      result[field] = REDACTED_VALUE;
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[field] = redactSensitiveFields(value as Record<string, unknown>);
    } else {
      result[field] = value;
    }
  }

  return result;
}

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  data?: Record<string, unknown>;
}

function writeLog(
  level: LogLevel,
  service: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
  };

  if (data !== undefined) {
    entry.data = redactSensitiveFields(data);
  }

  const output = JSON.stringify(entry);

  if (level === "error") {
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
}

export function createLogger(service: string): Logger {
  return {
    info(message: string, data?: Record<string, unknown>): void {
      writeLog("info", service, message, data);
    },
    warn(message: string, data?: Record<string, unknown>): void {
      writeLog("warn", service, message, data);
    },
    error(message: string, data?: Record<string, unknown>): void {
      writeLog("error", service, message, data);
    },
    debug(message: string, data?: Record<string, unknown>): void {
      if (process.env["LOG_LEVEL"] === "debug") {
        writeLog("debug", service, message, data);
      }
    },
  };
}
