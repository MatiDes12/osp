"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
} from "react";
import type { OSPEvent } from "@osp/shared";
import { showNotification } from "@/lib/notifications";
import { shouldShowNotification } from "@/stores/notification-prefs";

interface UseEventStreamOptions {
  readonly cameraIds?: string[];
  readonly eventTypes?: string[];
  readonly minSeverity?: string;
}

interface UseEventStreamReturn {
  readonly events: readonly OSPEvent[];
  readonly connected: boolean;
  readonly error: string | null;
}

const MAX_EVENTS = 100;
const PING_INTERVAL_MS = 30_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

const SEVERITY_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function getWsUrl(): string {
  // Dedicated WebSocket server URL (separate port from the HTTP API)
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (wsUrl) {
    return wsUrl;
  }

  // Fallback: derive from API URL, replacing protocol and using WS port
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
  const isSecure =
    apiUrl.startsWith("https://") ||
    (typeof window !== "undefined" && window.location.protocol === "https:");
  const protocol = isSecure ? "wss:" : "ws:";

  // Extract hostname (without port) and use the dedicated WS port
  const hostWithPort = apiUrl.replace(/^https?:\/\//, "");
  const hostname = hostWithPort.split(":")[0] ?? "localhost";
  const wsPort = process.env.NEXT_PUBLIC_WS_PORT ?? "3002";
  return `${protocol}//${hostname}:${wsPort}`;
}

function passesFilter(
  event: OSPEvent,
  options: UseEventStreamOptions,
): boolean {
  if (
    options.cameraIds &&
    options.cameraIds.length > 0 &&
    !options.cameraIds.includes(event.cameraId)
  ) {
    return false;
  }
  if (
    options.eventTypes &&
    options.eventTypes.length > 0 &&
    !options.eventTypes.includes(event.type)
  ) {
    return false;
  }
  if (options.minSeverity) {
    const minLevel = SEVERITY_ORDER[options.minSeverity] ?? 0;
    const eventLevel = SEVERITY_ORDER[event.severity] ?? 0;
    if (eventLevel < minLevel) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// SINGLETON WEBSOCKET CONNECTION — shared across all useEventStream calls
// ============================================================================

interface GlobalState {
  events: readonly OSPEvent[];
  connected: boolean;
  error: string | null;
}

class EventStreamManager {
  private ws: WebSocket | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private authFailCount = 0;
  private static readonly MAX_AUTH_FAILURES = 3;
  private subscribers = new Set<() => void>();
  private state: GlobalState = {
    events: [],
    connected: false,
    error: null,
  };

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    // Start connection when first subscriber joins
    if (this.subscribers.size === 1 && !this.ws) {
      this.connect();
    }
    return () => {
      this.subscribers.delete(callback);
      // Keep connection alive even if no subscribers — prevents reconnect loops
      // The connection will be reused when new subscribers join
    };
  }

  getSnapshot(): GlobalState {
    return this.state;
  }

  private setState(newState: Partial<GlobalState>) {
    this.state = { ...this.state, ...newState };
    this.notifySubscribers();
  }

  private notifySubscribers() {
    this.subscribers.forEach((callback) => callback());
  }

  private clearTimers() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private scheduleReconnect() {
    this.clearTimers();
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      MAX_RECONNECT_DELAY_MS,
    );
  }

  private handleAuthFailedClose() {
    this.authFailCount++;
    if (this.authFailCount > EventStreamManager.MAX_AUTH_FAILURES) {
      this.setState({
        error: "Session expired. Please log in again.",
        connected: false,
      });
      return;
    }
    const refreshToken = localStorage.getItem("osp_refresh_token");
    if (!refreshToken) {
      this.setState({ error: "Not authenticated", connected: false });
      return;
    }
    const apiUrl =
      process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000";
    fetch(`${apiUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          json: {
            data?: { accessToken?: string; refreshToken?: string };
          } | null,
        ) => {
          if (json?.data?.accessToken) {
            localStorage.setItem("osp_access_token", json.data.accessToken);
            if (json.data.refreshToken) {
              localStorage.setItem("osp_refresh_token", json.data.refreshToken);
            }
            this.authFailCount = 0;
            this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
            this.scheduleReconnect();
          } else {
            this.setState({
              error: "Session expired. Please log in again.",
              connected: false,
            });
          }
        },
      )
      .catch(() => {
        this.setState({
          error: "Connection error. Please log in again.",
          connected: false,
        });
      });
  }

  private connect() {
    if (typeof window === "undefined") return;

    const token = localStorage.getItem("osp_access_token");
    if (!token) {
      this.setState({ error: "Not authenticated", connected: false });
      return;
    }

    this.clearTimers();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    const wsUrl = `${getWsUrl()}?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.setState({ connected: true, error: null });
        this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        this.authFailCount = 0;

        // Send subscribe message
        ws.send(JSON.stringify({ type: "subscribe" }));

        // Start ping/pong keepalive
        this.pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (messageEvent) => {
        try {
          const message = JSON.parse(
            typeof messageEvent.data === "string" ? messageEvent.data : "",
          ) as { type: string; data?: OSPEvent; [key: string]: unknown };

          if (message.type === "event" && message.data) {
            const event = message.data;
            const updated = [event, ...this.state.events];
            this.setState({
              events:
                updated.length > MAX_EVENTS
                  ? updated.slice(0, MAX_EVENTS)
                  : updated,
            });

            // Show notification respecting user preferences
            if (shouldShowNotification(event.severity)) {
              const typeLabel =
                event.type === "motion" ? "Motion detected" :
                event.type === "person" ? "Person detected" :
                event.type === "vehicle" ? "Vehicle detected" :
                event.type === "camera_offline" ? "Camera went offline" :
                event.type === "camera_online" ? "Camera came online" :
                `Alert: ${event.type}`;
              showNotification(typeLabel, {
                body: `${event.cameraName || "Camera"}${event.intensity ? ` · ${event.intensity}% intensity` : ""}`,
                tag: `event-${event.id}`,
                onClick: () => {
                  window.location.href = `/cameras/${event.cameraId}`;
                },
              });
            }
          }
          if (message.type === "error") {
            console.warn("[EventStreamManager] Server error:", message);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = (event) => {
        this.setState({ connected: false });
        this.clearTimers();
        // Code 4001 = server rejected due to invalid/expired token.
        // Attempt a token refresh before reconnecting; if it fails, stop retrying.
        if (event.code === 4001) {
          this.handleAuthFailedClose();
        } else {
          this.authFailCount = 0;
          this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        this.setState({ error: "WebSocket connection error" });
        // onclose will fire after onerror, triggering reconnect
      };
    } catch (err) {
      this.setState({
        error:
          err instanceof Error ? err.message : "Failed to create WebSocket",
      });
      this.scheduleReconnect();
    }
  }
}

// Global singleton instance
const globalEventStream = new EventStreamManager();

// ============================================================================
// HOOK — subscribes to the singleton connection
// ============================================================================

export function useEventStream(
  options: UseEventStreamOptions = {},
): UseEventStreamReturn {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Subscribe to the singleton global state
  const globalState = useSyncExternalStore(
    (callback) => globalEventStream.subscribe(callback),
    () => globalEventStream.getSnapshot(),
    () => globalEventStream.getSnapshot(),
  );

  // Filter events client-side based on options
  const filteredEvents = globalState.events.filter((event) =>
    passesFilter(event, optionsRef.current),
  );

  return {
    events: filteredEvents,
    connected: globalState.connected,
    error: globalState.error,
  };
}
