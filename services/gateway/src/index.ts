import { config } from "dotenv";
import { resolve } from "path";

// Load .env from project root (two levels up from services/gateway/)
config({ path: resolve(process.cwd(), "../../.env") });
// Also try current directory (for Docker / direct invocation)
config({ path: resolve(process.cwd(), ".env") });

import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { startRedisSubscription, stopRedisSubscription } from "./ws/events.ws.js";

const port = parseInt(process.env["GATEWAY_PORT"] ?? "3000", 10);

console.log(`OSP API Gateway starting on port ${port}`);

// Start Redis pub/sub for cross-instance WebSocket event distribution
startRedisSubscription();

serve({
  fetch: app.fetch,
  port,
});

console.log(`OSP API Gateway running at http://localhost:${port}`);

// Graceful shutdown
function shutdown() {
  console.log("Shutting down...");
  stopRedisSubscription();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
