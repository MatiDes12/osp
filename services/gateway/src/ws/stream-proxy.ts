import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { getSupabase } from "../lib/supabase.js";
import { createLogger } from "../lib/logger.js";
import { validateToken } from "./server.js";

const logger = createLogger("stream-proxy");

/**
 * Attaches a WebSocket upgrade handler to the HTTP server that proxies
 * go2rtc's /api/ws (MSE fMP4 stream) through the gateway.
 *
 * Path: /api/v1/cameras/:id/ws?token=JWT
 *
 * Why proxy instead of direct tunnel connection?
 * - Cloudflare quick tunnel URLs rotate on every container restart
 * - Gateway reads the current tunnel URL from DB on every connection
 * - Auth is handled via JWT query param
 * - Fly.io natively supports WebSocket proxying
 */
export function attachStreamProxy(httpServer: Server): void {
  const upgradeServer = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/api\/v1\/cameras\/([^/]+)\/ws$/);
    if (!match) return; // not our path — ignore

    const cameraId = decodeURIComponent(match[1]!);
    const token = url.searchParams.get("token");

    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
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

          const edgeUrl = (data as { go2rtc_url?: string } | null)
            ?.go2rtc_url;
          if (edgeUrl) {
            go2rtcWsUrl = `${edgeUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:")}/api/ws?src=${encodeURIComponent(cameraId)}`;
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

        // Connect to go2rtc upstream first
        const upstream = new WebSocket(go2rtcWsUrl);

        upstream.on("error", (err) => {
          logger.warn("Upstream WebSocket error", {
            cameraId,
            error: String(err),
          });
          if (!socket.destroyed) {
            socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
            socket.destroy();
          }
        });

        upstream.on("open", () => {
          // Upstream connected — accept the client's WebSocket upgrade
          upgradeServer.handleUpgrade(req, socket, head, (clientWs) => {
            // Pipe upstream → client (go2rtc sends MIME text + binary fMP4)
            upstream.on("message", (data, isBinary) => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(data, { binary: isBinary });
              }
            });

            // Pipe client → upstream
            clientWs.on("message", (data, isBinary) => {
              if (upstream.readyState === WebSocket.OPEN) {
                upstream.send(data, { binary: isBinary });
              }
            });

            upstream.on("close", () => clientWs.close());
            clientWs.on("close", () => upstream.close());

            upstream.on("error", () => {
              try {
                clientWs.close();
              } catch {
                /* ignore */
              }
            });
            clientWs.on("error", () => {
              try {
                upstream.close();
              } catch {
                /* ignore */
              }
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
