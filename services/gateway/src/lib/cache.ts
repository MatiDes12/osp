import type Redis from "ioredis";
import type { CameraStatus, TenantPlan } from "@osp/shared";
import { getRedis } from "./redis.js";
import { createLogger } from "./logger.js";

const logger = createLogger("cache");

const DEFAULT_TTL_SEC = 300; // 5 minutes
const STREAM_TOKEN_TTL_SEC = 120; // 2 minutes

export class CacheService {
  private readonly redis: Redis;

  constructor(redis?: Redis) {
    this.redis = redis ?? getRedis();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      logger.error("Cache get failed", { key, error: String(err) });
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSec: number = DEFAULT_TTL_SEC): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await this.redis.set(key, serialized, "EX", ttlSec);
    } catch (err) {
      logger.error("Cache set failed", { key, error: String(err) });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      logger.error("Cache delete failed", { key, error: String(err) });
    }
  }

  async increment(key: string, ttlSec?: number): Promise<number> {
    try {
      const pipeline = this.redis.multi();
      pipeline.incr(key);
      if (ttlSec !== undefined) {
        pipeline.expire(key, ttlSec);
      }
      const results = await pipeline.exec();
      if (!results || results[0]?.[1] === undefined) {
        return 0;
      }
      return results[0][1] as number;
    } catch (err) {
      logger.error("Cache increment failed", { key, error: String(err) });
      return 0;
    }
  }

  // --- Domain-specific caches ---

  async getCameraStatus(tenantId: string, cameraId: string): Promise<CameraStatus | null> {
    return this.get<CameraStatus>(`osp:camera:status:${tenantId}:${cameraId}`);
  }

  async setCameraStatus(tenantId: string, cameraId: string, status: CameraStatus): Promise<void> {
    await this.set(`osp:camera:status:${tenantId}:${cameraId}`, status, 60);
  }

  async getTenantPlan(tenantId: string): Promise<TenantPlan | null> {
    return this.get<TenantPlan>(`osp:tenant:plan:${tenantId}`);
  }

  async setTenantPlan(tenantId: string, plan: TenantPlan): Promise<void> {
    await this.set(`osp:tenant:plan:${tenantId}`, plan, DEFAULT_TTL_SEC);
  }

  async setStreamToken(
    token: string,
    data: { tenantId: string; cameraId: string },
  ): Promise<void> {
    await this.set(`osp:stream:token:${token}`, data, STREAM_TOKEN_TTL_SEC);
  }

  async validateStreamToken(
    token: string,
  ): Promise<{ tenantId: string; cameraId: string } | null> {
    const key = `osp:stream:token:${token}`;
    const data = await this.get<{ tenantId: string; cameraId: string }>(key);
    if (data !== null) {
      // Consume the token (single use)
      await this.delete(key);
    }
    return data;
  }
}

let defaultCacheService: CacheService | null = null;

export function getCacheService(redis?: Redis): CacheService {
  if (redis) {
    return new CacheService(redis);
  }
  if (!defaultCacheService) {
    defaultCacheService = new CacheService();
  }
  return defaultCacheService;
}
