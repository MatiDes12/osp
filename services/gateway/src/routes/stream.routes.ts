import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { getStreamService } from "../services/stream.service.js";
import { createSuccessResponse } from "@osp/shared";
import type { DiscoveredCamera } from "@osp/shared";

export const streamRoutes = new Hono<Env>();

// GET /api/v1/cameras/:id/stream - Returns WebRTC connection info
streamRoutes.get("/:id/stream", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");
  const supabase = getSupabase();

  // Verify camera belongs to tenant
  const { data: camera, error } = await supabase
    .from("cameras")
    .select("id, status")
    .eq("id", cameraId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !camera) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
  }

  if (camera.status === "disabled") {
    throw new ApiError(
      "CAMERA_DISABLED",
      "Camera is disabled and cannot stream",
      409,
    );
  }

  const streamService = getStreamService();
  const { whepUrl, token, iceServers } = await streamService.getWebRTCUrl(
    cameraId,
    tenantId,
  );

  const fallbackHlsUrl = `${process.env["GO2RTC_URL"] ?? "http://localhost:1984"}/api/stream.m3u8?src=${encodeURIComponent(cameraId)}`;

  return c.json(
    createSuccessResponse({
      whepUrl,
      token,
      fallbackHlsUrl,
      iceServers,
    }),
  );
});

// GET /api/v1/cameras/:id/snapshot - Returns current snapshot
streamRoutes.get("/:id/snapshot", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");
  const supabase = getSupabase();

  // Verify camera belongs to tenant
  const { data: camera, error } = await supabase
    .from("cameras")
    .select("id")
    .eq("id", cameraId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !camera) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
  }

  const streamService = getStreamService();
  const imageBuffer = await streamService.getSnapshot(cameraId);

  return new Response(imageBuffer, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Length": String(imageBuffer.length),
    },
  });
});

// POST /api/v1/cameras/:id/reconnect - Force reconnect camera stream
streamRoutes.post("/:id/reconnect", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");
  const supabase = getSupabase();

  // Verify camera belongs to tenant and get connection URI
  const { data: camera, error } = await supabase
    .from("cameras")
    .select("id, connection_uri, status")
    .eq("id", cameraId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !camera) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
  }

  if (camera.status === "disabled") {
    throw new ApiError(
      "CAMERA_DISABLED",
      "Camera is disabled and cannot be reconnected",
      409,
    );
  }

  const streamService = getStreamService();

  // Remove existing stream, then re-add
  await streamService.removeStream(cameraId);
  await streamService.addStream(cameraId, camera.connection_uri as string);

  // Update camera status to connecting
  await supabase
    .from("cameras")
    .update({ status: "connecting", updated_at: new Date().toISOString() })
    .eq("id", cameraId)
    .eq("tenant_id", tenantId);

  return c.json(
    createSuccessResponse({ reconnected: true, cameraId }),
  );
});

// POST /api/v1/cameras/discover - ONVIF discovery (placeholder)
streamRoutes.post("/discover", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  // Get existing cameras to mark already-added ones
  const { data: existingCameras } = await supabase
    .from("cameras")
    .select("connection_uri")
    .eq("tenant_id", tenantId);

  const existingUris = new Set(
    (existingCameras ?? []).map(
      (cam: { connection_uri: string }) => cam.connection_uri,
    ),
  );

  // Mock discovered cameras (placeholder for ONVIF discovery)
  const mockDiscovered: DiscoveredCamera[] = [
    {
      ip: "192.168.1.100",
      port: 554,
      manufacturer: "Hikvision",
      model: "DS-2CD2143G2-I",
      name: "Front Entrance Camera",
      rtspUrl: "rtsp://192.168.1.100:554/Streaming/Channels/101",
      onvifUrl: "http://192.168.1.100:80/onvif/device_service",
      alreadyAdded: existingUris.has(
        "rtsp://192.168.1.100:554/Streaming/Channels/101",
      ),
    },
    {
      ip: "192.168.1.101",
      port: 554,
      manufacturer: "Dahua",
      model: "IPC-HDW3849H-AS-PV",
      name: "Parking Lot Camera",
      rtspUrl: "rtsp://192.168.1.101:554/cam/realmonitor?channel=1&subtype=0",
      onvifUrl: "http://192.168.1.101:80/onvif/device_service",
      alreadyAdded: existingUris.has(
        "rtsp://192.168.1.101:554/cam/realmonitor?channel=1&subtype=0",
      ),
    },
    {
      ip: "192.168.1.102",
      port: 554,
      manufacturer: "Reolink",
      model: "RLC-810A",
      name: "Backyard Camera",
      rtspUrl: "rtsp://192.168.1.102:554/h264Preview_01_main",
      onvifUrl: "http://192.168.1.102:80/onvif/device_service",
      alreadyAdded: existingUris.has(
        "rtsp://192.168.1.102:554/h264Preview_01_main",
      ),
    },
  ];

  return c.json(createSuccessResponse(mockDiscovered));
});
