/**
 * API Versioning Middleware
 *
 * Strategy:
 * - Current stable version: v1 (all routes at /api/v1/*)
 * - Every response carries an `API-Version` header so clients can assert the
 *   version they were built against.
 * - When a v2 is introduced, mount it alongside v1 at /api/v2/*.
 *   v1 enters a 6-month deprecation window (Deprecation + Sunset headers).
 * - Clients that send `Accept-Version: 2` are routed to v2 automatically
 *   once it exists; until then they receive v1 with no error.
 *
 * Usage:
 *   app.use("/api/*", apiVersion());
 */

import type { MiddlewareHandler } from "hono";

/** Current API version served by this gateway instance. */
export const CURRENT_API_VERSION = "1";

/**
 * Attaches `API-Version` and (optionally) `Deprecation` / `Sunset` headers to
 * every response under /api/*.
 */
export function apiVersion(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // Always advertise the version we served
    c.res.headers.set("API-Version", CURRENT_API_VERSION);

    // If the route handler already set a Deprecation header, honour it.
    // Otherwise nothing extra is added.
  };
}
