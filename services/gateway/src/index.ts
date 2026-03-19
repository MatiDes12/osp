import { config } from "dotenv";
import { resolve } from "node:path";

// Load .env from project root (two levels up from services/gateway/)
config({ path: resolve(process.cwd(), "../../.env") });
// Also try current directory (for Docker / direct invocation)
config({ path: resolve(process.cwd(), ".env") });

// Validate env before importing anything else
import { validateEnv } from "./lib/env.js";
validateEnv();
import { loadConfig, get } from "./lib/config.js";
import { initSentry, captureException } from "./lib/sentry.js";
initSentry("osp-gateway");

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

// Ports read after loadConfig() in start()

logger.info("OSP API Gateway initializing...");

// Check external dependencies before serving.
async function checkDependencies(): Promise<void> {
  await loadConfig();

  // Redis
  const redisUrl = get("REDIS_URL") ?? "redis://localhost:6379";
  try {
    // Lightweight check — just verify the URL is parseable.
    new URL(redisUrl);
    logConnectionStatus(logger, "Redis", true, redisUrl.replace(/\/\/.*@/, "//***@"));
  } catch {
    logConnectionStatus(logger, "Redis", false, "Invalid REDIS_URL");
  }

  // Supabase (bootstrap - always from env)
  const supabaseUrl = process.env["SUPABASE_URL"] ?? "";
  logConnectionStatus(logger, "Supabase", supabaseUrl.length > 0, supabaseUrl || "NOT SET");

  // go2rtc
  const go2rtcUrl = get("GO2RTC_API_URL") ?? get("GO2RTC_URL") ?? "http://localhost:1984";
  logConnectionStatus(logger, "go2rtc", true, go2rtcUrl);
}

const healthChecker = new CameraHealthChecker();

async function start(): Promise<void> {
  await checkDependencies();

  // Start the dedicated WebSocket server (includes Redis pub/sub subscription)
  startWebSocketServer();

  // Start periodic camera health checks (every 30s)
  healthChecker.start();

  const port = Number.parseInt(get("GATEWAY_PORT") ?? "3000", 10);
  const wsPort = Number.parseInt(get("WS_PORT") ?? "3002", 10);

  serve({
    fetch: app.fetch,
    port,
  });

  const bootTime = Math.round(performance.now() - startTime);

  logStartupBanner("OSP API Gateway", port, {
    websocket: `ws://localhost:${wsPort}`,
    boot_time: `${bootTime}ms`,
    node: process.version,
    env: get("NODE_ENV") ?? "development",
  });
}

try {
  await start();
} catch (err) {
  captureException(err, { phase: "startup" });
  logger.error("Failed to start gateway", { error: err as Error });
  process.exit(1);
}

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
  captureException(reason, { type: "unhandledRejection" });
  logger.error("Unhandled promise rejection", {
    error: reason instanceof Error ? reason : new Error(String(reason)),
  });
});

process.on("uncaughtException", (err) => {
  captureException(err, { type: "uncaughtException" });
  logger.error("Uncaught exception", { error: err });
  process.exit(1);
});
