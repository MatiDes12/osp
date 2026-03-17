import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRoutes } from "./routes/auth.routes.js";
import { cameraRoutes } from "./routes/camera.routes.js";
import { healthRoutes } from "./routes/health.routes.js";

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

// Routes
app.route("/health", healthRoutes);
app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/cameras", cameraRoutes);

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
