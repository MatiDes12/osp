import { createMiddleware } from "hono/factory";
import type { Env } from "../app.js";

export function requestId() {
  return createMiddleware<Env>(async (c, next) => {
    const id =
      c.req.header("X-Request-Id") ?? crypto.randomUUID();
    c.set("requestId", id);
    c.header("X-Request-Id", id);
    await next();
  });
}
