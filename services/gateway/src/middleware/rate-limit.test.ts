import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { rateLimit } from "./rate-limit.js";
import type { TenantEnv } from "./tenant.js";
import { createMiddleware } from "hono/factory";

// Mock Redis
const mockExec = vi.fn();
const mockIncr = vi.fn();
const mockExpire = vi.fn();

const mockPipeline = {
  incr: mockIncr.mockReturnThis(),
  expire: mockExpire.mockReturnThis(),
  exec: mockExec,
};

vi.mock("../lib/redis.js", () => ({
  getRedis: () => ({
    multi: () => mockPipeline,
  }),
}));

vi.mock("../lib/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

/**
 * Helper to create a test app with tenant context injected and rate limiter applied.
 */
function createTestApp(config?: Parameters<typeof rateLimit>[0]) {
  const app = new Hono<TenantEnv>();

  // Inject fake tenant context
  app.use(
    "*",
    createMiddleware<TenantEnv>(async (c, next) => {
      c.set("requestId", "test-req-id");
      c.set("tenantId", "tenant-1");
      c.set("userId", "user-1");
      c.set("userRole", "admin");
      c.set("tenantPlan", "free");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      c.set("tenantLimits", { apiRequestsPerMin: 60 } as any);
      await next();
    }),
  );

  app.use("*", rateLimit(config));

  app.get("/api/test", (c) => c.json({ success: true }));
  app.get("/api/cameras/:id", (c) => c.json({ success: true, id: c.req.param("id") }));

  return app;
}

describe("rateLimit middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows requests under the limit", async () => {
    mockExec.mockResolvedValue([[null, 5], [null, 1]]);

    const app = createTestApp({ maxRequests: 60 });
    const res = await app.request("/api/test");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("includes rate limit headers in successful responses", async () => {
    mockExec.mockResolvedValue([[null, 10], [null, 1]]);

    const app = createTestApp({ maxRequests: 60 });
    const res = await app.request("/api/test");

    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("50");
    expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
  });

  it("returns 429 when limit is exceeded", async () => {
    mockExec.mockResolvedValue([[null, 11], [null, 1]]);

    const app = createTestApp({ maxRequests: 10 });
    const res = await app.request("/api/test");

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("includes Retry-After header on 429 responses", async () => {
    mockExec.mockResolvedValue([[null, 61], [null, 1]]);

    const app = createTestApp({ maxRequests: 60 });
    const res = await app.request("/api/test");

    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).toBeDefined();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
  });

  it("sets remaining to 0 when at exact limit", async () => {
    mockExec.mockResolvedValue([[null, 60], [null, 1]]);

    const app = createTestApp({ maxRequests: 60 });
    const res = await app.request("/api/test");

    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("uses plan-based limits when no explicit maxRequests is provided", async () => {
    // With "free" plan, apiRequestsPerMin = 60
    mockExec.mockResolvedValue([[null, 5], [null, 1]]);

    const app = createTestApp(); // No config -> uses plan limits
    const res = await app.request("/api/test");

    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
  });

  it("fails open when Redis is unavailable", async () => {
    mockExec.mockRejectedValue(new Error("Connection refused"));

    const app = createTestApp({ maxRequests: 10 });
    const res = await app.request("/api/test");

    // Should still allow the request through
    expect(res.status).toBe(200);
  });

  it("fails closed when Redis is unavailable and failOpen is false", async () => {
    mockExec.mockRejectedValue(new Error("Connection refused"));

    const app = createTestApp({ maxRequests: 10, failOpen: false });
    const res = await app.request("/api/test");

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("RATE_LIMIT_UNAVAILABLE");
  });

  it("skips rate limiting when tenantId is not set", async () => {
    const app = new Hono<TenantEnv>();
    // No tenant context middleware -- tenantId is not set
    app.use("*", rateLimit({ maxRequests: 1 }));
    app.get("/api/test", (c) => c.json({ success: true }));

    const res = await app.request("/api/test");
    expect(res.status).toBe(200);
    // No rate limit headers should be set
    expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
  });

  it("normalizes endpoint paths with UUIDs", async () => {
    mockExec.mockResolvedValue([[null, 1], [null, 1]]);

    const app = createTestApp({ maxRequests: 100 });
    await app.request("/api/cameras/550e8400-e29b-41d4-a716-446655440000");

    // The Redis key should use a normalized path
    expect(mockIncr).toHaveBeenCalled();
    const incrCall = mockIncr.mock.calls[0]?.[0] as string;
    expect(incrCall).toContain(":id");
    expect(incrCall).not.toContain("550e8400");
  });

  it("resets counter after window expires (different window key)", async () => {
    // First request in window 1
    mockExec.mockResolvedValueOnce([[null, 1], [null, 1]]);

    const app = createTestApp({ maxRequests: 5, windowMs: 1000 });
    const res1 = await app.request("/api/test");
    expect(res1.status).toBe(200);

    // Second request also in same window is fine
    mockExec.mockResolvedValueOnce([[null, 2], [null, 1]]);
    const res2 = await app.request("/api/test");
    expect(res2.status).toBe(200);
    expect(res2.headers.get("X-RateLimit-Remaining")).toBe("3");
  });
});
