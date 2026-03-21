import { Hono } from "hono";
import { cors } from "hono/cors";
import { get } from "./lib/config.js";
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
import { locationRoutes } from "./routes/location.routes.js";
import { tagRoutes, cameraTagRoutes } from "./routes/tag.routes.js";
import { devRoutes } from "./routes/dev.routes.js";
import { docsRoutes } from "./routes/docs.routes.js";
import { userRoutes } from "./routes/user.routes.js";
import { configRoutes } from "./routes/config.routes.js";
import { analyticsRoutes } from "./routes/analytics.routes.js";
import { apiKeyRoutes } from "./routes/api-key.routes.js";
import { ssoRoutes } from "./routes/sso.routes.js";
import { lprRoutes } from "./routes/lpr.routes.js";
import { edgeRoutes } from "./routes/edge.routes.js";
import { adminRoutes } from "./routes/admin.routes.js";
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

import { requestLogger } from "./middleware/request-logger.js";
import { metricsMiddleware } from "./middleware/metrics.js";
import { apiVersion, CURRENT_API_VERSION } from "./middleware/api-version.js";
import { createLogger } from "./lib/logger.js";

// Global middleware
app.use("*", requestId());
app.use("*", requestLogger());
app.use("*", metricsMiddleware());
app.use("*", errorHandler());
app.use(
  "/health/*",
  cors({
    origin: (get("GATEWAY_CORS_ORIGINS") ?? "http://localhost:3001").split(","),
    allowMethods: ["GET"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400,
  }),
);
app.use(
  "/docs/*",
  cors({
    origin: (get("GATEWAY_CORS_ORIGINS") ?? "http://localhost:3001").split(","),
    allowMethods: ["GET"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400,
  }),
);
app.use(
  "/api/*",
  cors({
    origin: (get("GATEWAY_CORS_ORIGINS") ?? "http://localhost:3001").split(","),
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

// API versioning headers on every /api/* response
app.use("/api/*", apiVersion());

// Tenant context and rate limiting for API routes
app.use("/api/*", tenantContext());
app.use("/api/*", rateLimit());

// Root route
app.get("/", (c) => {
  return c.json({
    name: "OSP — Open Surveillance Platform | Camera Management, Live Monitoring & Extensible Security",
    version: "0.1.0",
    status: "running",
    api: {
      currentVersion: CURRENT_API_VERSION,
      supportedVersions: ["1"],
      deprecatedVersions: [],
      versioningHeader: "Accept-Version",
      sunsetPolicy: "6 months notice via Deprecation + Sunset response headers (RFC 8594)",
    },
    endpoints: {
      health: "/health",
      auth: "/api/v1/auth",
      cameras: "/api/v1/cameras",
      events: "/api/v1/events",
      recordings: "/api/v1/recordings",
      rules: "/api/v1/rules",
      tenants: "/api/v1/tenants",
      locations: "/api/v1/locations",
      tags: "/api/v1/tags",
      extensions: "/api/v1/extensions",
      analytics: "/api/v1/analytics",
      apiKeys: "/api/v1/api-keys",
      sso: "/api/v1/auth/sso",
      lpr: "/api/v1/lpr",
      edge: "/api/v1/edge",
      admin: "/api/v1/admin",
    },
    docs: "/docs",
  });
});

// Routes
app.route("/docs", docsRoutes);
app.route("/health", healthRoutes);
app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/auth/sso", ssoRoutes);
app.route("/api/v1/cameras", cameraRoutes);
app.route("/api/v1/cameras", streamRoutes);
app.route("/api/v1/streams", streamRoutes);
app.route("/api/v1/events", eventRoutes);
app.route("/api/v1/recordings", recordingRoutes);
app.route("/api/v1/rules", ruleRoutes);
app.route("/api/v1/tenants", tenantRoutes);
app.route("/api/v1/locations", locationRoutes);
app.route("/api/v1/tags", tagRoutes);
app.route("/api/v1/cameras", cameraTagRoutes);
app.route("/api/v1/extensions", extensionRoutes);
app.route("/api/v1/users", userRoutes);
app.route("/api/v1/config", configRoutes);
app.route("/api/v1/analytics", analyticsRoutes);
app.route("/api/v1/api-keys", apiKeyRoutes);
app.route("/api/v1/lpr", lprRoutes);
app.route("/api/v1/edge", edgeRoutes);
app.route("/api/v1/admin", adminRoutes);
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

  const logger = createLogger("gateway");
  logger.error("Unhandled error", { error: err as Error, requestId: reqId });
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
