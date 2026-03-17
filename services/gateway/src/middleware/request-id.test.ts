import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requestId } from "./request-id.js";
import type { Env } from "../app.js";

function createTestApp() {
  const app = new Hono<Env>();
  app.use("*", requestId());
  app.get("/test", (c) => {
    return c.json({ requestId: c.get("requestId") });
  });
  return app;
}

describe("requestId middleware", () => {
  it("generates a UUID when no X-Request-Id header is provided", async () => {
    const app = createTestApp();
    const res = await app.request("/test");
    const body = await res.json();

    expect(body.requestId).toBeDefined();
    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("uses existing X-Request-Id header if provided", async () => {
    const app = createTestApp();
    const customId = "my-custom-request-id-123";
    const res = await app.request("/test", {
      headers: { "X-Request-Id": customId },
    });
    const body = await res.json();

    expect(body.requestId).toBe(customId);
  });

  it("sets X-Request-Id on the response header (generated)", async () => {
    const app = createTestApp();
    const res = await app.request("/test");

    const responseId = res.headers.get("X-Request-Id");
    expect(responseId).toBeDefined();
    expect(responseId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("sets X-Request-Id on the response header (passthrough)", async () => {
    const app = createTestApp();
    const customId = "passthrough-id-456";
    const res = await app.request("/test", {
      headers: { "X-Request-Id": customId },
    });

    expect(res.headers.get("X-Request-Id")).toBe(customId);
  });

  it("response header matches the context variable", async () => {
    const app = createTestApp();
    const res = await app.request("/test");
    const body = await res.json();

    expect(res.headers.get("X-Request-Id")).toBe(body.requestId);
  });

  it("generates unique IDs for different requests", async () => {
    const app = createTestApp();
    const res1 = await app.request("/test");
    const res2 = await app.request("/test");

    const body1 = await res1.json();
    const body2 = await res2.json();

    expect(body1.requestId).not.toBe(body2.requestId);
  });
});
