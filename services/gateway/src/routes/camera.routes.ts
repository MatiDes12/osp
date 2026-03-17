import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { getStreamService } from "../services/stream.service.js";
import { createLogger } from "../lib/logger.js";
import {
  CreateCameraSchema,
  UpdateCameraSchema,
  CreateZoneSchema,
  UpdateZoneSchema,
} from "@osp/shared";
import { createSuccessResponse } from "@osp/shared";

const logger = createLogger("camera-routes");

export const cameraRoutes = new Hono<Env>();

// List cameras
cameraRoutes.get("/", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const page = parseInt(c.req.query("page") ?? "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const status = c.req.query("status");
  const search = c.req.query("search");
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
    query = query.ilike("name", `%${search}%`);
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
      capabilities: { ptz: false, audio: false, two_way_audio: false, infrared: false, resolution: "unknown" },
      config: input.config ?? { recording_mode: "motion", motion_sensitivity: 5, audio_enabled: false },
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
  } catch (err) {
    logger.warn("Failed to register stream in go2rtc on camera create", {
      cameraId: camera.id,
      error: String(err),
    });
    // Non-fatal: camera is created, stream can be added later via reconnect
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

// Delete camera
cameraRoutes.delete("/:id", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");
  const supabase = getSupabase();

  const { error } = await supabase
    .from("cameras")
    .delete()
    .eq("id", cameraId)
    .eq("tenant_id", tenantId);

  if (error) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
  }

  // Remove stream from go2rtc
  try {
    const streamService = getStreamService();
    await streamService.removeStream(cameraId);
  } catch (err) {
    logger.warn("Failed to remove stream from go2rtc on camera delete", {
      cameraId,
      error: String(err),
    });
    // Non-fatal: camera is deleted, go2rtc stream will be orphaned but harmless
  }

  return c.json(createSuccessResponse({ deleted: true }));
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
  if (input.alertEnabled !== undefined) updates["alert_enabled"] = input.alertEnabled;
  if (input.sensitivity !== undefined) updates["sensitivity"] = input.sensitivity;
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
