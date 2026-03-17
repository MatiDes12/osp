import { Hono } from "hono";
import type { Env } from "../app.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { publishEvent } from "../lib/event-publisher.js";
import { createSuccessResponse } from "@osp/shared";
import type { EventSeverity } from "@osp/shared";
import { z } from "zod";

export const devRoutes = new Hono<Env>();

const SimulateMotionSchema = z.object({
  cameraId: z.string().uuid(),
});

// POST /api/v1/dev/simulate-motion
devRoutes.post("/simulate-motion", async (c) => {
  if (process.env["NODE_ENV"] !== "development") {
    throw new ApiError(
      "DEV_ONLY",
      "This endpoint is only available in development mode",
      403,
    );
  }

  const body = await c.req.json();
  const input = SimulateMotionSchema.parse(body);
  const supabase = getSupabase();

  // Look up camera to get tenant info and name
  const { data: camera, error: cameraError } = await supabase
    .from("cameras")
    .select("id, name, tenant_id")
    .eq("id", input.cameraId)
    .single();

  if (cameraError || !camera) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
  }

  const tenantId = camera.tenant_id as string;
  const intensity = Math.round(Math.random() * 100);
  const severities: EventSeverity[] = ["low", "medium", "high", "critical"];
  const severityIndex =
    intensity < 25 ? 0 : intensity < 50 ? 1 : intensity < 80 ? 2 : 3;
  const severity = severities[severityIndex] as EventSeverity;
  const now = new Date().toISOString();

  const eventRow = {
    camera_id: input.cameraId,
    tenant_id: tenantId,
    type: "motion" as const,
    severity,
    detected_at: now,
    metadata: { intensity, simulated: true },
    intensity,
    acknowledged: false,
  };

  const { data: created, error: insertError } = await supabase
    .from("events")
    .insert(eventRow)
    .select("*")
    .single();

  if (insertError || !created) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "Failed to create simulated event",
      500,
    );
  }

  // Build the OSPEvent shape for the WebSocket broadcast
  const ospEvent = {
    id: created.id as string,
    cameraId: created.camera_id as string,
    cameraName: (camera.name as string) ?? "Unknown",
    zoneId: (created.zone_id as string | null) ?? null,
    zoneName: null,
    tenantId,
    type: created.type as string,
    severity: created.severity as string,
    detectedAt: created.detected_at as string,
    metadata: created.metadata as Record<string, unknown>,
    snapshotUrl: null,
    clipUrl: null,
    intensity: created.intensity as number,
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
    createdAt: created.created_at as string,
  };

  await publishEvent(tenantId, ospEvent);

  return c.json(createSuccessResponse(ospEvent), 201);
});
