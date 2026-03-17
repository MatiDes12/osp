import { config } from "dotenv";
import { resolve } from "path";

// Load .env from project root (two levels up from services/gateway/)
config({ path: resolve(process.cwd(), "../../.env") });
// Also try current directory (for Docker / direct invocation)
config({ path: resolve(process.cwd(), ".env") });

import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { startWebSocketServer, stopWebSocketServer } from "./ws/server.js";
import {
  createLogger,
  logStartupBanner,
  logShutdownBanner,
  logConnectionStatus,
} from "./lib/logger.js";
import { closeAllClients as closeGrpcClients } from "./grpc/client.js";
import { CameraHealthChecker } from "./services/health-checker.js";

const logger = createLogger("gateway");
const startTime = performance.now();

const port = parseInt(process.env["GATEWAY_PORT"] ?? "3000", 10);
const wsPort = parseInt(process.env["WS_PORT"] ?? "3002", 10);

logger.info("OSP API Gateway initializing...");

// Check external dependencies before serving.
async function checkDependencies(): Promise<void> {
  // Redis
  const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  try {
    // Lightweight check — just verify the URL is parseable.
    new URL(redisUrl);
    logConnectionStatus(logger, "Redis", true, redisUrl.replace(/\/\/.*@/, "//***@"));
  } catch {
    logConnectionStatus(logger, "Redis", false, "Invalid REDIS_URL");
  }

  // Supabase
  const supabaseUrl = process.env["SUPABASE_URL"] ?? "";
  logConnectionStatus(logger, "Supabase", supabaseUrl.length > 0, supabaseUrl || "NOT SET");

  // go2rtc
  const go2rtcUrl = process.env["GO2RTC_API_URL"] ?? "http://localhost:1984";
  logConnectionStatus(logger, "go2rtc", true, go2rtcUrl);
}

const healthChecker = new CameraHealthChecker();

async function start(): Promise<void> {
  await checkDependencies();

  // Start the dedicated WebSocket server (includes Redis pub/sub subscription)
  startWebSocketServer();

  // Start periodic camera health checks (every 30s)
  healthChecker.start();

  serve({
    fetch: app.fetch,
    port,
  });

  const bootTime = Math.round(performance.now() - startTime);

  logStartupBanner("OSP API Gateway", port, {
    websocket: `ws://localhost:${wsPort}`,
    boot_time: `${bootTime}ms`,
    node: process.version,
    env: process.env["NODE_ENV"] ?? "development",
  });
}

start().catch((err) => {
  logger.error("Failed to start gateway", { error: err as Error });
  process.exit(1);
});

// Graceful shutdown
function shutdown(): void {
  logShutdownBanner("OSP API Gateway");
  healthChecker.stop();
  closeGrpcClients();
  stopWebSocketServer();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Catch unhandled rejections and exceptions.
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    error: reason instanceof Error ? reason : new Error(String(reason)),
  });
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { error: err });
  process.exit(1);
});
