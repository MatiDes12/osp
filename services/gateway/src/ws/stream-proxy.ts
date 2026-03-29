import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { getSupabase } from "../lib/supabase.js";
import { createLogger } from "../lib/logger.js";
import { validateToken } from "./server.js";
import { normalizeEdgeTunnelUrl } from "../lib/tunnel-url.js";

const logger = createLogger("stream-proxy");

/**
 * Attaches a WebSocket upgrade handler to the HTTP server that proxies
 * go2rtc's /api/ws (MSE fMP4 stream) through the gateway.
 *
 * Path: /api/v1/cameras/:id/ws?token=JWT
 *
 * Why proxy instead of direct tunnel connection?
 * - Tunnel URLs rotate on every container restart (ngrok free tier)
 * - Gateway reads the current tunnel URL from DB on every connection
 * - Auth is handled via JWT query param
 * - Fly.io natively supports WebSocket proxying
 */
export function attachStreamProxy(httpServer: Server): void {
  const upgradeServer = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    logger.info("Upgrade request received", {
      rawUrl: req.url,
      path: url.pathname,
      params: Object.fromEntries(url.searchParams),
    });

    // Extract camera ID: try path first, then fall back to query param.
    // Fly.io's proxy can strip the path on WebSocket upgrades (req.url = "/"),
    // so the query param approach is the reliable one for production.
    const match = url.pathname.match(/^\/api\/v1\/cameras\/([^/]+)\/ws$/);
    const cameraId = match
      ? decodeURIComponent(match[1]!)
      : url.searchParams.get("cameraId");

    const token = url.searchParams.get("token");

    if (!cameraId || !token) {
      // Not a stream proxy request — ignore (let other handlers deal with it)
      if (!cameraId && !token) return;
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    // Run async auth + proxy setup
    void (async () => {
      try {
        const auth = await validateToken(token);
        if (!auth) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        const supabase = getSupabase();

        // Verify camera belongs to tenant
        const { data: camera } = await supabase
          .from("cameras")
          .select("id")
          .eq("id", cameraId)
          .eq("tenant_id", auth.tenantId)
          .single();

        if (!camera) {
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          socket.destroy();
          return;
        }

        // Resolve fresh go2rtc URL from edge agent
        let go2rtcWsUrl: string;
        try {
          const { data } = await supabase
            .from("edge_agents")
            .select("go2rtc_url")
            .eq("tenant_id", auth.tenantId)
            .eq("status", "online")
            .order("last_seen_at", { ascending: false })
            .limit(1)
            .single();

          const edgeUrl = normalizeEdgeTunnelUrl(
            (data as { go2rtc_url?: string } | null)?.go2rtc_url ?? null,
          );
          if (edgeUrl) {
            // Always use wss:// for external URLs — ngrok 307-redirects ws:// to wss://
            // and the Node.js ws library doesn't follow redirects.
            // The gateway runs in the cloud so TLS to ngrok works fine.
            go2rtcWsUrl = `${edgeUrl.replace(/^https?:/, "wss:")}/api/ws?src=${encodeURIComponent(cameraId)}`;
          } else {
            go2rtcWsUrl = `ws://localhost:1984/api/ws?src=${encodeURIComponent(cameraId)}`;
          }
        } catch {
          go2rtcWsUrl = `ws://localhost:1984/api/ws?src=${encodeURIComponent(cameraId)}`;
        }

        logger.info("Proxying stream WebSocket", {
          cameraId,
          target: go2rtcWsUrl,
        });

        // Connect to go2rtc upstream first.
        // Add ngrok-skip-browser-warning header to bypass ngrok free tier
        // interstitial page (only applies to HTTP connections).
        const upstream = new WebSocket(go2rtcWsUrl, {
          headers: {
            "ngrok-skip-browser-warning": "true",
            "User-Agent": "osp-gateway",
          },
        });

        // Buffer upstream messages that arrive before client WS is ready.
        // go2rtc sends the MIME type text message immediately on open —
        // without buffering, this first message is lost because
        // handleUpgrade's callback hasn't fired yet.
        const pendingMessages: { data: Buffer | ArrayBuffer | Buffer[]; isBinary: boolean }[] = [];
        let clientWs: InstanceType<typeof WebSocket> | null = null;

        upstream.on("message", (data, isBinary) => {
          if (clientWs && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data, { binary: isBinary });
          } else {
            pendingMessages.push({ data, isBinary });
          }
        });

        upstream.on("error", (err) => {
          logger.warn("Upstream WebSocket error", {
            cameraId,
            error: String(err),
          });
          if (clientWs) {
            try { clientWs.close(); } catch { /* ignore */ }
          }
          if (!socket.destroyed) {
            socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
            socket.destroy();
          }
        });

        upstream.on("close", () => {
          if (clientWs) {
            try { clientWs.close(); } catch { /* ignore */ }
          }
        });

        upstream.on("open", () => {
          logger.info("Upstream connected, accepting client upgrade", { cameraId });

          // Upstream connected — accept the client's WebSocket upgrade
          upgradeServer.handleUpgrade(req, socket, head, (ws) => {
            clientWs = ws;

            // Flush any messages that arrived while we were upgrading
            for (const msg of pendingMessages) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(msg.data, { binary: msg.isBinary });
              }
            }
            pendingMessages.length = 0;

            logger.info("Client connected, streaming", {
              cameraId,
              bufferedMessages: pendingMessages.length,
            });

            // Pipe client → upstream
            ws.on("message", (data, isBinary) => {
              if (upstream.readyState === WebSocket.OPEN) {
                upstream.send(data, { binary: isBinary });
              }
            });

            ws.on("close", () => {
              try { upstream.close(); } catch { /* ignore */ }
            });
            ws.on("error", () => {
              try { upstream.close(); } catch { /* ignore */ }
            });
          });
        });
      } catch (err) {
        logger.error("Stream proxy error", {
          cameraId,
          error: String(err),
        });
        if (!socket.destroyed) {
          socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
          socket.destroy();
        }
      }
    })();
  });

  logger.info("Stream WebSocket proxy attached to HTTP server");
}
