import { createMiddleware } from "hono/factory";
import type { TenantEnv } from "./tenant.js";
import { PLAN_LIMITS } from "@osp/shared";
import type { TenantPlan } from "@osp/shared";
import { getRedis } from "../lib/redis.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("rate-limit");

export interface RateLimitConfig {
  readonly windowMs: number;
  readonly maxRequests: number;
}

const DEFAULT_WINDOW_MS = 60_000;

/**
 * Redis-based sliding window rate limiter.
 *
 * Uses atomic MULTI/EXEC to increment a counter per tenant+endpoint+window.
 * Plan-aware: if no explicit maxRequests is provided, uses the tenant's plan limits.
 * Fail-open: if Redis is unavailable, the request is allowed through.
 */
export function rateLimit(config?: Partial<RateLimitConfig>) {
  const windowMs = config?.windowMs ?? DEFAULT_WINDOW_MS;
  const windowSec = Math.ceil(windowMs / 1000);

  return createMiddleware<TenantEnv>(async (c, next) => {
    const tenantId = c.get("tenantId");
    if (!tenantId) {
      // No tenant context (e.g. unauthenticated route) -- skip rate limiting
      await next();
      return;
    }

    const tenantPlan = c.get("tenantPlan") as TenantPlan | undefined;
    const planLimits = tenantPlan ? PLAN_LIMITS[tenantPlan] : undefined;
    const maxRequests = config?.maxRequests ?? planLimits?.apiRequestsPerMin ?? 60;

    const endpoint = normalizeEndpoint(c.req.path);
    const windowStart = Math.floor(Date.now() / windowMs);
    const key = `osp:rate:${tenantId}:${endpoint}:${windowStart}`;

    try {
      const redis = getRedis();
      const pipeline = redis.multi();
      pipeline.incr(key);
      pipeline.expire(key, windowSec * 2); // TTL = 2x window to handle edge cases
      const results = await pipeline.exec();

      const count = (results?.[0]?.[1] as number) ?? 0;
      const remaining = Math.max(0, maxRequests - count);
      const resetMs = (windowStart + 1) * windowMs;
      const resetSec = Math.ceil(resetMs / 1000);

      c.header("X-RateLimit-Limit", String(maxRequests));
      c.header("X-RateLimit-Remaining", String(remaining));
      c.header("X-RateLimit-Reset", String(resetSec));

      if (count > maxRequests) {
        const retryAfterSec = Math.ceil((resetMs - Date.now()) / 1000);
        c.header("Retry-After", String(Math.max(1, retryAfterSec)));

        return c.json(
          {
            success: false,
            data: null,
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message: "Too many requests. Please try again later.",
              requestId: c.get("requestId") ?? "unknown",
              timestamp: new Date().toISOString(),
            },
            meta: null,
          },
          429,
        );
      }
    } catch (err) {
      // Fail-open: if Redis is unavailable, allow the request
      logger.warn("Rate limit check failed, allowing request", {
        tenantId,
        error: String(err),
      });
    }

    await next();
  });
}

/**
 * Normalizes the request path to a stable endpoint key.
 * Strips UUIDs and numeric IDs to group similar routes.
 */
function normalizeEndpoint(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:id");
}
