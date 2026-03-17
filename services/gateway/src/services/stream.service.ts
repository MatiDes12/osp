import { getRedis } from "../lib/redis.js";
import { createLogger } from "../lib/logger.js";
import { ApiError } from "../middleware/error-handler.js";

const logger = createLogger("stream-service");

const GO2RTC_DEFAULT_URL = "http://localhost:1984";
const STREAM_TOKEN_TTL_SECONDS = 30;
const STREAM_TOKEN_PREFIX = "osp:stream:token:";
const SNAPSHOT_TIMEOUT_MS = 5000;

export interface StreamStatus {
  name: string;
  producers: ProducerInfo[];
  consumers: ConsumerInfo[];
}

interface ProducerInfo {
  url: string;
  medias: string[];
}

interface ConsumerInfo {
  url: string;
  medias: string[];
}

interface Go2rtcStreamEntry {
  producers: ProducerInfo[];
  consumers: ConsumerInfo[];
}

export class StreamService {
  private readonly go2rtcUrl: string;

  constructor(go2rtcUrl?: string) {
    this.go2rtcUrl = go2rtcUrl ?? process.env["GO2RTC_URL"] ?? GO2RTC_DEFAULT_URL;
  }

  async addStream(cameraId: string, rtspUrl: string): Promise<void> {
    const url = new URL("/api/streams", this.go2rtcUrl);
    url.searchParams.set("name", cameraId);
    url.searchParams.set("src", rtspUrl);

    logger.info("Adding stream to go2rtc", { cameraId, rtspUrl });

    const response = await fetch(url.toString(), { method: "PUT" });

    if (!response.ok) {
      const body = await response.text().catch(() => "unknown");
      logger.error("Failed to add stream to go2rtc", {
        cameraId,
        status: response.status,
        body,
      });
      throw new ApiError(
        "STREAM_ADD_FAILED",
        `Failed to register stream in go2rtc: ${response.status}`,
        502,
      );
    }

    logger.info("Stream added to go2rtc", { cameraId });
  }

  async removeStream(cameraId: string): Promise<void> {
    // go2rtc DELETE uses ?src= to identify the stream by name
    const url = new URL("/api/streams", this.go2rtcUrl);
    url.searchParams.set("src", cameraId);

    logger.info("Removing stream from go2rtc", { cameraId });

    const response = await fetch(url.toString(), { method: "DELETE" });

    if (!response.ok) {
      const body = await response.text().catch(() => "unknown");
      logger.warn("Failed to remove stream from go2rtc", {
        cameraId,
        status: response.status,
        body,
      });
      // Non-critical: stream may already be gone
    }

    logger.info("Stream removed from go2rtc", { cameraId });
  }

  async getStreamStatus(cameraId: string): Promise<StreamStatus | null> {
    const url = new URL("/api/streams", this.go2rtcUrl);
    url.searchParams.set("src", cameraId);

    const response = await fetch(url.toString(), { method: "GET" });

    if (!response.ok) {
      logger.debug("Stream not found in go2rtc", { cameraId });
      return null;
    }

    // go2rtc returns the stream entry directly when ?src= is specified
    // (not wrapped in a map like the full listing)
    const data = (await response.json()) as Go2rtcStreamEntry;

    if (!data || (!data.producers && !data.consumers)) {
      return null;
    }

    return {
      name: cameraId,
      producers: data.producers ?? [],
      consumers: data.consumers ?? [],
    };
  }

  async listStreams(): Promise<Record<string, Go2rtcStreamEntry>> {
    const url = new URL("/api/streams", this.go2rtcUrl);

    const response = await fetch(url.toString(), { method: "GET" });

    if (!response.ok) {
      logger.error("Failed to list streams from go2rtc", {
        status: response.status,
      });
      throw new ApiError(
        "STREAM_LIST_FAILED",
        "Failed to list streams from go2rtc",
        502,
      );
    }

    return (await response.json()) as Record<string, Go2rtcStreamEntry>;
  }

  async getWebRTCUrl(
    cameraId: string,
    tenantId: string,
  ): Promise<{
    whepUrl: string;
    token: string;
    iceServers: { urls: string[]; username?: string; credential?: string }[];
  }> {
    // Verify stream exists in go2rtc (best-effort: if go2rtc is unreachable we still return the URL)
    try {
      const status = await this.getStreamStatus(cameraId);
      if (!status) {
        logger.warn("Stream not found in go2rtc, returning URL anyway", { cameraId });
      }
    } catch (err) {
      logger.warn("Could not verify stream in go2rtc", { cameraId, error: String(err) });
    }

    // Generate a lightweight token (stored in Redis when available)
    const token = crypto.randomUUID();
    try {
      const redisKey = `${STREAM_TOKEN_PREFIX}${token}`;
      const redis = getRedis();
      await redis.set(
        redisKey,
        JSON.stringify({ tenantId, cameraId }),
        "EX",
        STREAM_TOKEN_TTL_SECONDS,
      );
    } catch (err) {
      logger.warn("Could not store stream token in Redis", { cameraId, error: String(err) });
    }

    logger.debug("Generated stream token", { cameraId, tenantId });

    const whepUrl = `${this.go2rtcUrl}/api/webrtc?src=${encodeURIComponent(cameraId)}`;

    const iceServers = buildIceServers();

    return { whepUrl, token, iceServers };
  }

  async getSnapshot(cameraId: string): Promise<Buffer> {
    const url = new URL("/api/frame.jpeg", this.go2rtcUrl);
    url.searchParams.set("src", cameraId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SNAPSHOT_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ApiError(
          "SNAPSHOT_FAILED",
          `Failed to capture snapshot: ${response.status}`,
          502,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
      logger.error("Snapshot capture failed", {
        cameraId,
        error: String(err),
      });
      throw new ApiError(
        "SNAPSHOT_FAILED",
        "Failed to capture snapshot from stream",
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildIceServers(): {
  urls: string[];
  username?: string;
  credential?: string;
}[] {
  const servers: {
    urls: string[];
    username?: string;
    credential?: string;
  }[] = [];

  // Default STUN server
  servers.push({ urls: ["stun:stun.l.google.com:19302"] });

  // Optional TURN server from environment
  const turnUrl = process.env["TURN_SERVER_URL"];
  const turnUser = process.env["TURN_SERVER_USERNAME"];
  const turnCredential = process.env["TURN_SERVER_CREDENTIAL"];

  if (turnUrl && turnUser && turnCredential) {
    servers.push({
      urls: [turnUrl],
      username: turnUser,
      credential: turnCredential,
    });
  }

  return servers;
}

// Singleton instance
let streamServiceInstance: StreamService | null = null;

export function getStreamService(): StreamService {
  if (!streamServiceInstance) {
    streamServiceInstance = new StreamService();
  }
  return streamServiceInstance;
}
