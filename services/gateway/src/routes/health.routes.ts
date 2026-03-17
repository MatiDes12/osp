import { Hono } from "hono";
import { getSupabase } from "../lib/supabase.js";
import { getRedis } from "../lib/redis.js";
import { getConnectedClientCount } from "../ws/server.js";
import { getPrometheusMetrics } from "../middleware/metrics.js";
import {
  getRawCameraIngestStub,
  getRawVideoPipelineStub,
  getRawEventEngineStub,
  checkServiceHealth,
} from "../grpc/client.js";
import type { ServiceHealth } from "../grpc/client.js";

export const healthRoutes = new Hono();

const startedAt = Date.now();

// ── Helper: check a service with latency ─────────────────────────────────

interface ServiceCheck {
  readonly status: "up" | "down" | "not_configured";
  readonly latency_ms: number;
  readonly error?: string;
  readonly [key: string]: unknown;
}

async function checkSupabase(): Promise<ServiceCheck> {
  const start = performance.now();
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("tenants").select("id").limit(1);
    const latency = Math.round(performance.now() - start);
    if (error) {
      return { status: "down", latency_ms: latency, error: error.message };
    }
    return { status: "up", latency_ms: latency };
  } catch (err) {
    return {
      status: "down",
      latency_ms: Math.round(performance.now() - start),
      error: String(err),
    };
  }
}

async function checkRedis(): Promise<ServiceCheck> {
  const start = performance.now();
  try {
    const redis = getRedis();
    const pong = await redis.ping();
    const latency = Math.round(performance.now() - start);
    return pong === "PONG"
      ? { status: "up", latency_ms: latency }
      : { status: "down", latency_ms: latency, error: `Unexpected response: ${pong}` };
  } catch (err) {
    return {
      status: "down",
      latency_ms: Math.round(performance.now() - start),
      error: String(err),
    };
  }
}

async function checkGo2rtc(): Promise<ServiceCheck> {
  const url = process.env["GO2RTC_API_URL"] ?? "http://localhost:1984";
  const start = performance.now();
  try {
    const res = await fetch(`${url}/api/streams`, {
      signal: AbortSignal.timeout(5_000),
    });
    const latency = Math.round(performance.now() - start);
    if (!res.ok) {
      return { status: "down", latency_ms: latency, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const streamCount = Object.keys(data).length;
    return { status: "up", latency_ms: latency, streams: streamCount };
  } catch (err) {
    return {
      status: "down",
      latency_ms: Math.round(performance.now() - start),
      error: String(err),
    };
  }
}

// ── Helper: check gRPC Go services ───────────────────────────────────────

interface GrpcServiceCheck {
  readonly status: ServiceHealth;
  readonly latency_ms: number;
}

async function checkGrpcService(
  name: string,
  getStub: () => ReturnType<typeof getRawCameraIngestStub>,
  envVar: string,
): Promise<GrpcServiceCheck> {
  const address = process.env[envVar];
  if (!address) {
    return { status: "not_configured", latency_ms: 0 };
  }

  const start = performance.now();
  try {
    const stub = getStub();
    const health = await checkServiceHealth(name, stub);
    return { status: health, latency_ms: Math.round(performance.now() - start) };
  } catch {
    return { status: "down", latency_ms: Math.round(performance.now() - start) };
  }
}

async function checkCameraIngest(): Promise<GrpcServiceCheck> {
  return checkGrpcService("camera-ingest", getRawCameraIngestStub, "CAMERA_INGEST_GRPC_URL");
}

async function checkVideoPipeline(): Promise<GrpcServiceCheck> {
  return checkGrpcService("video-pipeline", getRawVideoPipelineStub, "VIDEO_PIPELINE_GRPC_URL");
}

async function checkEventEngine(): Promise<GrpcServiceCheck> {
  return checkGrpcService("event-engine", getRawEventEngineStub, "EVENT_ENGINE_GRPC_URL");
}

// ── GET /health — basic liveness ─────────────────────────────────────────

healthRoutes.get("/", async (c) => {
  const [supabase, redis, go2rtc] = await Promise.all([
    checkSupabase(),
    checkRedis(),
    checkGo2rtc(),
  ]);

  const overall =
    supabase.status === "up" && redis.status === "up" ? "ok" : "degraded";

  return c.json({
    status: overall,
    service: "osp-gateway",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    checks: {
      supabase: supabase.status,
      redis: redis.status,
      go2rtc: go2rtc.status,
    },
  });
});

// ── GET /health/ready — readiness probe ──────────────────────────────────

healthRoutes.get("/ready", async (c) => {
  const [supabase, redis] = await Promise.all([checkSupabase(), checkRedis()]);

  const ready = supabase.status === "up" && redis.status === "up";

  return c.json(
    {
      status: ready ? "ready" : "not_ready",
      checks: {
        supabase: supabase.status,
        redis: redis.status,
      },
    },
    ready ? 200 : 503,
  );
});

// ── GET /health/detailed — full health snapshot ──────────────────────────

healthRoutes.get("/detailed", async (c) => {
  const [supabase, redis, go2rtc, cameraIngest, videoPipeline, eventEngine] =
    await Promise.all([
      checkSupabase(),
      checkRedis(),
      checkGo2rtc(),
      checkCameraIngest(),
      checkVideoPipeline(),
      checkEventEngine(),
    ]);

  const wsConnections = getConnectedClientCount();

  // Gather stats from Supabase
  let camerasTotal = 0;
  let camerasOnline = 0;
  let eventsLastHour = 0;
  let activeRecordings = 0;

  try {
    const db = getSupabase();
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();

    const [camerasRes, onlineRes, eventsRes, recordingsRes] = await Promise.all([
      db.from("cameras").select("id", { count: "exact", head: true }),
      db.from("cameras").select("id", { count: "exact", head: true }).eq("status", "online"),
      db
        .from("events")
        .select("id", { count: "exact", head: true })
        .gte("detected_at", oneHourAgo),
      db
        .from("recordings")
        .select("id", { count: "exact", head: true })
        .eq("status", "recording"),
    ]);

    camerasTotal = camerasRes.count ?? 0;
    camerasOnline = onlineRes.count ?? 0;
    eventsLastHour = eventsRes.count ?? 0;
    activeRecordings = recordingsRes.count ?? 0;
  } catch {
    // Stats are best-effort; service checks above already flag Supabase down.
  }

  const allUp =
    supabase.status === "up" &&
    redis.status === "up" &&
    go2rtc.status === "up";

  return c.json({
    status: allUp ? "healthy" : "degraded",
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    services: {
      supabase,
      redis,
      go2rtc,
      websocket: { status: "up" as const, connections: wsConnections },
      grpc: {
        camera_ingest: cameraIngest,
        video_pipeline: videoPipeline,
        event_engine: eventEngine,
      },
    },
    stats: {
      cameras_total: camerasTotal,
      cameras_online: camerasOnline,
      events_last_hour: eventsLastHour,
      active_recordings: activeRecordings,
    },
  });
});

// ── GET /metrics — Prometheus exposition format ──────────────────────────

healthRoutes.get("/metrics", async (c) => {
  const wsConnections = getConnectedClientCount();

  // Build extra gauge lines
  const extra: string[] = [];

  try {
    const db = getSupabase();
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();

    const [camerasOnline, camerasTotal, eventsTotal, activeRecordings] =
      await Promise.all([
        db.from("cameras").select("id", { count: "exact", head: true }).eq("status", "online"),
        db.from("cameras").select("id", { count: "exact", head: true }),
        db
          .from("events")
          .select("id", { count: "exact", head: true })
          .gte("detected_at", oneHourAgo),
        db
          .from("recordings")
          .select("id", { count: "exact", head: true })
          .eq("status", "recording"),
      ]);

    extra.push("# HELP osp_cameras_total Total cameras by status");
    extra.push("# TYPE osp_cameras_total gauge");
    extra.push(`osp_cameras_total{status="online"} ${camerasOnline.count ?? 0}`);
    extra.push(`osp_cameras_total{status="total"} ${camerasTotal.count ?? 0}`);

    extra.push("# HELP osp_events_total Events in the last hour");
    extra.push("# TYPE osp_events_total gauge");
    extra.push(`osp_events_total ${eventsTotal.count ?? 0}`);

    extra.push("# HELP osp_recordings_active Active recordings");
    extra.push("# TYPE osp_recordings_active gauge");
    extra.push(`osp_recordings_active ${activeRecordings.count ?? 0}`);
  } catch {
    // Metrics are best-effort.
  }

  extra.push("# HELP osp_websocket_connections Current WebSocket connections");
  extra.push("# TYPE osp_websocket_connections gauge");
  extra.push(`osp_websocket_connections ${wsConnections}`);

  c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return c.text(getPrometheusMetrics(extra.join("\n")));
});
