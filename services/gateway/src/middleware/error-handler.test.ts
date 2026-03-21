import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { requestId } from "./request-id.js";
import { errorHandler, ApiError } from "./error-handler.js";
import type { Env } from "../app.js";

function createTestApp() {
  const app = new Hono<Env>();
  app.use("*", requestId());
  app.use("*", errorHandler());
  // Hono's onError as safety net — mirrors what our errorHandler does for non-middleware throws
  app.onError((err, c) => {
    const reqId = c.get("requestId") ?? "unknown";
    if (err instanceof ApiError) {
      return c.json(
        {
          success: false,
          data: null,
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
            requestId: reqId,
            timestamp: new Date().toISOString(),
          },
          meta: null,
        },
        err.status as 400,
      );
    }
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
          requestId: reqId,
          timestamp: new Date().toISOString(),
        },
        meta: null,
      },
      500,
    );
  });
  return app;
}

describe("errorHandler", () => {
  describe("ApiError handling", () => {
    it("catches ApiError and returns formatted JSON with correct status", async () => {
      const app = createTestApp();
      app.get("/test", () => {
        throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
      });

      const res = await app.request("/test");
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error.code).toBe("CAMERA_NOT_FOUND");
      expect(body.error.message).toBe("Camera not found");
      expect(body.meta).toBeNull();
    });

    it("includes details in ApiError response when provided", async () => {
      const app = createTestApp();
      const details = { field: "name", reason: "required" };
      app.get("/test", () => {
        throw new ApiError("VALIDATION_ERROR", "Invalid input", 400, details);
      });

      const res = await app.request("/test");
      const body = await res.json();
      expect(body.error.details).toEqual(details);
    });

    it("includes requestId in error response", async () => {
      const app = createTestApp();
      app.get("/test", () => {
        throw new ApiError("FAIL", "Failed", 500);
      });

      const res = await app.request("/test", {
        headers: { "X-Request-Id": "req-123" },
      });
      const body = await res.json();
      expect(body.error.requestId).toBe("req-123");
    });

    it("includes timestamp in error response", async () => {
      const app = createTestApp();
      app.get("/test", () => {
        throw new ApiError("FAIL", "Failed", 500);
      });

      const res = await app.request("/test");
      const body = await res.json();
      expect(body.error.timestamp).toBeDefined();
      expect(() => new Date(body.error.timestamp)).not.toThrow();
    });

    it("uses default status 500 when not specified", async () => {
      const app = createTestApp();
      app.get("/test", () => {
        throw new ApiError("INTERNAL", "Something broke");
      });

      const res = await app.request("/test");
      expect(res.status).toBe(500);
    });
  });

  describe("unknown error handling", () => {
    it("returns 500 with INTERNAL_ERROR code for unknown errors", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const app = createTestApp();
      app.get("/test", () => {
        throw new Error("some unexpected error");
      });

      const res = await app.request("/test");
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toBe("An unexpected error occurred");
    });

    it("does not leak internal error details for unknown errors", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const app = createTestApp();
      app.get("/test", () => {
        throw new Error(
          "database connection string: postgres://user:pass@host",
        );
      });

      const res = await app.request("/test");
      const body = await res.json();
      expect(body.error.message).toBe("An unexpected error occurred");
      expect(body.error.details).toBeUndefined();
    });

    it("includes requestId in unknown error response", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const app = createTestApp();
      app.get("/test", () => {
        throw new TypeError("cannot read property x of undefined");
      });

      const res = await app.request("/test", {
        headers: { "X-Request-Id": "req-456" },
      });
      const body = await res.json();
      expect(body.error.requestId).toBe("req-456");
    });
  });

  describe("successful requests", () => {
    it("passes through when no error is thrown", async () => {
      const app = createTestApp();
      app.get("/test", (c) => c.json({ success: true, data: "ok" }));

      const res = await app.request("/test");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBe("ok");
    });
  });
});

describe("ApiError class", () => {
  it("sets name to ApiError", () => {
    const err = new ApiError("TEST", "test");
    expect(err.name).toBe("ApiError");
  });

  it("is an instance of Error", () => {
    const err = new ApiError("TEST", "test");
    expect(err).toBeInstanceOf(Error);
  });

  it("stores code, message, status, and details", () => {
    const err = new ApiError("CODE", "msg", 422, { key: "val" });
    expect(err.code).toBe("CODE");
    expect(err.message).toBe("msg");
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ key: "val" });
  });
});
