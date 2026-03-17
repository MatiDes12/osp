import type Redis from "ioredis";
import { getSupabase } from "../lib/supabase.js";
import { getRedis } from "../lib/redis.js";
import { createLogger } from "../lib/logger.js";
import type { OSPEvent, EventType, EventSeverity } from "@osp/shared";

const logger = createLogger("ws-events");

const SEVERITY_ORDER: Record<EventSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const KEEPALIVE_INTERVAL_MS = 30_000;

interface ClientFilters {
  readonly cameraIds?: ReadonlyArray<string>;
  readonly eventTypes?: ReadonlyArray<EventType>;
  readonly minSeverity?: EventSeverity;
}

interface ConnectedClient {
  readonly ws: WebSocket;
  readonly tenantId: string;
  readonly userId: string;
  filters: ClientFilters;
}

// Client tracking: Map<clientId, ConnectedClient>
const clients = new Map<string, ConnectedClient>();

// Tenant-to-client index for efficient broadcasting
const tenantClients = new Map<string, Set<string>>();

// Keepalive timer references: Map<clientId, timer>
const keepaliveTimers = new Map<string, ReturnType<typeof setInterval>>();

// Redis subscriber instance (separate connection from the main one)
let subscriber: Redis | null = null;
let subscriptionActive = false;

/**
 * Validates a JWT token and returns the user's tenant and user IDs.
 * Returns null if the token is invalid.
 */
async function validateToken(
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
 * Starts the Redis pub/sub subscription for cross-instance event distribution.
 * Subscribes to "events:*" channels using PSUBSCRIBE.
 */
export function startRedisSubscription(): void {
  if (subscriptionActive) return;

  try {
    // Create a dedicated subscriber connection (ioredis requires separate connections for pub/sub)
    subscriber = getRedis().duplicate();

    subscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
      handleRedisMessage(channel, message);
    });

    subscriber.on("error", (err) => {
      logger.error("Redis subscriber error", { error: String(err) });
    });

    subscriber.psubscribe("events:*", (err) => {
      if (err) {
        logger.error("Failed to subscribe to events channels", { error: String(err) });
        return;
      }
      subscriptionActive = true;
      logger.info("Redis pub/sub subscription active for events:*");
    });
  } catch (err) {
    logger.error("Failed to start Redis subscription", { error: String(err) });
  }
}

/**
 * Stops the Redis pub/sub subscription and cleans up.
 */
export function stopRedisSubscription(): void {
  if (subscriber) {
    subscriber.punsubscribe("events:*").catch(() => {});
    subscriber.disconnect();
    subscriber = null;
  }
  subscriptionActive = false;
  logger.info("Redis pub/sub subscription stopped");
}

/**
 * Handles a message received from Redis pub/sub.
 * Channel format: "events:{tenantId}"
 * Routes the event to matching WebSocket clients.
 */
export function handleRedisMessage(channel: string, message: string): void {
  // Extract tenantId from channel "events:{tenantId}"
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
 * Handles a new WebSocket connection for real-time event subscriptions.
 * Expects a JWT token as a query parameter for authentication.
 */
export function handleWebSocketUpgrade(
  ws: WebSocket,
  token: string,
): void {
  const clientId = crypto.randomUUID();

  ws.addEventListener("open", async () => {
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

    startKeepalive(clientId, ws);
  });

  ws.addEventListener("message", (messageEvent) => {
    const client = clients.get(clientId);
    if (!client) return;

    try {
      const message = JSON.parse(
        typeof messageEvent.data === "string"
          ? messageEvent.data
          : "",
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

  ws.addEventListener("close", () => {
    unregisterClient(clientId);
  });

  ws.addEventListener("error", () => {
    unregisterClient(clientId);
  });
}

/**
 * Broadcasts an event to all connected clients belonging to the given tenant.
 * Also publishes to Redis for cross-instance distribution.
 */
export function broadcastEvent(tenantId: string, event: OSPEvent): void {
  // Publish to Redis so other gateway instances can distribute
  try {
    const redis = getRedis();
    redis.publish(`events:${tenantId}`, JSON.stringify(event)).catch((err) => {
      logger.error("Failed to publish event to Redis", { tenantId, error: String(err) });
    });
  } catch (err) {
    logger.error("Failed to get Redis for event publish", { tenantId, error: String(err) });
  }

  // Also broadcast locally (for clients connected to this instance)
  broadcastToTenant(tenantId, event);
}

/**
 * Sends an event to locally connected clients for a specific tenant.
 * Applies client-side filters before forwarding.
 */
function broadcastToTenant(tenantId: string, event: OSPEvent): void {
  const clientIds = tenantClients.get(tenantId);
  if (!clientIds) return;

  const payload = JSON.stringify({
    type: "event",
    data: event,
  });

  for (const clientId of clientIds) {
    const client = clients.get(clientId);
    if (!client) continue;

    if (!matchesFilters(event, client.filters)) continue;

    try {
      if (client.ws.readyState === WebSocket.OPEN) {
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
 * Checks whether an event matches the client's subscription filters.
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
 * Parses filter subscriptions from a WebSocket "subscribe" message.
 */
function parseFilters(message: Record<string, unknown>): ClientFilters {
  const filters: ClientFilters = {};
  const result: { cameraIds?: string[]; eventTypes?: EventType[]; minSeverity?: EventSeverity } = {};

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

  if (typeof message["minSeverity"] === "string" && message["minSeverity"] in SEVERITY_ORDER) {
    result.minSeverity = message["minSeverity"] as EventSeverity;
  }

  return { ...filters, ...result };
}

function registerClient(clientId: string, client: ConnectedClient): void {
  clients.set(clientId, client);

  const existing = tenantClients.get(client.tenantId);
  if (existing) {
    existing.add(clientId);
  } else {
    tenantClients.set(client.tenantId, new Set([clientId]));
  }
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

  stopKeepalive(clientId);
}

function startKeepalive(clientId: string, ws: WebSocket): void {
  const timer = setInterval(() => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      } else {
        unregisterClient(clientId);
      }
    } catch {
      unregisterClient(clientId);
    }
  }, KEEPALIVE_INTERVAL_MS);

  keepaliveTimers.set(clientId, timer);
}

function stopKeepalive(clientId: string): void {
  const timer = keepaliveTimers.get(clientId);
  if (timer) {
    clearInterval(timer);
    keepaliveTimers.delete(clientId);
  }
}

/**
 * Returns the count of currently connected clients.
 * Useful for health checks and monitoring.
 */
export function getConnectedClientCount(): number {
  return clients.size;
}

/**
 * Returns the count of connected clients for a specific tenant.
 */
export function getTenantClientCount(tenantId: string): number {
  return tenantClients.get(tenantId)?.size ?? 0;
}
