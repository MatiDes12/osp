import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = parseInt(process.env["GATEWAY_PORT"] ?? "3000", 10);

console.log(`OSP API Gateway starting on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`OSP API Gateway running at http://localhost:${port}`);
