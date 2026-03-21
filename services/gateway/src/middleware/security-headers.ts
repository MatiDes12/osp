import { createMiddleware } from "hono/factory";
import type { Env } from "../app.js";

/**
 * Adds security response headers to every API response.
 * Covers: clickjacking, MIME sniffing, XSS, HSTS, referrer leakage,
 * content-security-policy for API endpoints, and permissions policy.
 */
export function securityHeaders() {
  return createMiddleware<Env>(async (c, next) => {
    await next();

    // Prevent clickjacking
    c.header("X-Frame-Options", "DENY");

    // Prevent MIME-type sniffing
    c.header("X-Content-Type-Options", "nosniff");

    // Force HTTPS for 1 year (only meaningful in production but harmless in dev)
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

    // Control referrer information
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");

    // Disable browser features not needed by an API
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");

    // Strict CSP for API responses (JSON only — no scripts/styles needed)
    c.header("Content-Security-Policy", "default-src 'none'");

    // Remove server fingerprint header Hono adds
    c.header("X-Powered-By", "");
  });
}
