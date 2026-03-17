import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient } from "./client.js";

const BASE_URL = "http://localhost:3000";

function createMockFetch(response: {
  status?: number;
  body?: unknown;
}) {
  return vi.fn().mockResolvedValue({
    status: response.status ?? 200,
    json: vi.fn().mockResolvedValue(response.body ?? { success: true, data: null, error: null, meta: null }),
  });
}

describe("ApiClient", () => {
  let mockFetch: ReturnType<typeof createMockFetch>;

  beforeEach(() => {
    mockFetch = createMockFetch({});
    vi.stubGlobal("fetch", mockFetch);
  });

  function createClient(overrides?: {
    token?: string | null;
    onUnauthorized?: () => void;
  }) {
    return new ApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => overrides && "token" in overrides ? overrides.token ?? null : "test-token",
      onUnauthorized: overrides?.onUnauthorized,
    });
  }

  describe("GET requests", () => {
    it("sends correct URL", async () => {
      const client = createClient();
      await client.get("/api/v1/cameras");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/v1/cameras`);
    });

    it("sends Authorization header with Bearer token", async () => {
      const client = createClient({ token: "my-jwt-token" });
      await client.get("/api/v1/cameras");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["Authorization"]).toBe("Bearer my-jwt-token");
    });

    it("omits Authorization header when token is null", async () => {
      const client = createClient({ token: null });
      await client.get("/api/v1/cameras");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["Authorization"]).toBeUndefined();
    });

    it("uses GET method", async () => {
      const client = createClient();
      await client.get("/api/v1/cameras");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe("GET");
    });

    it("does not send a body", async () => {
      const client = createClient();
      await client.get("/api/v1/cameras");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBeUndefined();
    });
  });

  describe("query params", () => {
    it("appends query params to URL", async () => {
      const client = createClient();
      await client.get("/api/v1/events", { page: 2, limit: 10 });

      const [url] = mockFetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.get("page")).toBe("2");
      expect(parsed.searchParams.get("limit")).toBe("10");
    });

    it("omits undefined params", async () => {
      const client = createClient();
      await client.get("/api/v1/events", {
        page: 1,
        type: undefined,
      });

      const [url] = mockFetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.get("page")).toBe("1");
      expect(parsed.searchParams.has("type")).toBe(false);
    });

    it("converts boolean params to strings", async () => {
      const client = createClient();
      await client.get("/api/v1/events", { acknowledged: true });

      const [url] = mockFetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.get("acknowledged")).toBe("true");
    });
  });

  describe("POST requests", () => {
    it("sends body as JSON", async () => {
      const client = createClient();
      const body = { name: "Camera 1", protocol: "rtsp" };
      await client.post("/api/v1/cameras", body);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe("POST");
      expect(options.body).toBe(JSON.stringify(body));
    });

    it("sets Content-Type to application/json", async () => {
      const client = createClient();
      await client.post("/api/v1/cameras", { name: "test" });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["Content-Type"]).toBe("application/json");
    });

    it("sends undefined body when no body provided", async () => {
      const client = createClient();
      await client.post("/api/v1/auth/logout");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBeUndefined();
    });
  });

  describe("PATCH requests", () => {
    it("sends PATCH method with body", async () => {
      const client = createClient();
      await client.patch("/api/v1/cameras/123", { name: "Updated" });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe("PATCH");
      expect(options.body).toBe(JSON.stringify({ name: "Updated" }));
    });
  });

  describe("DELETE requests", () => {
    it("sends DELETE method without body", async () => {
      const client = createClient();
      await client.delete("/api/v1/cameras/123");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe("DELETE");
      expect(options.body).toBeUndefined();
    });
  });

  describe("onUnauthorized callback", () => {
    it("fires on 401 response", async () => {
      const onUnauthorized = vi.fn();
      mockFetch = createMockFetch({ status: 401 });
      vi.stubGlobal("fetch", mockFetch);

      const client = createClient({ token: "expired-token", onUnauthorized });
      await client.get("/api/v1/cameras");

      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it("does not fire on 200 response", async () => {
      const onUnauthorized = vi.fn();
      mockFetch = createMockFetch({ status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      const client = createClient({ token: "valid-token", onUnauthorized });
      await client.get("/api/v1/cameras");

      expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it("does not fire on 403 response", async () => {
      const onUnauthorized = vi.fn();
      mockFetch = createMockFetch({ status: 403 });
      vi.stubGlobal("fetch", mockFetch);

      const client = createClient({ token: "valid-token", onUnauthorized });
      await client.get("/api/v1/cameras");

      expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it("does not throw when onUnauthorized is not provided", async () => {
      mockFetch = createMockFetch({ status: 401 });
      vi.stubGlobal("fetch", mockFetch);

      const client = createClient({ token: "expired-token" });
      await expect(client.get("/api/v1/cameras")).resolves.toBeDefined();
    });
  });

  describe("response parsing", () => {
    it("returns parsed JSON response", async () => {
      const responseBody = {
        success: true,
        data: { id: "123", name: "Camera 1" },
        error: null,
        meta: null,
      };
      mockFetch = createMockFetch({ body: responseBody });
      vi.stubGlobal("fetch", mockFetch);

      const client = createClient();
      const result = await client.get("/api/v1/cameras/123");

      expect(result).toEqual(responseBody);
    });
  });
});
