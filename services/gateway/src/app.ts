import { Hono } from "hono";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import { requestId } from "./middleware/request-id.js";
import { errorHandler, ApiError } from "./middleware/error-handler.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { tenantContext } from "./middleware/tenant.js";
import { authRoutes } from "./routes/auth.routes.js";
import { cameraRoutes } from "./routes/camera.routes.js";
import { streamRoutes } from "./routes/stream.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { eventRoutes } from "./routes/event.routes.js";
import { recordingRoutes } from "./routes/recording.routes.js";
import { ruleRoutes } from "./routes/rule.routes.js";
import { tenantRoutes } from "./routes/tenant.routes.js";
import { extensionRoutes } from "./routes/extension.routes.js";
import { devRoutes } from "./routes/dev.routes.js";
import type { TenantPlan } from "@osp/shared";
import { PLAN_LIMITS } from "@osp/shared";

export type Env = {
  Variables: {
    requestId: string;
    tenantId: string;
    userId: string;
    userRole: string;
    tenantPlan: TenantPlan;
    tenantLimits: (typeof PLAN_LIMITS)[TenantPlan];
  };
};

const app = new Hono<Env>();

// Global middleware
app.use("*", requestId());
app.use("*", errorHandler());
app.use(
  "/api/*",
  cors({
    origin: (process.env["GATEWAY_CORS_ORIGINS"] ?? "http://localhost:3001").split(","),
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

// Tenant context and rate limiting for API routes
app.use("/api/*", tenantContext());
app.use("/api/*", rateLimit());

// Root route
app.get("/", (c) => {
  return c.json({
    name: "OSP — Open Surveillance Platform | Camera Management, Live Monitoring & Extensible Security",
    version: "0.1.0",
    status: "running",
    endpoints: {
      health: "/health",
      auth: "/api/v1/auth",
      cameras: "/api/v1/cameras",
      events: "/api/v1/events",
      recordings: "/api/v1/recordings",
      rules: "/api/v1/rules",
      tenants: "/api/v1/tenants",
      extensions: "/api/v1/extensions",
    },
    docs: "https://github.com/MatiDes12/osp",
  });
});

// Routes
app.route("/health", healthRoutes);
app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/cameras", cameraRoutes);
app.route("/api/v1/cameras", streamRoutes);
app.route("/api/v1/events", eventRoutes);
app.route("/api/v1/recordings", recordingRoutes);
app.route("/api/v1/rules", ruleRoutes);
app.route("/api/v1/tenants", tenantRoutes);
app.route("/api/v1/extensions", extensionRoutes);
app.route("/api/v1/dev", devRoutes);

// 404 fallback
app.notFound((c) => {
  return c.json(
    {
      success: false,
      data: null,
      error: {
        code: "NOT_FOUND",
        message: `Route ${c.req.method} ${c.req.path} not found`,
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      meta: null,
    },
    404,
  );
});

// Global error handler (safety net for errors that bypass middleware)
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
          requestId: reqId,
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
        requestId: reqId,
        timestamp: new Date().toISOString(),
      },
      meta: null,
    },
    500,
  );
});

export { app };
