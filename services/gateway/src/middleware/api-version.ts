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
 *
 * Marking an endpoint as deprecated (future use):
 *   import { deprecated } from "./middleware/api-version.js";
 *   router.get("/old-endpoint", deprecated("2026-12-31"), handler);
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

/**
 * Mark a specific route handler as deprecated.
 *
 * Adds RFC 8594-compliant Deprecation and Sunset headers so clients and
 * API gateways can detect and warn before the endpoint is removed.
 *
 * @param sunsetDate ISO date string when the endpoint will be removed, e.g. "2026-12-31"
 *
 * @example
 *   router.get("/old-endpoint", deprecated("2026-12-31"), myHandler);
 */
export function deprecated(sunsetDate: string): MiddlewareHandler {
  return async (c, next) => {
    await next();
    // RFC 8594 — Deprecation header (boolean true = already deprecated)
    c.res.headers.set("Deprecation", "true");
    // RFC 8594 — Sunset header: HTTP-date when the endpoint goes away
    c.res.headers.set(
      "Sunset",
      new Date(sunsetDate).toUTCString(),
    );
    c.res.headers.set(
      "Link",
      `</docs>; rel="deprecation"; type="text/html"`,
    );
  };
}

/**
 * Parse the `Accept-Version` request header.
 * Returns the requested major version number, or null if not present.
 *
 * Clients can opt-in to a newer API version before the old one is removed:
 *   Accept-Version: 2
 */
export function getRequestedVersion(acceptVersion: string | undefined): number | null {
  if (!acceptVersion) return null;
  const v = parseInt(acceptVersion.trim(), 10);
  return Number.isFinite(v) ? v : null;
}
