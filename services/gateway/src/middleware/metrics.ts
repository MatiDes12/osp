// ---------------------------------------------------------------------------
//  Request Metrics Middleware
//  Tracks request count and duration per method/path/status in memory.
//  Exposes data via getMetricsSnapshot() for the /metrics endpoint.
// ---------------------------------------------------------------------------

import type { MiddlewareHandler } from "hono";

// ── In-memory counters ───────────────────────────────────────────────────

interface RequestCounter {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  count: number;
}

interface DurationBucket {
  readonly method: string;
  readonly path: string;
  count: number;
  sum: number;
  buckets: Record<string, number>; // le boundary → count
}

const requestCounters = new Map<string, RequestCounter>();
const durationTrackers = new Map<string, DurationBucket>();

const HISTOGRAM_BOUNDARIES = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/**
 * Normalise a path so we don't blow up cardinality with UUIDs / numeric IDs.
 * e.g. /api/v1/cameras/550e8400-... → /api/v1/cameras/:id
 */
function normalisePath(path: string): string {
  return path
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "/:id",
    )
    .replace(/\/\d+/g, "/:id");
}

function recordRequest(method: string, rawPath: string, status: number, durationMs: number): void {
  const path = normalisePath(rawPath);

  // Counter
  const counterKey = `${method}|${path}|${status}`;
  const existing = requestCounters.get(counterKey);
  if (existing) {
    existing.count += 1;
  } else {
    requestCounters.set(counterKey, { method, path, status, count: 1 });
  }

  // Duration histogram
  const durKey = `${method}|${path}`;
  const tracker = durationTrackers.get(durKey);
  if (tracker) {
    tracker.count += 1;
    tracker.sum += durationMs;
    for (const boundary of HISTOGRAM_BOUNDARIES) {
      if (durationMs <= boundary) {
        const bucketLabel = String(boundary);
        tracker.buckets[bucketLabel] = (tracker.buckets[bucketLabel] ?? 0) + 1;
      }
    }
    // +Inf bucket
    tracker.buckets["+Inf"] = (tracker.buckets["+Inf"] ?? 0) + 1;
  } else {
    const buckets: Record<string, number> = {};
    for (const boundary of HISTOGRAM_BOUNDARIES) {
      buckets[String(boundary)] = durationMs <= boundary ? 1 : 0;
    }
    buckets["+Inf"] = 1;
    durationTrackers.set(durKey, { method, path, count: 1, sum: durationMs, buckets });
  }
}

// ── Middleware ────────────────────────────────────────────────────────────

export function metricsMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now();
    await next();
    const duration = performance.now() - start;
    recordRequest(c.req.method, c.req.path, c.res.status, duration);
  };
}

// ── Prometheus exposition format ─────────────────────────────────────────

export function getPrometheusMetrics(extra: string): string {
  const lines: string[] = [];

  // Request counter
  lines.push("# HELP osp_api_requests_total Total API requests");
  lines.push("# TYPE osp_api_requests_total counter");
  for (const c of requestCounters.values()) {
    lines.push(
      `osp_api_requests_total{method="${c.method}",path="${c.path}",status="${c.status}"} ${c.count}`,
    );
  }

  // Duration histogram
  lines.push("# HELP osp_api_request_duration_ms API request duration in milliseconds");
  lines.push("# TYPE osp_api_request_duration_ms histogram");
  for (const d of durationTrackers.values()) {
    for (const [le, count] of Object.entries(d.buckets)) {
      lines.push(
        `osp_api_request_duration_ms_bucket{method="${d.method}",path="${d.path}",le="${le}"} ${count}`,
      );
    }
    lines.push(
      `osp_api_request_duration_ms_sum{method="${d.method}",path="${d.path}"} ${d.sum}`,
    );
    lines.push(
      `osp_api_request_duration_ms_count{method="${d.method}",path="${d.path}"} ${d.count}`,
    );
  }

  // Extra gauges/counters passed from the health route
  if (extra) {
    lines.push(extra);
  }

  return lines.join("\n") + "\n";
}
