import { WebSocketServer, WebSocket as WsWebSocket } from "ws";
import type { IncomingMessage } from "http";
import { get } from "../lib/config.js";
import { getRedis } from "../lib/redis.js";
import { getSupabase } from "../lib/supabase.js";
import { createLogger } from "../lib/logger.js";
import type { OSPEvent, EventType, EventSeverity } from "@osp/shared";
import type Redis from "ioredis";

const logger = createLogger("ws-server");

const KEEPALIVE_INTERVAL_MS = 30_000;

const SEVERITY_ORDER: Record<EventSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

interface ClientFilters {
  readonly cameraIds?: ReadonlyArray<string>;
  readonly eventTypes?: ReadonlyArray<EventType>;
  readonly minSeverity?: EventSeverity;
}

interface ConnectedClient {
  readonly ws: WsWebSocket;
  readonly tenantId: string;
  readonly userId: string;
  filters: ClientFilters;
}

// Client tracking
const clients = new Map<string, ConnectedClient>();
const tenantClients = new Map<string, Set<string>>();

let wss: WebSocketServer | null = null;
let subscriber: Redis | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Validates a JWT token and returns tenant/user IDs.
 */
export async function validateToken(
  token: string,
): Promise<{ tenantId: string; userId: string } | null> {
  const supabase = getSupabase();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  const tenantId = user.user_metadata?.["tenant_id"] as string | undefined;
  if (!tenantId) {
    return null;
  }

  return { tenantId, userId: user.id };
}

/**
 * Checks whether an event passes a client's subscription filters.
 */
function matchesFilters(event: OSPEvent, filters: ClientFilters): boolean {
  if (filters.cameraIds && filters.cameraIds.length > 0) {
    if (!filters.cameraIds.includes(event.cameraId)) return false;
  }
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    if (!filters.eventTypes.includes(event.type)) return false;
  }
  if (filters.minSeverity) {
    const minLevel = SEVERITY_ORDER[filters.minSeverity] ?? 0;
    const eventLevel = SEVERITY_ORDER[event.severity] ?? 0;
    if (eventLevel < minLevel) return false;
  }
  return true;
}

/**
 * Parses filter subscriptions from a client message.
 */
function parseFilters(message: Record<string, unknown>): ClientFilters {
  const result: {
    cameraIds?: string[];
    eventTypes?: EventType[];
    minSeverity?: EventSeverity;
  } = {};

  if (Array.isArray(message["cameraIds"])) {
    result.cameraIds = (message["cameraIds"] as unknown[]).filter(
      (id): id is string => typeof id === "string",
    );
  }

  if (Array.isArray(message["eventTypes"])) {
    result.eventTypes = (message["eventTypes"] as unknown[]).filter(
      (t): t is EventType => typeof t === "string",
    );
  }

  if (
    typeof message["minSeverity"] === "string" &&
    message["minSeverity"] in SEVERITY_ORDER
  ) {
    result.minSeverity = message["minSeverity"] as EventSeverity;
  }

  return result;
}

function registerClient(clientId: string, client: ConnectedClient): void {
  clients.set(clientId, client);

  const existing = tenantClients.get(client.tenantId);
  if (existing) {
    existing.add(clientId);
  } else {
    tenantClients.set(client.tenantId, new Set([clientId]));
  }

  logger.info("Client registered", {
    clientId,
    tenantId: client.tenantId,
    totalClients: String(clients.size),
  });
}

function unregisterClient(clientId: string): void {
  const client = clients.get(clientId);
  if (!client) return;

  clients.delete(clientId);

  const tenantSet = tenantClients.get(client.tenantId);
  if (tenantSet) {
    tenantSet.delete(clientId);
    if (tenantSet.size === 0) {
      tenantClients.delete(client.tenantId);
    }
  }

  logger.info("Client unregistered", {
    clientId,
    tenantId: client.tenantId,
    totalClients: String(clients.size),
  });
}

/**
 * Broadcasts an event to all locally-connected clients for a tenant.
 */
function broadcastToTenant(tenantId: string, event: OSPEvent): void {
  const clientIds = tenantClients.get(tenantId);
  if (!clientIds) return;

  const payload = JSON.stringify({ type: "event", data: event });

  for (const clientId of clientIds) {
    const client = clients.get(clientId);
    if (!client) continue;

    if (!matchesFilters(event, client.filters)) continue;

    try {
      if (client.ws.readyState === WsWebSocket.OPEN) {
        client.ws.send(payload);
      } else {
        unregisterClient(clientId);
      }
    } catch {
      unregisterClient(clientId);
    }
  }
}

/**
 * Handles a Redis pub/sub message and routes it to matching WS clients.
 */
function handleRedisMessage(channel: string, message: string): void {
  const tenantId = channel.split(":")[1];
  if (!tenantId) {
    logger.warn("Received message on unexpected channel", { channel });
    return;
  }

  let event: OSPEvent;
  try {
    event = JSON.parse(message) as OSPEvent;
  } catch {
    logger.warn("Failed to parse event from Redis", { channel });
    return;
  }

  broadcastToTenant(tenantId, event);
}

/**
 * Handles a new WebSocket connection.
 */
async function handleConnection(
  ws: WsWebSocket,
  req: IncomingMessage,
): Promise<void> {
  const clientId = crypto.randomUUID();

  // Extract token from query string
  const url = new URL(req.url ?? "/", "http://localhost");
  const token = url.searchParams.get("token");

  if (!token) {
    ws.send(
      JSON.stringify({
        type: "error",
        code: "AUTH_MISSING",
        message: "Token query parameter required",
      }),
    );
    ws.close(4000, "Token required");
    return;
  }

  const auth = await validateToken(token);

  if (!auth) {
    ws.send(
      JSON.stringify({
        type: "error",
        code: "AUTH_INVALID",
        message: "Invalid or expired token",
      }),
    );
    ws.close(4001, "Authentication failed");
    return;
  }

  registerClient(clientId, {
    ws,
    tenantId: auth.tenantId,
    userId: auth.userId,
    filters: {},
  });

  ws.send(
    JSON.stringify({
      type: "connected",
      clientId,
      tenantId: auth.tenantId,
    }),
  );

  ws.on("message", (raw) => {
    const client = clients.get(clientId);
    if (!client) return;

    try {
      const message = JSON.parse(
        typeof raw === "string" ? raw : raw.toString("utf-8"),
      ) as { type: string; [key: string]: unknown };

      switch (message.type) {
        case "subscribe": {
          const filters = parseFilters(message);
          const updatedClient: ConnectedClient = { ...client, filters };
          clients.set(clientId, updatedClient);
          ws.send(
            JSON.stringify({
              type: "subscribed",
              tenantId: client.tenantId,
              filters,
            }),
          );
          break;
        }
        case "ping": {
          ws.send(JSON.stringify({ type: "pong" }));
          break;
        }
        default: {
          ws.send(
            JSON.stringify({
              type: "error",
              code: "UNKNOWN_MESSAGE_TYPE",
              message: `Unknown message type: ${message.type}`,
            }),
          );
        }
      }
    } catch {
      ws.send(
        JSON.stringify({
          type: "error",
          code: "INVALID_MESSAGE",
          message: "Failed to parse message as JSON",
        }),
      );
    }
  });

  ws.on("close", () => {
    unregisterClient(clientId);
  });

  ws.on("error", () => {
    unregisterClient(clientId);
  });
}

/**
 * Shared setup: Redis pub/sub subscription + keepalive timer.
 * Called by both attachEventServer and startWebSocketServer.
 */
function startSharedInfra(): void {
  // Redis subscription
  try {
    subscriber = getRedis().duplicate();

    subscriber.on(
      "pmessage",
      (_pattern: string, channel: string, message: string) => {
        handleRedisMessage(channel, message);
      },
    );

    subscriber.on("error", (err) => {
      logger.error("Redis subscriber error", { error: String(err) });
    });

    subscriber.psubscribe("events:*", (err) => {
      if (err) {
        logger.error("Failed to subscribe to events channels", {
          error: String(err),
        });
        return;
      }
      logger.info("Redis pub/sub subscription active for events:*");
    });
  } catch (err) {
    logger.error("Failed to start Redis subscription", {
      error: String(err),
    });
  }

  // Keepalive: ping all connected clients periodically
  keepaliveTimer = setInterval(() => {
    for (const [clientId, client] of clients) {
      try {
        if (client.ws.readyState === WsWebSocket.OPEN) {
          client.ws.send(JSON.stringify({ type: "ping" }));
        } else {
          unregisterClient(clientId);
        }
      } catch {
        unregisterClient(clientId);
      }
    }
  }, KEEPALIVE_INTERVAL_MS);
}

/**
 * Attaches the events WebSocket handler to an existing HTTP server on the
 * /ws/events path.  This lets fly.io proxy WS upgrades through its standard
 * HTTPS listener (port 443 → internal 3000) instead of requiring a second
 * exposed port (3002) that is blocked by the TLS/HTTP handler layer.
 */
export function attachEventServer(httpServer: import("node:http").Server): void {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname !== "/ws/events") {
      // Not for us — let other handlers (stream-proxy) deal with it
      return;
    }

    wss!.handleUpgrade(req, socket as import("net").Socket, head, (ws) => {
      handleConnection(ws, req).catch((err) => {
        logger.error("Error handling WS connection", { error: String(err) });
        ws.close(1011, "Internal error");
      });
    });
  });

  wss.on("error", (err) => {
    logger.error("WebSocket server error", { error: String(err) });
  });

  logger.info("Events WebSocket attached to HTTP server at /ws/events");

  startSharedInfra();
}

/**
 * @deprecated Use attachEventServer(httpServer) instead.
 * Kept for local dev scenarios where no HTTP server is available.
 */
export function startWebSocketServer(): void {
  const port = Number.parseInt(get("WS_PORT") ?? "3002", 10);

  wss = new WebSocketServer({ port });

  wss.on("connection", (ws, req) => {
    handleConnection(ws, req).catch((err) => {
      logger.error("Error handling WS connection", { error: String(err) });
      ws.close(1011, "Internal error");
    });
  });

  wss.on("error", (err) => {
    logger.error("WebSocket server error", { error: String(err) });
  });

  logger.info("WebSocket server started (standalone)", { port: String(port) });

  startSharedInfra();
}

/**
 * Stops the WebSocket server and cleans up all resources.
 */
export function stopWebSocketServer(): void {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }

  if (subscriber) {
    subscriber.punsubscribe("events:*").catch(() => {});
    subscriber.disconnect();
    subscriber = null;
  }

  if (wss) {
    // Close all client connections
    for (const [clientId] of clients) {
      const client = clients.get(clientId);
      if (client) {
        try {
          client.ws.close(1001, "Server shutting down");
        } catch {
          // ignore close errors during shutdown
        }
      }
    }
    clients.clear();
    tenantClients.clear();

    wss.close();
    wss = null;
  }

  logger.info("WebSocket server stopped");
}

/**
 * Returns the count of currently connected WebSocket clients.
 */
export function getConnectedClientCount(): number {
  return clients.size;
}
