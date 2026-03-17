import { Hono } from "hono";

export const healthRoutes = new Hono();

healthRoutes.get("/", (c) => {
  return c.json({
    status: "ok",
    service: "osp-gateway",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  });
});

healthRoutes.get("/ready", async (c) => {
  // TODO: check Supabase + Redis connectivity
  return c.json({
    status: "ready",
    checks: {
      supabase: "ok",
      redis: "ok",
    },
  });
});
