import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { createSuccessResponse } from "@osp/shared";
import { isClickHouseAvailable } from "../lib/clickhouse.js";
import {
  getEventTimeSeries,
  getEventHeatmap,
  getEventBreakdown,
  getCameraActivity,
  getRecordingsSummary,
  type Granularity,
} from "../services/analytics.service.js";

export const analyticsRoutes = new Hono<Env>();

// Shared query-param schema for date range
const DateRangeSchema = z.object({
  from: z
    .string()
    .optional()
    .transform((v) => v ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  to: z
    .string()
    .optional()
    .transform((v) => v ?? new Date().toISOString()),
  cameraId: z.string().uuid().optional(),
});

// ─── Health check ─────────────────────────────────────────────────────────────

analyticsRoutes.get("/status", requireAuth("viewer"), async (c) => {
  const available = await isClickHouseAvailable();
  return c.json(
    createSuccessResponse({ clickhouse: available ? "up" : "down" }),
  );
});

// ─── Event time-series ────────────────────────────────────────────────────────

const TimeSeriesSchema = DateRangeSchema.extend({
  granularity: z.enum(["hour", "day"]).optional().default("hour"),
  type: z.string().optional(),
});

analyticsRoutes.get("/events/timeseries", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const parsed = TimeSeriesSchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid query params", 400);

  const data = await getEventTimeSeries({
    tenantId,
    from: parsed.data.from,
    to: parsed.data.to,
    granularity: parsed.data.granularity as Granularity,
    cameraId: parsed.data.cameraId,
    type: parsed.data.type,
  });

  return c.json(createSuccessResponse(data));
});

// ─── Event heatmap ────────────────────────────────────────────────────────────

const HeatmapSchema = DateRangeSchema.extend({
  type: z.string().optional(),
});

analyticsRoutes.get("/events/heatmap", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const parsed = HeatmapSchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid query params", 400);

  const data = await getEventHeatmap({
    tenantId,
    from: parsed.data.from,
    to: parsed.data.to,
    cameraId: parsed.data.cameraId,
    type: parsed.data.type,
  });

  return c.json(createSuccessResponse(data));
});

// ─── Event breakdown by type ──────────────────────────────────────────────────

analyticsRoutes.get("/events/breakdown", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const parsed = DateRangeSchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid query params", 400);

  const data = await getEventBreakdown({
    tenantId,
    from: parsed.data.from,
    to: parsed.data.to,
    cameraId: parsed.data.cameraId,
  });

  return c.json(createSuccessResponse(data));
});

// ─── Camera activity ──────────────────────────────────────────────────────────

const CameraActivitySchema = DateRangeSchema.extend({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 50) : 10)),
});

analyticsRoutes.get("/cameras/activity", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const parsed = CameraActivitySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid query params", 400);

  const data = await getCameraActivity({
    tenantId,
    from: parsed.data.from,
    to: parsed.data.to,
    limit: parsed.data.limit,
  });

  return c.json(createSuccessResponse(data));
});

// ─── Recordings summary ───────────────────────────────────────────────────────

analyticsRoutes.get("/recordings/summary", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const parsed = DateRangeSchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid query params", 400);

  const data = await getRecordingsSummary({
    tenantId,
    from: parsed.data.from,
    to: parsed.data.to,
    cameraId: parsed.data.cameraId,
  });

  return c.json(createSuccessResponse(data));
});
