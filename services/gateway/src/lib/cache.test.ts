import { describe, it, expect, vi, beforeEach } from "vitest";
import { CacheService } from "./cache.js";

// Mock logger
vi.mock("./logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock Redis client
function createMockRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();

  const mockExec = vi.fn();
  const mockIncr = vi.fn();
  const mockExpire = vi.fn();

  const mockPipeline = {
    incr: mockIncr.mockReturnThis(),
    expire: mockExpire.mockReturnThis(),
    exec: mockExec,
  };

  return {
    store,
    ttls,
    mockPipeline,
    mockExec,
    mockIncr,
    mockExpire,
    redis: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(
        async (key: string, value: string, _mode?: string, _ttl?: number) => {
          store.set(key, value);
          return "OK";
        },
      ),
      del: vi.fn(async (key: string) => {
        const existed = store.has(key);
        store.delete(key);
        return existed ? 1 : 0;
      }),
      multi: vi.fn(() => mockPipeline),
    },
  };
}

describe("CacheService", () => {
  let mock: ReturnType<typeof createMockRedis>;
  let cache: CacheService;

  beforeEach(() => {
    mock = createMockRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cache = new CacheService(mock.redis as any);
  });

  describe("get/set/delete", () => {
    it("returns null for missing keys", async () => {
      const result = await cache.get("nonexistent");
      expect(result).toBeNull();
    });

    it("sets and gets a value", async () => {
      await cache.set("test-key", { name: "test" });
      const result = await cache.get<{ name: string }>("test-key");
      expect(result).toEqual({ name: "test" });
    });

    it("passes TTL to Redis set command", async () => {
      await cache.set("ttl-key", "value", 120);
      expect(mock.redis.set).toHaveBeenCalledWith(
        "ttl-key",
        JSON.stringify("value"),
        "EX",
        120,
      );
    });

    it("uses default TTL when none specified", async () => {
      await cache.set("default-ttl", "value");
      expect(mock.redis.set).toHaveBeenCalledWith(
        "default-ttl",
        JSON.stringify("value"),
        "EX",
        300, // DEFAULT_TTL_SEC
      );
    });

    it("deletes a key", async () => {
      await cache.set("to-delete", "value");
      await cache.delete("to-delete");
      const result = await cache.get("to-delete");
      expect(result).toBeNull();
    });

    it("handles Redis get errors gracefully", async () => {
      mock.redis.get.mockRejectedValueOnce(new Error("Connection lost"));
      const result = await cache.get("key");
      expect(result).toBeNull();
    });

    it("handles Redis set errors gracefully", async () => {
      mock.redis.set.mockRejectedValueOnce(new Error("Connection lost"));
      // Should not throw
      await cache.set("key", "value");
    });
  });

  describe("increment", () => {
    it("increments a key using MULTI/EXEC", async () => {
      mock.mockExec.mockResolvedValue([
        [null, 5],
        [null, 1],
      ]);

      const count = await cache.increment("counter", 60);
      expect(count).toBe(5);
      expect(mock.mockIncr).toHaveBeenCalledWith("counter");
      expect(mock.mockExpire).toHaveBeenCalledWith("counter", 60);
    });

    it("does not set expire when ttl is undefined", async () => {
      mock.mockExec.mockResolvedValue([[null, 1]]);

      await cache.increment("counter");
      expect(mock.mockIncr).toHaveBeenCalledWith("counter");
      expect(mock.mockExpire).not.toHaveBeenCalled();
    });

    it("returns 0 on Redis error", async () => {
      mock.mockExec.mockRejectedValue(new Error("Connection lost"));
      const count = await cache.increment("counter", 60);
      expect(count).toBe(0);
    });
  });

  describe("camera status", () => {
    it("sets and gets camera status", async () => {
      await cache.setCameraStatus("tenant-1", "cam-1", "online");
      const status = await cache.getCameraStatus("tenant-1", "cam-1");
      expect(status).toBe("online");
    });

    it("returns null for unknown camera", async () => {
      const status = await cache.getCameraStatus("tenant-1", "unknown");
      expect(status).toBeNull();
    });
  });

  describe("tenant plan", () => {
    it("sets and gets tenant plan", async () => {
      await cache.setTenantPlan("tenant-1", "pro");
      const plan = await cache.getTenantPlan("tenant-1");
      expect(plan).toBe("pro");
    });
  });

  describe("stream token", () => {
    it("sets and validates a stream token", async () => {
      const tokenData = { tenantId: "tenant-1", cameraId: "cam-1" };
      await cache.setStreamToken("abc123", tokenData);

      const result = await cache.validateStreamToken("abc123");
      expect(result).toEqual(tokenData);
    });

    it("consumes the token on validation (single use)", async () => {
      const tokenData = { tenantId: "tenant-1", cameraId: "cam-1" };
      await cache.setStreamToken("single-use", tokenData);

      // First validation returns data
      const first = await cache.validateStreamToken("single-use");
      expect(first).toEqual(tokenData);

      // Second validation returns null (token consumed)
      const second = await cache.validateStreamToken("single-use");
      expect(second).toBeNull();
    });

    it("returns null for non-existent token", async () => {
      const result = await cache.validateStreamToken("nonexistent");
      expect(result).toBeNull();
    });
  });
});
