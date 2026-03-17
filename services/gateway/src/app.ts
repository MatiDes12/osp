import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRoutes } from "./routes/auth.routes.js";
import { cameraRoutes } from "./routes/camera.routes.js";
import { streamRoutes } from "./routes/stream.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { eventRoutes } from "./routes/event.routes.js";
import { recordingRoutes } from "./routes/recording.routes.js";
import { ruleRoutes } from "./routes/rule.routes.js";
import { tenantRoutes } from "./routes/tenant.routes.js";
import { extensionRoutes } from "./routes/extension.routes.js";

export type Env = {
  Variables: {
    requestId: string;
    tenantId: string;
    userId: string;
    userRole: string;
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

export { app };
