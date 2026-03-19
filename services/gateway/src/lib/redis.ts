import Redis from "ioredis";
import { get } from "./config.js";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = get("REDIS_URL") ?? "redis://localhost:6379";
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 200, 5000);
      },
    });
  }

  return redis;
}
