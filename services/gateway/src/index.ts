import { config } from "dotenv";
import { resolve } from "path";

// Load .env from project root (two levels up from services/gateway/)
config({ path: resolve(process.cwd(), "../../.env") });
// Also try current directory (for Docker / direct invocation)
config({ path: resolve(process.cwd(), ".env") });

import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { startWebSocketServer, stopWebSocketServer } from "./ws/server.js";

const port = parseInt(process.env["GATEWAY_PORT"] ?? "3000", 10);
const wsPort = parseInt(process.env["WS_PORT"] ?? "3002", 10);

console.log(`OSP API Gateway starting on port ${port}`);

// Start the dedicated WebSocket server (includes Redis pub/sub subscription)
startWebSocketServer();

serve({
  fetch: app.fetch,
  port,
});

console.log(`OSP API Gateway running at http://localhost:${port}`);
console.log(`OSP WebSocket server running at ws://localhost:${wsPort}`);

// Graceful shutdown
function shutdown() {
  console.log("Shutting down...");
  stopWebSocketServer();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
