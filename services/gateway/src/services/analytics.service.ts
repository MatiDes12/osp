/**
 * Analytics service — write events/recordings to ClickHouse and query
 * pre-aggregated analytics data for the dashboard.
 */

import { chInsert, chQuery, chEscape, chDateTime } from "../lib/clickhouse.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("analytics");

// ─── Write path ──────────────────────────────────────────────────────────────

export interface AnalyticsEventRow {
  eventId: string;
  tenantId: string;
  cameraId: string;
  zoneId?: string | null;
  type: string;
  severity: string;
  detectedAt: string;
  intensity: number;
  acknowledged: boolean;
}

/** Fire-and-forget: write one event row to ClickHouse. */
export function trackEvent(row: AnalyticsEventRow): void {
  const zoneVal = row.zoneId ? `'${chEscape(row.zoneId)}'` : "NULL";
  const sql = `
INSERT INTO osp.events_analytics
  (event_id, tenant_id, camera_id, zone_id, type, severity, detected_at, intensity, acknowledged)
VALUES
  ('${chEscape(row.eventId)}',
   '${chEscape(row.tenantId)}',
   '${chEscape(row.cameraId)}',
   ${zoneVal},
   '${chEscape(row.type)}',
   '${chEscape(row.severity)}',
   ${chDateTime(row.detectedAt)},
   ${Number.isFinite(row.intensity) ? Math.round(row.intensity) : 0},
   ${row.acknowledged ? 1 : 0})
`;
  // intentionally not awaited
  chInsert(sql).catch((err) =>
    logger.warn("trackEvent failed", { error: String(err) }),
  );
}

// ─── Query path ──────────────────────────────────────────────────────────────

export type Granularity = "hour" | "day";

export interface TimeSeriesPoint {
  bucket: string; // ISO datetime string
  count: number;
}

/** Events per hour or day over a time range. */
export async function getEventTimeSeries(opts: {
  tenantId: string;
  from: string;
  to: string;
  granularity: Granularity;
  cameraId?: string;
  type?: string;
}): Promise<TimeSeriesPoint[]> {
  const trunc = opts.granularity === "hour" ? "toStartOfHour" : "toStartOfDay";
  const cameraFilter = opts.cameraId
    ? `AND camera_id = '${chEscape(opts.cameraId)}'`
    : "";
  const typeFilter = opts.type ? `AND type = '${chEscape(opts.type)}'` : "";

  const rows = await chQuery<{ bucket: string; count: string }>(`
    SELECT
      ${trunc}(detected_at) AS bucket,
      count()               AS count
    FROM osp.events_analytics
    WHERE tenant_id = '${chEscape(opts.tenantId)}'
      AND detected_at >= ${chDateTime(opts.from)}
      AND detected_at <  ${chDateTime(opts.to)}
      ${cameraFilter}
      ${typeFilter}
    GROUP BY bucket
    ORDER BY bucket ASC
  `);

  return rows.map((r) => ({
    bucket: r.bucket.replace(" ", "T") + "Z",
    count: Number(r.count),
  }));
}

export interface HeatmapCell {
  hourOfDay: number; // 0-23
  dayOfWeek: number; // 1=Mon … 7=Sun
  count: number;
}

/** Event density by hour-of-day × day-of-week (for heatmap visualisation). */
export async function getEventHeatmap(opts: {
  tenantId: string;
  from: string;
  to: string;
  cameraId?: string;
  type?: string;
}): Promise<HeatmapCell[]> {
  const cameraFilter = opts.cameraId
    ? `AND camera_id = '${chEscape(opts.cameraId)}'`
    : "";
  const typeFilter = opts.type ? `AND type = '${chEscape(opts.type)}'` : "";

  const rows = await chQuery<{
    hour_of_day: string;
    day_of_week: string;
    count: string;
  }>(`
    SELECT
      hour_of_day,
      day_of_week,
      count() AS count
    FROM osp.events_analytics
    WHERE tenant_id = '${chEscape(opts.tenantId)}'
      AND detected_at >= ${chDateTime(opts.from)}
      AND detected_at <  ${chDateTime(opts.to)}
      ${cameraFilter}
      ${typeFilter}
    GROUP BY hour_of_day, day_of_week
    ORDER BY day_of_week, hour_of_day
  `);

  return rows.map((r) => ({
    hourOfDay: Number(r.hour_of_day),
    dayOfWeek: Number(r.day_of_week),
    count: Number(r.count),
  }));
}

export interface EventTypeBreakdown {
  type: string;
  count: number;
  pct: number;
}

/** Events grouped by type over a range. */
export async function getEventBreakdown(opts: {
  tenantId: string;
  from: string;
  to: string;
  cameraId?: string;
}): Promise<EventTypeBreakdown[]> {
  const cameraFilter = opts.cameraId
    ? `AND camera_id = '${chEscape(opts.cameraId)}'`
    : "";

  const rows = await chQuery<{ type: string; count: string }>(`
    SELECT type, count() AS count
    FROM osp.events_analytics
    WHERE tenant_id = '${chEscape(opts.tenantId)}'
      AND detected_at >= ${chDateTime(opts.from)}
      AND detected_at <  ${chDateTime(opts.to)}
      ${cameraFilter}
    GROUP BY type
    ORDER BY count DESC
  `);

  const total = rows.reduce((s, r) => s + Number(r.count), 0);
  return rows.map((r) => ({
    type: r.type,
    count: Number(r.count),
    pct: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
  }));
}

export interface CameraActivity {
  cameraId: string;
  count: number;
  lastSeen: string;
}

/** Top cameras by event count over a range. */
export async function getCameraActivity(opts: {
  tenantId: string;
  from: string;
  to: string;
  limit?: number;
}): Promise<CameraActivity[]> {
  const limit = opts.limit ?? 10;

  const rows = await chQuery<{
    camera_id: string;
    count: string;
    last_seen: string;
  }>(`
    SELECT
      camera_id,
      count()          AS count,
      max(detected_at) AS last_seen
    FROM osp.events_analytics
    WHERE tenant_id = '${chEscape(opts.tenantId)}'
      AND detected_at >= ${chDateTime(opts.from)}
      AND detected_at <  ${chDateTime(opts.to)}
    GROUP BY camera_id
    ORDER BY count DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    cameraId: r.camera_id,
    count: Number(r.count),
    lastSeen: r.last_seen.replace(" ", "T") + "Z",
  }));
}

export interface RecordingsSummary {
  totalRecordings: number;
  totalDurationSec: number;
  totalSizeBytes: number;
  byTrigger: Record<string, number>;
  dailyStorageBytes: { date: string; bytes: number }[];
}

/** Storage and duration stats for recordings. */
export async function getRecordingsSummary(opts: {
  tenantId: string;
  from: string;
  to: string;
  cameraId?: string;
}): Promise<RecordingsSummary> {
  const cameraFilter = opts.cameraId
    ? `AND camera_id = '${chEscape(opts.cameraId)}'`
    : "";

  const [totals, byTrigger, daily] = await Promise.all([
    chQuery<{ total: string; duration: string; size: string }>(`
      SELECT
        count()           AS total,
        sum(duration_sec) AS duration,
        sum(size_bytes)   AS size
      FROM osp.recordings_analytics
      WHERE tenant_id = '${chEscape(opts.tenantId)}'
        AND start_time >= ${chDateTime(opts.from)}
        AND start_time <  ${chDateTime(opts.to)}
        ${cameraFilter}
    `),
    chQuery<{ trigger: string; count: string }>(`
      SELECT trigger, count() AS count
      FROM osp.recordings_analytics
      WHERE tenant_id = '${chEscape(opts.tenantId)}'
        AND start_time >= ${chDateTime(opts.from)}
        AND start_time <  ${chDateTime(opts.to)}
        ${cameraFilter}
      GROUP BY trigger
    `),
    chQuery<{ date: string; bytes: string }>(`
      SELECT
        toDate(start_time) AS date,
        sum(size_bytes)    AS bytes
      FROM osp.recordings_analytics
      WHERE tenant_id = '${chEscape(opts.tenantId)}'
        AND start_time >= ${chDateTime(opts.from)}
        AND start_time <  ${chDateTime(opts.to)}
        ${cameraFilter}
      GROUP BY date
      ORDER BY date ASC
    `),
  ]);

  const t = totals[0];
  return {
    totalRecordings: Number(t?.total ?? 0),
    totalDurationSec: Number(t?.duration ?? 0),
    totalSizeBytes: Number(t?.size ?? 0),
    byTrigger: Object.fromEntries(
      byTrigger.map((r) => [r.trigger, Number(r.count)]),
    ),
    dailyStorageBytes: daily.map((r) => ({
      date: String(r.date),
      bytes: Number(r.bytes),
    })),
  };
}
