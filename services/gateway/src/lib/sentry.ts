import * as Sentry from "@sentry/node";
import { createLogger } from "./logger.js";

const logger = createLogger("sentry");

let sentryEnabled = false;

export function initSentry(serviceName = "osp-gateway"): void {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) {
    logger.info("Sentry disabled (SENTRY_DSN not set)");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    release: process.env["RELEASE_VERSION"] ?? undefined,
    tracesSampleRate: 0.1,
    serverName: serviceName,
  });

  sentryEnabled = true;
  logger.info("Sentry initialized");
}

export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!sentryEnabled) return;
  Sentry.captureException(err, {
    extra: context,
  });
}
