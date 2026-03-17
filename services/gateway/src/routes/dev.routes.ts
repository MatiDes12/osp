import { Hono } from "hono";
import type { Env } from "../app.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { publishEvent } from "../lib/event-publisher.js";
import { createSuccessResponse } from "@osp/shared";
import type { EventSeverity } from "@osp/shared";
import { z } from "zod";

export const devRoutes = new Hono<Env>();

// ── Client Action Log Collector ─────────────────────────────────────────
// Receives client-side actions (NAV, ACT, API, etc.) via sendBeacon and
// prints them in a boxed format to the gateway terminal so developers see
// frontend activity alongside backend request logs.

const CLIENT_TAG_COLORS: Record<string, string> = {
  NAV:   "\x1b[34m",  // blue
  ACT:   "\x1b[36m",  // cyan
  API:   "\x1b[33m",  // yellow
  RES:   "\x1b[32m",  // green
  ERR:   "\x1b[31m",  // red
  STATE: "\x1b[35m",  // magenta
  EVENT: "\x1b[35m",  // magenta
  WS:    "\x1b[36m",  // cyan
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

devRoutes.post("/client-log", async (c) => {
  if (process.env["NODE_ENV"] !== "development") {
    return c.body(null, 204);
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    // sendBeacon may send text/plain; try parsing the raw text.
    try {
      const text = await c.req.text();
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return c.body(null, 204);
    }
  }

  const tag = String(body["tag"] ?? "???");
  const label = String(body["label"] ?? "");
  const detail = body["detail"] ? String(body["detail"]) : "";
  const status = body["status"] ? String(body["status"]) : "";
  const ts = String(body["timestamp"] ?? "");

  const color = CLIENT_TAG_COLORS[tag] ?? "";
  const statusChar = status === "ok" ? `${"\x1b[32m"}+${RESET}` : status === "error" ? `${"\x1b[31m"}x${RESET}` : status === "pending" ? `${"\x1b[33m"}~${RESET}` : " ";

  const line = `${DIM}${ts}${RESET}  ${color}${BOLD}${tag.padEnd(5)}${RESET} ${statusChar} ${label}${detail ? `  ${DIM}${detail}${RESET}` : ""}`;

  process.stdout.write(`  [client] ${line}\n`);

  return c.body(null, 204);
});

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
