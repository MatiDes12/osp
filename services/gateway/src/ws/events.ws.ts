import { getSupabase } from "../lib/supabase.js";
import type { OSPEvent } from "@osp/shared";

interface ConnectedClient {
  ws: WebSocket;
  tenantId: string;
  userId: string;
}

const clients = new Map<string, ConnectedClient>();

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

    clients.set(clientId, {
      ws,
      tenantId: auth.tenantId,
      userId: auth.userId,
    });

    ws.send(
      JSON.stringify({
        type: "connected",
        clientId,
        tenantId: auth.tenantId,
      }),
    );
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
          // Client is subscribing to events for their tenant.
          // In the current implementation all connected clients receive
          // events for their tenant automatically. This message serves
          // as acknowledgment.
          ws.send(
            JSON.stringify({
              type: "subscribed",
              tenantId: client.tenantId,
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
    clients.delete(clientId);
  });

  ws.addEventListener("error", () => {
    clients.delete(clientId);
  });
}

/**
 * Broadcasts an event to all connected clients belonging to the given tenant.
 * This is a placeholder that will later connect to Redis pub/sub for
 * cross-instance event distribution.
 */
export function broadcastEvent(tenantId: string, event: OSPEvent): void {
  const message = JSON.stringify({
    type: "event",
    data: event,
  });

  for (const [clientId, client] of clients) {
    if (client.tenantId !== tenantId) continue;

    try {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      } else {
        clients.delete(clientId);
      }
    } catch {
      clients.delete(clientId);
    }
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
  let count = 0;
  for (const client of clients.values()) {
    if (client.tenantId === tenantId) {
      count++;
    }
  }
  return count;
}
