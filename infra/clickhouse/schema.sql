-- OSP ClickHouse Analytics Schema
-- Run once against a fresh ClickHouse instance (or on migration).

CREATE DATABASE IF NOT EXISTS osp;

-- ─── Events analytics ─────────────────────────────────────────────────────────
-- Denormalised copy of every event.  Optimised for time-series aggregation,
-- heatmaps, and per-camera breakdowns.

CREATE TABLE IF NOT EXISTS osp.events_analytics
(
    event_id     UUID,
    tenant_id    UUID,
    camera_id    UUID,
    zone_id      Nullable(UUID),
    type         LowCardinality(String),
    severity     LowCardinality(String),
    detected_at  DateTime64(3, 'UTC'),
    intensity    Float32,
    acknowledged UInt8,
    -- computed columns
    hour_of_day  UInt8 MATERIALIZED toHour(detected_at),
    day_of_week  UInt8 MATERIALIZED toDayOfWeek(detected_at),   -- 1=Mon … 7=Sun
    date_only    Date  MATERIALIZED toDate(detected_at)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(detected_at)
ORDER BY (tenant_id, detected_at, camera_id)
TTL toDateTime(detected_at) + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192;

-- ─── Recordings analytics ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS osp.recordings_analytics
(
    recording_id UUID,
    tenant_id    UUID,
    camera_id    UUID,
    start_time   DateTime64(3, 'UTC'),
    duration_sec Nullable(Int32),
    size_bytes   Int64,
    trigger      LowCardinality(String),
    status       LowCardinality(String),
    -- computed
    date_only    Date MATERIALIZED toDate(start_time)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (tenant_id, start_time, camera_id)
TTL toDateTime(start_time) + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192;

-- ─── Materialized view: hourly event counts per camera ────────────────────────
-- Pre-aggregated bucket for fast dashboard queries.

CREATE TABLE IF NOT EXISTS osp.events_hourly_mv_data
(
    tenant_id   UUID,
    camera_id   UUID,
    type        LowCardinality(String),
    hour_bucket DateTime,
    count       UInt64
)
ENGINE = SummingMergeTree()
ORDER BY (tenant_id, hour_bucket, camera_id, type);

CREATE MATERIALIZED VIEW IF NOT EXISTS osp.events_hourly_mv
TO osp.events_hourly_mv_data
AS
SELECT
    tenant_id,
    camera_id,
    type,
    toStartOfHour(detected_at) AS hour_bucket,
    count()                    AS count
FROM osp.events_analytics
GROUP BY tenant_id, camera_id, type, hour_bucket;
