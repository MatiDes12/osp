import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { getStreamService } from "../services/stream.service.js";
import { createSuccessResponse } from "@osp/shared";
import { createLogger } from "../lib/logger.js";
import type { DiscoveredCamera } from "@osp/shared";

const logger = createLogger("stream-routes");

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
  const { token, iceServers } = await streamService.getWebRTCUrl(
    cameraId,
    tenantId,
  );

  // Return the gateway's WHEP proxy URL so the browser avoids CORS issues with go2rtc
  const gatewayOrigin = process.env["GATEWAY_PUBLIC_URL"] ?? `${new URL(c.req.url).origin}`;
  const whepUrl = `${gatewayOrigin}/api/v1/cameras/${encodeURIComponent(cameraId)}/whep`;

  const go2rtcUrl = process.env["GO2RTC_URL"] ?? "http://localhost:1984";
  const fallbackHlsUrl = `${go2rtcUrl}/api/stream.m3u8?src=${encodeURIComponent(cameraId)}`;

  return c.json(
    createSuccessResponse({
      whepUrl,
      token,
      fallbackHlsUrl,
      iceServers,
    }),
  );
});

// POST /api/v1/cameras/:id/whep - Proxy WHEP SDP offer to go2rtc
streamRoutes.post("/:id/whep", requireAuth("viewer"), async (c) => {
  const cameraId = c.req.param("id");
  const tenantId = c.get("tenantId");
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

  const sdpOffer = await c.req.text();
  if (!sdpOffer) {
    throw new ApiError("INVALID_REQUEST", "SDP offer body is required", 400);
  }

  const go2rtcUrl = process.env["GO2RTC_URL"] ?? "http://localhost:1984";
  const whepUrl = `${go2rtcUrl}/api/webrtc?src=${encodeURIComponent(cameraId)}`;

  logger.info("Proxying WHEP offer to go2rtc", { cameraId, whepUrl });

  // go2rtc works best with JSON format: {type:"offer", sdp:"..."}
  const go2rtcResponse = await fetch(whepUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "offer", sdp: sdpOffer }),
  });

  if (!go2rtcResponse.ok) {
    const body = await go2rtcResponse.text().catch(() => "unknown");
    logger.error("go2rtc WHEP failed", {
      cameraId,
      status: go2rtcResponse.status,
      body,
    });
    throw new ApiError(
      "STREAM_ERROR",
      "Camera stream not ready — it may still be connecting",
      502,
    );
  }

  const responseText = await go2rtcResponse.text();

  // go2rtc may return JSON {type:"answer",sdp:"..."} or raw SDP
  let answerSdp: string;
  try {
    const parsed = JSON.parse(responseText);
    answerSdp = parsed.sdp ?? responseText;
  } catch {
    answerSdp = responseText;
  }

  return new Response(answerSdp, {
    status: 200,
    headers: {
      "Content-Type": "application/sdp",
      "Access-Control-Allow-Origin": "*",
    },
  });
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
