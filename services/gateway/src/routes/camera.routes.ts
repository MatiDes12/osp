import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { getStreamService } from "../services/stream.service.js";
import { getRecordingService } from "../services/recording.service.js";
import {
  getCameraIngestClient,
  GrpcFallbackError,
} from "../grpc/camera-ingest.client.js";
import { get } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";
import {
  CreateCameraSchema,
  UpdateCameraSchema,
  CreateZoneSchema,
  UpdateZoneSchema,
  PTZCommandSchema,
  createSuccessResponse,
} from "@osp/shared";
import type { PTZCommandInput, RecordingTrigger } from "@osp/shared";

const logger = createLogger("camera-routes");

export const cameraRoutes = new Hono<Env>();

// Internal service endpoint for ingest workers (no user JWT).
// Protected by shared service token.
cameraRoutes.get("/internal/online", async (c) => {
  const token = c.req.header("X-Internal-Token");
  const expectedToken = get("API_TOKEN");
  if (!expectedToken || !token || token !== expectedToken) {
    throw new ApiError(
      "AUTH_TOKEN_INVALID",
      "Invalid internal service token",
      401,
    );
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("cameras")
    .select("id, tenant_id, name, connection_uri, status, config")
    .eq("status", "online");

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch online cameras", 500);
  }

  return c.json(createSuccessResponse(data ?? []));
});

// List cameras
cameraRoutes.get("/", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const page = Number.parseInt(c.req.query("page") ?? "1", 10);
  const limit = Math.min(
    Number.parseInt(c.req.query("limit") ?? "20", 10),
    100,
  );
  const status = c.req.query("status");
  const search = c.req.query("search");
  const locationId = c.req.query("locationId");
  const offset = (page - 1) * limit;

  let query = supabase
    .from("cameras")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }
  if (search) {
    // Cap search length to prevent expensive wildcard queries
    const safeSearch = search.slice(0, 100);
    query = query.ilike("name", `%${safeSearch}%`);
  }
  if (locationId) {
    query = query.eq("location_id", locationId);
  }

  const { data: cameras, count, error } = await query;

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch cameras", 500);
  }

  return c.json(
    createSuccessResponse(cameras ?? [], {
      total: count ?? 0,
      page,
      limit,
      hasMore: (count ?? 0) > offset + limit,
    }),
  );
});

// Get camera by ID
cameraRoutes.get("/:id", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");
  const supabase = getSupabase();

  const { data: camera, error } = await supabase
    .from("cameras")
    .select("*")
    .eq("id", cameraId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !camera) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
  }

  return c.json(createSuccessResponse(camera));
});

// Create camera
cameraRoutes.post("/", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const input = CreateCameraSchema.parse(body);
  const supabase = getSupabase();

  // Check camera limit
  const { count } = await supabase
    .from("cameras")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const { data: tenant } = await supabase
    .from("tenants")
    .select("max_cameras")
    .eq("id", tenantId)
    .single();

  if (tenant && (count ?? 0) >= tenant.max_cameras) {
    throw new ApiError(
      "CAMERA_LIMIT_REACHED",
      "Camera limit reached for your plan",
      403,
    );
  }

  // Check for duplicate URI
  const { data: existing } = await supabase
    .from("cameras")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("connection_uri", input.connectionUri)
    .single();

  if (existing) {
    throw new ApiError(
      "CAMERA_ALREADY_EXISTS",
      "A camera with this connection URI already exists",
      409,
    );
  }

  const { data: camera, error } = await supabase
    .from("cameras")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      protocol: input.protocol,
      connection_uri: input.connectionUri,
      status: "connecting",
      location: input.location ?? {},
      capabilities: {
        ptz: false,
        audio: false,
        two_way_audio: false,
        infrared: false,
        resolution: "unknown",
      },
      config: input.config ?? {
        recording_mode: "motion",
        motion_sensitivity: 5,
        audio_enabled: false,
      },
      ptz_capable: false,
      audio_capable: false,
    })
    .select()
    .single();

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to create camera", 500);
  }

  // Register stream in go2rtc
  try {
    const streamService = getStreamService();
    await streamService.addStream(camera.id, input.connectionUri);

    // Stream registered successfully — mark camera as online
    await supabase
      .from("cameras")
      .update({ status: "online", updated_at: new Date().toISOString() })
      .eq("id", camera.id)
      .eq("tenant_id", tenantId);

    camera.status = "online";
  } catch (err) {
    logger.warn("Failed to register stream in go2rtc on camera create", {
      cameraId: camera.id,
      error: String(err),
    });

    // Mark camera as error so the UI reflects the failure
    await supabase
      .from("cameras")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", camera.id)
      .eq("tenant_id", tenantId);

    camera.status = "error";
  }

  return c.json(createSuccessResponse(camera), 201);
});

// Update camera
cameraRoutes.patch("/:id", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");
  const body = await c.req.json();
  const input = UpdateCameraSchema.parse(body);
  const supabase = getSupabase();

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates["name"] = input.name;
  if (input.location !== undefined) updates["location"] = input.location;
  if (input.config !== undefined) updates["config"] = input.config;
  updates["updated_at"] = new Date().toISOString();

  const { data: camera, error } = await supabase
    .from("cameras")
    .update(updates)
    .eq("id", cameraId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error || !camera) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
  }

  return c.json(createSuccessResponse(camera));
});

// Update camera capabilities (e.g. enable/disable two-way audio)
cameraRoutes.patch("/:id/capabilities", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");
  const supabase = getSupabase();

  const body = (await c.req.json()) as Record<string, unknown>;

  // Fetch current camera so we can merge capabilities and re-register if needed
  const { data: camera, error: fetchError } = await supabase
    .from("cameras")
    .select("id, connection_uri, capabilities, audio_capable")
    .eq("id", cameraId)
    .eq("tenant_id", tenantId)
    .single();

  if (fetchError || !camera) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
  }

  const current = (camera.capabilities as Record<string, unknown>) ?? {};
  const merged = { ...current };

  // Apply allowed capability overrides from the request body
  const allowed = [
    "ptz",
    "audio",
    "twoWayAudio",
    "two_way_audio",
    "infrared",
    "resolution",
  ] as const;
  for (const key of allowed) {
    if (key in body) merged[key] = body[key];
  }

  // Normalise: store as two_way_audio (snake_case) in DB, honour both spellings from client
  const twoWayAudio = Boolean(
    body["twoWayAudio"] ??
    body["two_way_audio"] ??
    current["twoWayAudio"] ??
    current["two_way_audio"] ??
    false,
  );
  merged["two_way_audio"] = twoWayAudio;
  delete merged["twoWayAudio"]; // keep DB column consistent (snake_case)

  const { data: updated, error: updateError } = await supabase
    .from("cameras")
    .update({
      capabilities: merged,
      audio_capable: Boolean(merged["audio"]) || twoWayAudio,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cameraId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (updateError || !updated) {
    throw new ApiError("INTERNAL_ERROR", "Failed to update capabilities", 500);
  }

  // Re-register the go2rtc stream when twoWayAudio changes so the backchannel
  // parameter is correctly applied (or removed) for the active stream.
  const prevTwoWayAudio = Boolean(
    current["twoWayAudio"] ?? current["two_way_audio"] ?? false,
  );
  const connectionUri = camera.connection_uri as string | null;

  if (prevTwoWayAudio !== twoWayAudio && connectionUri) {
    try {
      const streamService = getStreamService();
      // Remove existing registration, then re-add with new settings
      await streamService.removeStream(cameraId).catch(() => {});
      await streamService.addStream(cameraId, connectionUri, { twoWayAudio });
      logger.info("Re-registered go2rtc stream after capability change", {
        cameraId,
        twoWayAudio: String(twoWayAudio),
      });
    } catch (err) {
      // Non-fatal: stream will pick up the change on next health-checker cycle
      logger.warn("Failed to re-register stream after capability change", {
        cameraId,
        error: String(err),
      });
    }
  }

  return c.json(createSuccessResponse(updated));
});

// Delete camera
cameraRoutes.delete("/:id", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");
  const supabase = getSupabase();

  // Verify camera exists and belongs to tenant before deleting
  const { data: camera, error: fetchError } = await supabase
    .from("cameras")
    .select("id")
    .eq("id", cameraId)
    .eq("tenant_id", tenantId)
    .single();

  if (fetchError || !camera) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
  }

  // Remove stream from go2rtc BEFORE deleting from DB so we still have the ID
  try {
    const streamService = getStreamService();
    await streamService.removeStream(cameraId);
    logger.info("Removed go2rtc stream for deleted camera", { cameraId });
  } catch (err) {
    logger.warn("Failed to remove stream from go2rtc on camera delete", {
      cameraId,
      error: String(err),
    });
    // Non-fatal: proceed with DB deletion; orphaned go2rtc stream is harmless
  }

  // Delete camera from Supabase (ON DELETE CASCADE handles camera_zones, events, recordings)
  const { error: deleteError } = await supabase
    .from("cameras")
    .delete()
    .eq("id", cameraId)
    .eq("tenant_id", tenantId);

  if (deleteError) {
    logger.error("Failed to delete camera from database", {
      cameraId,
      error: String(deleteError),
    });
    throw new ApiError("INTERNAL_ERROR", "Failed to delete camera", 500);
  }

  return c.json(createSuccessResponse({ deleted: true }));
});

// ── Bulk operations ──

// Bulk assign location
cameraRoutes.post("/bulk/assign-location", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const { cameraIds, locationId } = body as {
    cameraIds?: string[];
    locationId?: string | null;
  };

  if (!Array.isArray(cameraIds) || cameraIds.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "cameraIds array is required", 422);
  }

  const supabase = getSupabase();

  // Verify all cameras belong to tenant
  const { data: ownedCameras } = await supabase
    .from("cameras")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", cameraIds);

  const ownedIds = new Set(
    (ownedCameras ?? []).map((cam: { id: string }) => cam.id),
  );
  const validIds = cameraIds.filter((id) => ownedIds.has(id));

  if (validIds.length === 0) {
    throw new ApiError("CAMERA_NOT_FOUND", "No valid cameras found", 404);
  }

  // If locationId is provided (non-null), verify it belongs to tenant
  if (locationId) {
    const { data: loc } = await supabase
      .from("locations")
      .select("id")
      .eq("id", locationId)
      .eq("tenant_id", tenantId)
      .single();

    if (!loc) {
      throw new ApiError("NOT_FOUND", "Location not found", 404);
    }
  }

  const { error } = await supabase
    .from("cameras")
    .update({
      location_id: locationId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .in("id", validIds);

  if (error) {
    logger.error("Bulk assign-location failed", { error: String(error) });
    throw new ApiError("INTERNAL_ERROR", "Failed to assign location", 500);
  }

  return c.json(createSuccessResponse({ updated: validIds.length }));
});

// Bulk delete
cameraRoutes.post("/bulk/delete", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const { cameraIds } = body as { cameraIds?: string[] };

  if (!Array.isArray(cameraIds) || cameraIds.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "cameraIds array is required", 422);
  }

  const supabase = getSupabase();

  // Verify all cameras belong to tenant
  const { data: ownedCameras } = await supabase
    .from("cameras")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", cameraIds);

  const validIds = (ownedCameras ?? []).map((cam: { id: string }) => cam.id);

  if (validIds.length === 0) {
    throw new ApiError("CAMERA_NOT_FOUND", "No valid cameras found", 404);
  }

  // Remove streams from go2rtc
  const streamService = getStreamService();
  for (const id of validIds) {
    try {
      await streamService.removeStream(id);
    } catch (err) {
      logger.warn("Failed to remove stream on bulk delete", {
        cameraId: id,
        error: String(err),
      });
    }
  }

  const { error } = await supabase
    .from("cameras")
    .delete()
    .eq("tenant_id", tenantId)
    .in("id", validIds);

  if (error) {
    logger.error("Bulk delete failed", { error: String(error) });
    throw new ApiError("INTERNAL_ERROR", "Failed to delete cameras", 500);
  }

  return c.json(createSuccessResponse({ deleted: validIds.length }));
});

// Bulk record start
cameraRoutes.post("/bulk/record-start", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const { cameraIds } = body as { cameraIds?: string[] };

  if (!Array.isArray(cameraIds) || cameraIds.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "cameraIds array is required", 422);
  }

  const supabase = getSupabase();

  // Verify all cameras belong to tenant
  const { data: ownedCameras } = await supabase
    .from("cameras")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", cameraIds);

  const validIds = (ownedCameras ?? []).map((cam: { id: string }) => cam.id);

  const recordingService = getRecordingService();
  const results: { cameraId: string; recordingId?: string; error?: string }[] =
    [];

  for (const id of validIds) {
    try {
      const recordingId = await recordingService.startRecording(
        id,
        tenantId,
        "manual",
      );
      results.push({ cameraId: id, recordingId });
    } catch (err) {
      results.push({ cameraId: id, error: String(err) });
    }
  }

  return c.json(
    createSuccessResponse({
      started: results.filter((r) => !r.error).length,
      results,
    }),
  );
});

// Bulk record stop
cameraRoutes.post("/bulk/record-stop", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const { cameraIds } = body as { cameraIds?: string[] };

  if (!Array.isArray(cameraIds) || cameraIds.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "cameraIds array is required", 422);
  }

  const supabase = getSupabase();

  // Verify all cameras belong to tenant
  const { data: ownedCameras } = await supabase
    .from("cameras")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", cameraIds);

  const validIds = (ownedCameras ?? []).map((cam: { id: string }) => cam.id);

  const recordingService = getRecordingService();
  const results: { cameraId: string; stopped: boolean; error?: string }[] = [];

  for (const id of validIds) {
    try {
      const active = await recordingService.getActiveRecording(id, tenantId);
      if (active) {
        await recordingService.stopRecording(active.id as string);
        results.push({ cameraId: id, stopped: true });
      } else {
        results.push({ cameraId: id, stopped: false });
      }
    } catch (err) {
      results.push({ cameraId: id, stopped: false, error: String(err) });
    }
  }

  return c.json(
    createSuccessResponse({
      stopped: results.filter((r) => r.stopped).length,
      results,
    }),
  );
});

// ── Recording controls ──

// Start recording for a camera
cameraRoutes.post("/:id/record/start", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");

  const body = await c.req.json().catch(() => ({}));
  const trigger =
    ((body as Record<string, unknown>).trigger as RecordingTrigger) ?? "manual";

  const recordingService = getRecordingService();
  const recordingId = await recordingService.startRecording(
    cameraId,
    tenantId,
    trigger,
  );

  return c.json(
    createSuccessResponse({ recordingId, cameraId, status: "recording" }),
    201,
  );
});

// Stop active recording for a camera
cameraRoutes.post("/:id/record/stop", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");

  const recordingService = getRecordingService();
  const active = await recordingService.getActiveRecording(cameraId, tenantId);

  if (!active) {
    throw new ApiError(
      "NO_ACTIVE_RECORDING",
      "No active recording for this camera",
      404,
    );
  }

  const stopped = await recordingService.stopRecording(active.id as string);

  return c.json(createSuccessResponse(stopped));
});

// Get active recording status for a camera
cameraRoutes.get("/:id/record/status", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");

  const recordingService = getRecordingService();
  const active = await recordingService.getActiveRecording(cameraId, tenantId);

  return c.json(
    createSuccessResponse({
      isRecording: !!active,
      recording: active,
    }),
  );
});

// ── PTZ ──

/** Proto enum values for PTZAction. */
const PTZ_ACTION_MOVE = 1;
const PTZ_ACTION_STOP = 2;
const PTZ_ACTION_GOTO_PRESET = 3;

function mapPTZCommandToGrpc(command: PTZCommandInput): {
  action: number;
  pan: number;
  tilt: number;
  zoom: number;
  speed: number;
  presetId: string;
} {
  const speed = command.speed ?? 0.5;

  switch (command.action) {
    case "stop":
      return {
        action: PTZ_ACTION_STOP,
        pan: 0,
        tilt: 0,
        zoom: 0,
        speed: 0,
        presetId: "",
      };
    case "preset":
      return {
        action: PTZ_ACTION_GOTO_PRESET,
        pan: 0,
        tilt: 0,
        zoom: 0,
        speed: 0,
        presetId: command.presetId ?? "1",
      };
    case "zoom":
      return {
        action: PTZ_ACTION_MOVE,
        pan: 0,
        tilt: 0,
        zoom: command.zoom ?? 0,
        speed,
        presetId: "",
      };
    case "move":
    default:
      return {
        action: PTZ_ACTION_MOVE,
        pan: command.pan ?? 0,
        tilt: command.tilt ?? 0,
        zoom: command.zoom ?? 0,
        speed,
        presetId: "",
      };
  }
}

cameraRoutes.post("/:id/ptz", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");
  const body = await c.req.json();
  const command = PTZCommandSchema.parse(body);
  const supabase = getSupabase();

  // Verify camera exists and belongs to tenant
  const { data: camera, error } = await supabase
    .from("cameras")
    .select("id, ptz_capable")
    .eq("id", cameraId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !camera) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
  }

  if (!(camera.ptz_capable as boolean)) {
    throw new ApiError(
      "CAMERA_PTZ_UNSUPPORTED",
      "Camera does not support PTZ",
      400,
    );
  }

  // Forward to camera-ingest gRPC for real ONVIF PTZ SOAP commands
  try {
    const client = getCameraIngestClient();
    const grpcCmd = mapPTZCommandToGrpc(command);
    await client.ptzCommand(cameraId, {
      action: grpcCmd.action,
      pan: grpcCmd.pan,
      tilt: grpcCmd.tilt,
      zoom: grpcCmd.zoom,
      speed: grpcCmd.speed,
      presetId: grpcCmd.presetId,
    });
    return c.json(
      createSuccessResponse({
        cameraId,
        command,
        status: "accepted",
      }),
    );
  } catch (err) {
    if (err instanceof GrpcFallbackError) {
      logger.warn("PTZ forwarded but camera-ingest unavailable", {
        cameraId,
        action: command.action,
      });
      return c.json(
        createSuccessResponse({
          cameraId,
          command,
          status: "accepted",
          message: "PTZ service unavailable; command not executed",
        }),
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("not found") ||
      msg.includes("no ONVIF") ||
      msg.includes("preset_id")
    ) {
      throw new ApiError("CAMERA_PTZ_UNSUPPORTED", msg, 400);
    }
    logger.error("PTZ command failed", {
      cameraId,
      action: command.action,
      error: msg,
    });
    throw new ApiError("CAMERA_PTZ_FAILED", msg, 500);
  }
});

// ── Zones ──

cameraRoutes.get("/:id/zones", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");
  const supabase = getSupabase();

  const { data: zones, error } = await supabase
    .from("camera_zones")
    .select("*")
    .eq("camera_id", cameraId)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch zones", 500);
  }

  return c.json(createSuccessResponse(zones ?? []));
});

cameraRoutes.post("/:id/zones", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");
  const body = await c.req.json();
  const input = CreateZoneSchema.parse(body);
  const supabase = getSupabase();

  const { data: zone, error } = await supabase
    .from("camera_zones")
    .insert({
      camera_id: cameraId,
      tenant_id: tenantId,
      name: input.name,
      polygon_coordinates: input.polygonCoordinates,
      alert_enabled: input.alertEnabled,
      sensitivity: input.sensitivity,
      color_hex: input.colorHex,
      visible_to_roles: input.visibleToRoles ?? [
        "owner",
        "admin",
        "operator",
        "viewer",
      ],
    })
    .select()
    .single();

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to create zone", 500);
  }

  return c.json(createSuccessResponse(zone), 201);
});

cameraRoutes.patch("/:id/zones/:zoneId", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const zoneId = c.req.param("zoneId");
  const body = await c.req.json();
  const input = UpdateZoneSchema.parse(body);
  const supabase = getSupabase();

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates["name"] = input.name;
  if (input.polygonCoordinates !== undefined)
    updates["polygon_coordinates"] = input.polygonCoordinates;
  if (input.alertEnabled !== undefined)
    updates["alert_enabled"] = input.alertEnabled;
  if (input.sensitivity !== undefined)
    updates["sensitivity"] = input.sensitivity;
  if (input.colorHex !== undefined) updates["color_hex"] = input.colorHex;
  if (input.visibleToRoles !== undefined)
    updates["visible_to_roles"] = input.visibleToRoles;
  updates["updated_at"] = new Date().toISOString();

  const { data: zone, error } = await supabase
    .from("camera_zones")
    .update(updates)
    .eq("id", zoneId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error || !zone) {
    throw new ApiError("NOT_FOUND", "Zone not found", 404);
  }

  return c.json(createSuccessResponse(zone));
});

cameraRoutes.delete("/:id/zones/:zoneId", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const zoneId = c.req.param("zoneId");
  const supabase = getSupabase();

  await supabase
    .from("camera_zones")
    .delete()
    .eq("id", zoneId)
    .eq("tenant_id", tenantId);

  return c.json(createSuccessResponse({ deleted: true }));
});
