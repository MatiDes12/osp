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
import { normalizeEdgeTunnelUrl } from "../lib/tunnel-url.js";

const logger = createLogger("stream-routes");

export const streamRoutes = new Hono<Env>();

/** Returns the public go2rtc URL for the tenant's active edge agent, or null. */
async function resolveEdgeGo2rtcUrl(
  supabase: ReturnType<typeof getSupabase>,
  tenantId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("edge_agents")
      .select("go2rtc_url, agent_id, status")
      .eq("tenant_id", tenantId)
      .eq("status", "online")
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .single();
    const raw = (data as { go2rtc_url?: string } | null)?.go2rtc_url ?? null;
    const url = normalizeEdgeTunnelUrl(raw);
    logger.info("resolveEdgeGo2rtcUrl", {
      tenantId,
      agentId: (data as { agent_id?: string } | null)?.agent_id ?? "none",
      go2rtcUrl: url ?? "null",
      dbError: error ? String(error.message) : "none",
    });
    return url;
  } catch (err) {
    logger.warn("resolveEdgeGo2rtcUrl failed", { tenantId, error: String(err) });
    return null;
  }
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

  // If an edge agent has a public go2rtc URL (e.g. ngrok tunnel), point
  // the browser directly at it so WebRTC ICE candidates come from the real
  // local machine, not from the gateway proxy which would break media transport.
  const edgeGo2rtcUrl = await resolveEdgeGo2rtcUrl(supabase, tenantId);

  // Always proxy WebRTC signaling through the gateway — direct go2rtc URLs
  // cause CORS errors in the browser (tunnel doesn't add CORS headers and we
  // can't reliably configure go2rtc CORS from here).
  // The /whep endpoint on this gateway forwards the SDP to the correct go2rtc.
  const gatewayPublicUrl =
    get("GATEWAY_PUBLIC_URL") ??
    get("NEXT_PUBLIC_API_URL") ??
    "http://localhost:3000";
  const whepUrl = `${gatewayPublicUrl}/api/v1/cameras/${encodeURIComponent(cameraId)}/whep`;

  // Use the direct go2rtc URL for MJPEG — <img> tags are no-cors by default
  // so they don't need CORS headers, and Fly.io can't proxy infinite streaming
  // responses reliably. The gateway reads the current tunnel URL from DB on
  // every /stream request so the URL is always fresh.
  const fallbackHlsUrl = edgeGo2rtcUrl
    ? `${edgeGo2rtcUrl}/api/stream.mjpeg?src=${encodeURIComponent(cameraId)}`
    : `${get("GO2RTC_PUBLIC_URL") ?? get("GO2RTC_URL") ?? "http://localhost:1984"}/api/stream.mjpeg?src=${encodeURIComponent(cameraId)}`;

  // WebSocket URL for MSE fallback — direct tunnel connection (ngrok supports
  // WebSocket natively). The URL is read fresh from DB so it's always the
  // current tunnel hostname. No auth needed — go2rtc has no auth.
  const wsUrl = edgeGo2rtcUrl
    ? `${edgeGo2rtcUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:")}/api/ws?src=${encodeURIComponent(cameraId)}`
    : null;

  return c.json(
    createSuccessResponse({
      whepUrl,
      token,
      fallbackHlsUrl,
      wsUrl,
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
  let agentRow: { go2rtc_url?: string } | null = null;
  try {
    const { data } = await supabase
      .from("edge_agents")
      .select("go2rtc_url")
      .eq("tenant_id", tenantId)
      .eq("status", "online")
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .single();
    agentRow = data as { go2rtc_url?: string } | null;
  } catch { /* ignore */ }

  const go2rtcUrl =
    normalizeEdgeTunnelUrl(agentRow?.go2rtc_url ?? null) ||
    get("GO2RTC_URL") ||
    "http://localhost:1984";

  const whepUrl = `${go2rtcUrl}/api/webrtc?src=${encodeURIComponent(cameraId)}`;

  logger.info("Proxying WHEP offer to go2rtc", {
    cameraId,
    whepUrl,
    edgeAgentUrl: agentRow?.go2rtc_url ?? "none",
    usingFallback: !agentRow?.go2rtc_url,
  });

  // Check if the stream is registered in go2rtc. If not, register it now.
  // This handles the case where go2rtc was restarted and lost its dynamic streams.
  const ngrokHeaders = { "ngrok-skip-browser-warning": "true", "User-Agent": "osp-gateway" };

  const streamCheckRes = await fetch(
    `${go2rtcUrl}/api/streams?src=${encodeURIComponent(cameraId)}`,
    { signal: AbortSignal.timeout(3000), headers: ngrokHeaders },
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
          { signal: AbortSignal.timeout(2000), headers: ngrokHeaders },
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
    try {
      go2rtcResponse = await fetch(whepUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          "User-Agent": "osp-gateway",
        },
        body: JSON.stringify({ type: "offer", sdp: sdpOffer }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (fetchErr) {
      lastError = String(fetchErr);
      logger.warn("go2rtc WHEP fetch failed", {
        cameraId,
        attempt,
        error: lastError,
        whepUrl,
      });
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000));
      }
      continue;
    }

    if (go2rtcResponse.ok) break;

    lastError = await go2rtcResponse.text().catch(() => "unknown");
    logger.warn("go2rtc WHEP attempt failed", {
      cameraId,
      attempt,
      status: go2rtcResponse.status,
      body: lastError.slice(0, 500),
    });

    if (attempt < MAX_RETRIES) {
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

// GET /api/v1/cameras/:id/mjpeg - Proxy MJPEG stream from go2rtc
// go2rtc serves multipart/x-mixed-replace — we pipe it straight through so
// the browser <img> tag never needs to know the tunnel URL.
streamRoutes.get("/:id/mjpeg", requireAuth("viewer"), async (c) => {
  const cameraId = c.req.param("id");
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const { data: camera, error } = await supabase
    .from("cameras")
    .select("id, status")
    .eq("id", cameraId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !camera) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
  }

  const edgeGo2rtcUrl = await resolveEdgeGo2rtcUrl(supabase, tenantId);
  const go2rtcBase = edgeGo2rtcUrl ?? get("GO2RTC_URL") ?? "http://localhost:1984";
  const mjpegUrl = `${go2rtcBase}/api/stream.mjpeg?src=${encodeURIComponent(cameraId)}`;

  // Use a race so we fail fast if go2rtc is unreachable, but don't cut the
  // stream with a timeout once it starts flowing.
  let upstream: Response;
  try {
    upstream = await Promise.race<Response>([
      fetch(mjpegUrl, { headers: { "ngrok-skip-browser-warning": "true", "User-Agent": "osp-gateway" } }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("connect timeout")), 6000),
      ),
    ]);
  } catch (err) {
    logger.warn("MJPEG connect failed", { cameraId, error: String(err) });
    throw new ApiError("STREAM_ERROR", "Camera stream unavailable", 502);
  }

  if (!upstream.ok || !upstream.body) {
    throw new ApiError("STREAM_ERROR", "Camera stream unavailable", 502);
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "multipart/x-mixed-replace",
      "Cache-Control": "no-cache, no-store",
      "X-Accel-Buffering": "no", // disable proxy buffering (Nginx/Fly)
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
  logger.info("Snapshot: resolved edge URL", { cameraId, edgeUrl: edgeUrl ?? "none" });

  let imageBuffer: Buffer;
  if (edgeUrl) {
    const snapUrl = `${edgeUrl}/api/frame.jpeg?src=${encodeURIComponent(cameraId)}`;
    let resp: Response | null = null;
    try {
      resp = await fetch(snapUrl, {
        headers: {
          "ngrok-skip-browser-warning": "true",
          "User-Agent": "osp-gateway",
        },
        signal: AbortSignal.timeout(5000),
      });
    } catch (fetchErr) {
      logger.error("Snapshot: fetch threw", { cameraId, snapUrl, error: String(fetchErr) });
      throw new ApiError("SNAPSHOT_FAILED", `Edge fetch failed: ${String(fetchErr)}`, 502);
    }
    if (!resp.ok) {
      const ct = resp.headers.get("content-type") ?? "";
      const body = await resp.text().catch(() => "");
      const looksLikeNgrokHtml =
        ct.includes("text/html") ||
        body.trimStart().toLowerCase().startsWith("<!doctype");
      logger.error("Snapshot: non-OK response", {
        cameraId,
        snapUrl,
        status: resp.status,
        body: body.slice(0, 300),
        ...(looksLikeNgrokHtml && {
          hint: "ngrok interstitial or tunnel error — verify NGROK_AUTHTOKEN, osp-ngrok logs, and edge go2rtc_url",
        }),
      });
      throw new ApiError("SNAPSHOT_FAILED", `Edge returned ${resp.status}`, 502);
    }
    imageBuffer = Buffer.from(await resp.arrayBuffer());
  } else {
    logger.warn("Snapshot: no edge URL, falling back to local go2rtc", { cameraId });
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

  await supabase
    .from("cameras")
    .update({ status: "connecting", updated_at: new Date().toISOString() })
    .eq("id", cameraId)
    .eq("tenant_id", tenantId);

  if (edgeGo2rtcUrl) {
    // Edge agent mode: call go2rtc directly via tunnel — skip gRPC entirely
    const connectionUri = camera.connection_uri as string;
    try {
      const tunnelHeaders = { "ngrok-skip-browser-warning": "true", "User-Agent": "osp-gateway" };

      // Remove existing stream
      await fetch(
        `${edgeGo2rtcUrl}/api/streams?src=${encodeURIComponent(cameraId)}`,
        { method: "DELETE", signal: AbortSignal.timeout(5000), headers: tunnelHeaders },
      ).catch(() => {});

      // Re-add stream
      const addResp = await fetch(
        `${edgeGo2rtcUrl}/api/streams?name=${encodeURIComponent(cameraId)}&src=${encodeURIComponent(connectionUri)}`,
        { method: "PUT", signal: AbortSignal.timeout(5000), headers: tunnelHeaders },
      );

      if (addResp.ok) {
        await supabase
          .from("cameras")
          .update({ status: "online", updated_at: new Date().toISOString() })
          .eq("id", cameraId)
          .eq("tenant_id", tenantId);
      } else {
        const body = await addResp.text().catch(() => "");
        logger.warn("go2rtc rejected stream re-registration", { cameraId, status: addResp.status, body });
        await supabase
          .from("cameras")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", cameraId)
          .eq("tenant_id", tenantId);
      }
    } catch (err) {
      logger.warn("Failed to reconnect stream via edge agent", { cameraId, error: String(err) });
      await supabase
        .from("cameras")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("id", cameraId)
        .eq("tenant_id", tenantId);
    }
  } else {
    const streamService = getStreamService();
    try {
      await streamService.removeStream(cameraId);
      await streamService.addStream(cameraId, camera.connection_uri as string);
      await supabase
        .from("cameras")
        .update({ status: "online", updated_at: new Date().toISOString() })
        .eq("id", cameraId)
        .eq("tenant_id", tenantId);
    } catch (err) {
      logger.warn("Failed to re-add stream in go2rtc on reconnect", { cameraId, error: String(err) });
      await supabase
        .from("cameras")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("id", cameraId)
        .eq("tenant_id", tenantId);
    }
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

// GET /api/v1/cameras/:id/live.mp4 - Live fMP4 stream proxied through edge agent (HTTP, not WebSocket)
// This is the reliable path: browser → gateway (HTTP) → ngrok (HTTP) → go2rtc
// Unlike WebSocket proxying, HTTP streaming through ngrok free tier works.
streamRoutes.get("/:id/live.mp4", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");
  const supabase = getSupabase();

  const { data: camera, error } = await supabase
    .from("cameras")
    .select("id")
    .eq("id", cameraId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !camera) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
  }

  // Prefer edge agent's ngrok URL, fall back to local go2rtc
  const edgeUrl = await resolveEdgeGo2rtcUrl(supabase, tenantId);
  const go2rtcBase = edgeUrl ?? get("GO2RTC_URL") ?? "http://localhost:1984";
  const mp4Url = `${go2rtcBase}/api/stream.mp4?src=${encodeURIComponent(cameraId)}`;

  logger.info("Proxying live MP4 stream", { cameraId, target: mp4Url, viaEdge: !!edgeUrl });

  let upstream: Response;
  try {
    upstream = await Promise.race<Response>([
      fetch(mp4Url, {
        headers: {
          "ngrok-skip-browser-warning": "true",
          "User-Agent": "osp-gateway",
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("connect timeout")), 8000),
      ),
    ]);
  } catch (err) {
    logger.warn("Live MP4 connect failed", { cameraId, error: String(err) });
    throw new ApiError("STREAM_ERROR", "Camera stream unavailable", 502);
  }

  if (!upstream.ok || !upstream.body) {
    throw new ApiError("STREAM_ERROR", "Camera stream unavailable", 502);
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "video/mp4",
      "Cache-Control": "no-cache, no-store",
      "X-Accel-Buffering": "no",
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
