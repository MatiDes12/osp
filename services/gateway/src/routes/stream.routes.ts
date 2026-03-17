import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { getStreamService } from "../services/stream.service.js";
import { createSuccessResponse } from "@osp/shared";
import { createLogger } from "../lib/logger.js";
import { DiscoveryService } from "../services/discovery.service.js";

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

  // Set status to connecting while we attempt to re-add
  await supabase
    .from("cameras")
    .update({ status: "connecting", updated_at: new Date().toISOString() })
    .eq("id", cameraId)
    .eq("tenant_id", tenantId);

  try {
    await streamService.addStream(cameraId, camera.connection_uri as string);

    // Stream re-added successfully — mark camera as online
    await supabase
      .from("cameras")
      .update({ status: "online", updated_at: new Date().toISOString() })
      .eq("id", cameraId)
      .eq("tenant_id", tenantId);
  } catch (err) {
    logger.warn("Failed to re-add stream in go2rtc on reconnect", {
      cameraId,
      error: String(err),
    });

    await supabase
      .from("cameras")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", cameraId)
      .eq("tenant_id", tenantId);
  }

  return c.json(
    createSuccessResponse({ reconnected: true, cameraId }),
  );
});

// GET /api/v1/cameras/:id/recording.mp4 - Proxy MP4 stream from go2rtc for playback
streamRoutes.get("/:id/recording.mp4", requireAuth("viewer"), async (c) => {
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

  const go2rtcUrl = process.env["GO2RTC_URL"] ?? "http://localhost:1984";
  const duration = c.req.query("duration") ?? "30";
  const mp4Url = `${go2rtcUrl}/api/stream.mp4?src=${encodeURIComponent(cameraId)}&duration=${duration}`;

  logger.info("Proxying MP4 stream from go2rtc", { cameraId, mp4Url });

  const go2rtcResponse = await fetch(mp4Url);

  if (!go2rtcResponse.ok) {
    throw new ApiError("STREAM_ERROR", "Failed to get MP4 stream", 502);
  }

  return new Response(go2rtcResponse.body, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    },
  });
});

// POST /api/v1/cameras/discover - Network RTSP port scan discovery
streamRoutes.post("/discover", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();
  const body = await c.req.json().catch(() => ({}));
  const subnet = (body as { subnet?: string }).subnet;

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

  const discoveryService = new DiscoveryService();
  const { cameras, scanDurationMs, subnetScanned } =
    await discoveryService.scanNetwork(subnet);

  // Mark cameras that are already added by checking all possible paths
  const marked = cameras.map((cam) => {
    const isAdded =
      existingUris.has(cam.rtspUrl) ||
      (cam.possiblePaths ?? []).some((p) => existingUris.has(p));
    return { ...cam, alreadyAdded: isAdded };
  });

  logger.info("Discovery scan completed", {
    tenantId,
    camerasFound: marked.length,
    scanDurationMs,
    subnetScanned,
  });

  return c.json(
    createSuccessResponse({ cameras: marked, scanDurationMs, subnetScanned }),
  );
});
