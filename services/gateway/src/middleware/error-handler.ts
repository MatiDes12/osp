import { createMiddleware } from "hono/factory";
import { ZodError } from "zod";
import type { Env } from "../app.js";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorHandler() {
  return createMiddleware<Env>(async (c, next) => {
    try {
      await next();
    } catch (err) {
      const requestId = c.get("requestId") ?? "unknown";

      if (err instanceof ApiError) {
        return c.json(
          {
            success: false,
            data: null,
            error: {
              code: err.code,
              message: err.message,
              details: err.details,
              requestId,
              timestamp: new Date().toISOString(),
            },
            meta: null,
          },
          err.status as 400,
        );
      }

      // Zod validation errors → 422
      if (err instanceof ZodError) {
        const fieldErrors = err.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));
        return c.json(
          {
            success: false,
            data: null,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request data",
              details: fieldErrors,
              requestId,
              timestamp: new Date().toISOString(),
            },
            meta: null,
          },
          422,
        );
      }

      console.error("Unhandled error:", err);

      return c.json(
        {
          success: false,
          data: null,
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred",
            requestId,
            timestamp: new Date().toISOString(),
          },
          meta: null,
        },
        500,
      );
    }
  });
}
