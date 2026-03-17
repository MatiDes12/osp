// ---------------------------------------------------------------------------
//  HTTP Request/Response Logger Middleware
//  Logs every request with: method, path, status, duration, size, requestId.
//  Inspired by AEO's AeoHttpInvocationTimeLoggerInterceptor.
// ---------------------------------------------------------------------------

import type { MiddlewareHandler } from "hono";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("gateway");

// Paths that produce too much noise at info level.
const QUIET_PATHS = new Set(["/health", "/health/ready", "/health/live"]);

// Paths from Next.js dev tooling -- suppress entirely in dev.
const NEXTJS_NOISE = [
  "/_next/",
  "/__nextjs",
  "/__next_hmr",
  "/favicon.ico",
  "/_next/webpack-hmr",
  "/_next/static",
];

export function requestLogger(): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now();
    const method = c.req.method;
    const path = c.req.path;
    const reqId = c.get("requestId") ?? "-";

    await next();

    const duration = Math.round(performance.now() - start);
    const status = c.res.status;
    const contentLength = c.res.headers.get("content-length") ?? "-";

    const data: Record<string, unknown> = {
      method,
      path,
      status,
      duration_ms: duration,
      content_length: contentLength,
      requestId: reqId,
    };

    // Add tenant and user context if available.
    try {
      const tenantId = c.get("tenantId");
      if (tenantId) data["tenantId"] = tenantId;
      const userId = c.get("userId");
      if (userId) data["userId"] = userId;
    } catch {
      // Context variables not set yet (e.g., health check).
    }

    // Skip Next.js dev noise entirely (HMR, static assets, webpack).
    const isNextNoise = NEXTJS_NOISE.some((prefix) => path.startsWith(prefix));
    if (isNextNoise) return;

    const isQuiet = QUIET_PATHS.has(path);
    const summary = `${method} ${path} ${status} ${duration}ms`;

    if (status >= 500) {
      logger.error(summary, data);
    } else if (status >= 400) {
      // Suppress 404s for common browser probes (favicon, sourcemaps).
      if (status === 404 && (path.endsWith(".map") || path === "/favicon.ico")) return;
      logger.warn(summary, data);
    } else if (isQuiet) {
      logger.debug(summary, data);
    } else {
      logger.info(summary, data);
    }
  };
}
