import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { get } from "../lib/config.js";
import { StreamService, getStreamService } from "../services/stream.service.js";
import { createSuccessResponse } from "@osp/shared";
import { createLogger } from "../lib/logger.js";
import { DiscoveryService } from "../services/discovery.service.js";

const logger = createLogger("stream-routes");

export const streamRoutes = new Hono<Env>();

/** Returns the public go2rtc URL for the tenant's active edge agent, or null. */
async function resolveEdgeGo2rtcUrl(
  supabase: ReturnType<typeof getSupabase>,
  tenantId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("edge_agents")
    .select("go2rtc_url")
    .eq("tenant_id", tenantId)
    .eq("status", "online")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .single()
    .catch(() => ({ data: null }));
  return (data as { go2rtc_url?: string } | null)?.go2rtc_url ?? null;
}

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

  // If an edge agent has a public go2rtc URL (e.g. Cloudflare Tunnel), point
  // the browser directly at it so WebRTC ICE candidates come from the real
  // local machine, not from the gateway proxy which would break media transport.
  const edgeGo2rtcUrl = await resolveEdgeGo2rtcUrl(supabase, tenantId);

  let whepUrl: string;
  let fallbackHlsUrl: string;

  if (edgeGo2rtcUrl) {
    // Direct path: browser → Cloudflare Tunnel → local go2rtc
    whepUrl = `${edgeGo2rtcUrl}/api/webrtc?src=${encodeURIComponent(cameraId)}`;
    fallbackHlsUrl = `${edgeGo2rtcUrl}/api/stream.m3u8?src=${encodeURIComponent(cameraId)}`;
  } else {
    // No edge agent — use gateway proxy (works for cloud-hosted go2rtc)
    const gatewayPublicUrl =
      get("GATEWAY_PUBLIC_URL") ??
      get("NEXT_PUBLIC_API_URL") ??
      "http://localhost:3000";
    whepUrl = `${gatewayPublicUrl}/api/v1/cameras/${encodeURIComponent(cameraId)}/whep`;

    const go2rtcPublicUrl =
      get("GO2RTC_PUBLIC_URL") ??
      get("GO2RTC_API_URL") ??
      get("GO2RTC_URL") ??
      "http://localhost:1984";
    fallbackHlsUrl = `${go2rtcPublicUrl}/api/stream.m3u8?src=${encodeURIComponent(cameraId)}`;
  }

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

  // Verify camera belongs to tenant (also fetch connection_uri for auto-registration)
  const { data: camera, error } = await supabase
    .from("cameras")
    .select("id, connection_uri, status")
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

  // Prefer the edge agent's public go2rtc URL (set via GO2RTC_PUBLIC_URL on the agent).
  // This lets the gateway proxy WebRTC signaling to the correct local go2rtc instance
  // instead of the gateway's own empty go2rtc container.
  const { data: agentRow } = await supabase
    .from("edge_agents")
    .select("go2rtc_url")
    .eq("tenant_id", tenantId)
    .eq("status", "online")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .single()
    .catch(() => ({ data: null }));

  const go2rtcUrl =
    (agentRow as { go2rtc_url?: string } | null)?.go2rtc_url ||
    get("GO2RTC_URL") ||
    "http://localhost:1984";

  const whepUrl = `${go2rtcUrl}/api/webrtc?src=${encodeURIComponent(cameraId)}`;

  logger.info("Proxying WHEP offer to go2rtc", { cameraId, whepUrl });

  // Check if the stream is registered in go2rtc. If not, register it now.
  // This handles the case where go2rtc was restarted and lost its dynamic streams.
  const streamCheckRes = await fetch(
    `${go2rtcUrl}/api/streams?src=${encodeURIComponent(cameraId)}`,
    { signal: AbortSignal.timeout(3000) },
  ).catch(() => null);

  const streamMissing = !streamCheckRes || streamCheckRes.status === 404;
  const connectionUri = camera.connection_uri as string | null;

  if (streamMissing && connectionUri) {
    logger.info("Stream not in go2rtc, auto-registering", { cameraId });
    const streamService = getStreamService();
    try {
      await streamService.addStream(cameraId, connectionUri);
      // Give go2rtc up to 3s to connect to the source
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const check = await fetch(
          `${go2rtcUrl}/api/streams?src=${encodeURIComponent(cameraId)}`,
          { signal: AbortSignal.timeout(2000) },
        ).catch(() => null);
        if (check?.ok) {
          const data = (await check.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          const producers = data?.producers;
          if (Array.isArray(producers) && producers.length > 0) {
            logger.info("Stream connected after auto-registration", {
              cameraId,
            });
            break;
          }
        }
      }
    } catch (err) {
      logger.warn("Auto-registration failed, proceeding anyway", {
        cameraId,
        error: String(err),
      });
    }
  }

  // go2rtc may need a moment to connect to the RTSP source on first request.
  // Retry up to 3 times with a short delay.
  let go2rtcResponse: Response | null = null;
  let lastError = "";
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    go2rtcResponse = await fetch(whepUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "offer", sdp: sdpOffer }),
    });

    if (go2rtcResponse.ok) break;

    lastError = await go2rtcResponse.text().catch(() => "unknown");
    logger.warn("go2rtc WHEP attempt failed", {
      cameraId,
      attempt,
      status: go2rtcResponse.status,
      body: lastError,
    });

    if (attempt < MAX_RETRIES) {
      // Wait 1s before retry — gives go2rtc time to connect to RTSP source
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (!go2rtcResponse || !go2rtcResponse.ok) {
    logger.error("go2rtc WHEP failed after retries", {
      cameraId,
      lastError,
    });
    throw new ApiError(
      "STREAM_ERROR",
      "Camera stream not ready — it may still be connecting. Try again in a moment.",
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

  // Use the edge agent's public go2rtc URL when available
  const edgeUrl = await resolveEdgeGo2rtcUrl(supabase, tenantId);
  let imageBuffer: Buffer;
  if (edgeUrl) {
    const snapUrl = `${edgeUrl}/api/frame.jpeg?src=${encodeURIComponent(cameraId)}`;
    const resp = await fetch(snapUrl, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    if (!resp?.ok) {
      throw new ApiError("SNAPSHOT_FAILED", "Failed to capture snapshot from edge agent", 502);
    }
    imageBuffer = Buffer.from(await resp.arrayBuffer());
  } else {
    const streamService = getStreamService();
    imageBuffer = await streamService.getSnapshot(cameraId);
  }

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

  const edgeGo2rtcUrl = await resolveEdgeGo2rtcUrl(supabase, tenantId);
  const streamService = edgeGo2rtcUrl
    ? new StreamService(edgeGo2rtcUrl)
    : getStreamService();

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

  return c.json(createSuccessResponse({ reconnected: true, cameraId }));
});

// POST /api/v1/streams/test - Test a connection URI before adding a camera
// Registers a temp stream in go2rtc, waits for connection, returns a snapshot
streamRoutes.post("/test", requireAuth("viewer"), async (c) => {
  const body = await c.req.json();
  const connectionUri = body.connectionUri as string;
  const protocol = (body.protocol ?? "rtsp") as string;

  if (!connectionUri) {
    throw new ApiError("VALIDATION_ERROR", "connectionUri is required", 422);
  }

  const go2rtcUrl = get("GO2RTC_URL") ?? "http://localhost:1984";
  const testStreamName = `__test_${Date.now()}`;

  try {
    // Register temp stream
    const addUrl = `${go2rtcUrl}/api/streams?name=${encodeURIComponent(testStreamName)}&src=${encodeURIComponent(connectionUri)}`;
    const addRes = await fetch(addUrl, {
      method: "PUT",
      signal: AbortSignal.timeout(5000),
    });

    if (!addRes.ok) {
      throw new ApiError(
        "CAMERA_CONNECTION_FAILED",
        "Failed to register stream in go2rtc",
        502,
      );
    }

    // Wait up to 5s for go2rtc to connect to the source
    let connected = false;
    let codec = "unknown";
    let resolution = "unknown";

    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 500));

      const statusRes = await fetch(
        `${go2rtcUrl}/api/streams?src=${encodeURIComponent(testStreamName)}`,
        { signal: AbortSignal.timeout(2000) },
      ).catch(() => null);

      if (statusRes?.ok) {
        const data = (await statusRes.json()) as Record<string, unknown>;
        const producers = data?.producers;
        if (Array.isArray(producers) && producers.length > 0) {
          const producer = producers[0] as Record<string, unknown>;
          const medias = producer?.medias as string[] | undefined;
          if (medias?.length) {
            // Parse codec and resolution from media string e.g. "video, H264, 1920x1080"
            const videoMedia = medias.find((m: string) => m.includes("video"));
            if (videoMedia) {
              const parts = videoMedia.split(",").map((s: string) => s.trim());
              codec = parts[1] ?? "H264";
              resolution = parts[2] ?? "unknown";
            }
          }
          connected = true;
          break;
        }
      }
    }

    if (!connected) {
      throw new ApiError(
        "CAMERA_STREAM_TIMEOUT",
        "Camera did not respond within timeout. Check the URL/credentials.",
        504,
      );
    }

    // Grab a snapshot to confirm video is flowing
    let snapshotUrl: string | null = null;
    const snapRes = await fetch(
      `${go2rtcUrl}/api/frame.jpeg?src=${encodeURIComponent(testStreamName)}`,
      { signal: AbortSignal.timeout(3000) },
    ).catch(() => null);

    if (snapRes?.ok) {
      // Return as base64 data URL so the browser can display it directly
      const buf = Buffer.from(await snapRes.arrayBuffer());
      snapshotUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
    }

    return c.json(
      createSuccessResponse({
        connected: true,
        codec,
        resolution,
        snapshotUrl,
        protocol,
      }),
    );
  } finally {
    // Always clean up the test stream
    fetch(
      `${go2rtcUrl}/api/streams?src=${encodeURIComponent(testStreamName)}`,
      {
        method: "DELETE",
      },
    ).catch(() => {});
  }
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

  const go2rtcUrl = get("GO2RTC_URL") ?? "http://localhost:1984";
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

// POST /api/v1/cameras/discover - Discover cameras (USB + network scan)
// Accepts optional body: { subnet?: string, mode?: "all" | "usb" | "network" }
streamRoutes.post("/discover", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();
  const body = await c.req.json().catch(() => ({}));
  const { subnet, mode = "all" } = body as {
    subnet?: string;
    mode?: "all" | "usb" | "network";
  };

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

  const markAlreadyAdded = (
    cameras: import("@osp/shared").DiscoveredCamera[],
  ) =>
    cameras.map((cam) => {
      const isAdded =
        existingUris.has(cam.rtspUrl) ||
        (cam.possiblePaths ?? []).some((p) => existingUris.has(p));
      return { ...cam, alreadyAdded: isAdded };
    });

  let usb: import("@osp/shared").DiscoveredCamera[] = [];
  let network: import("@osp/shared").DiscoveredCamera[] = [];
  let scanDurationMs = 0;
  let subnetScanned: string | undefined;

  if (mode === "all") {
    const result = await discoveryService.discoverAll(subnet);
    usb = markAlreadyAdded(result.usb);
    network = markAlreadyAdded(result.network);
    scanDurationMs = result.scanDurationMs;
  } else if (mode === "usb") {
    const start = Date.now();
    usb = markAlreadyAdded(await discoveryService.discoverUSBCameras());
    scanDurationMs = Date.now() - start;
  } else {
    const result = await discoveryService.scanNetwork(subnet);
    network = markAlreadyAdded(result.cameras);
    scanDurationMs = result.scanDurationMs;
    subnetScanned = result.subnetScanned;
  }

  // Backward-compatible: include flat cameras array (usb + network combined)
  const cameras = [...usb, ...network];

  logger.info("Discovery scan completed", {
    tenantId,
    mode,
    usbFound: usb.length,
    networkFound: network.length,
    scanDurationMs,
  });

  return c.json(
    createSuccessResponse({
      cameras,
      usb,
      network,
      scanDurationMs,
      subnetScanned,
    }),
  );
});
