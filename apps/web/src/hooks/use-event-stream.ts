"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { OSPEvent } from "@osp/shared";

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

export function useEventStream(
  options: UseEventStreamOptions = {},
): UseEventStreamReturn {
  const [events, setEvents] = useState<readonly OSPEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS);
  const mountedRef = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const clearTimers = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(
    (connect: () => void) => {
      if (!mountedRef.current) return;
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(
        delay * 2,
        MAX_RECONNECT_DELAY_MS,
      );
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connect();
        }
      }, delay);
    },
    [],
  );

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const token = localStorage.getItem("osp_access_token");
    if (!token) {
      setError("Not authenticated");
      return;
    }

    clearTimers();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsUrl = `${getWsUrl()}?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        setConnected(true);
        setError(null);
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;

        // Send subscribe message
        ws.send(JSON.stringify({ type: "subscribe" }));

        // Start ping/pong keepalive
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (messageEvent) => {
        if (!mountedRef.current) return;
        try {
          const message = JSON.parse(
            typeof messageEvent.data === "string" ? messageEvent.data : "",
          ) as { type: string; data?: OSPEvent; [key: string]: unknown };

          if (message.type === "event" && message.data) {
            const event = message.data;
            if (passesFilter(event, optionsRef.current)) {
              setEvents((prev) => {
                const updated = [event, ...prev];
                return updated.length > MAX_EVENTS
                  ? updated.slice(0, MAX_EVENTS)
                  : updated;
              });
            }
          }
          // pong, connected, subscribed, and error messages are handled
          // silently; errors from the server are logged but don't break state
          if (message.type === "error") {
            console.warn("[useEventStream] Server error:", message);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        clearTimers();
        scheduleReconnect(connect);
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setError("WebSocket connection error");
        // onclose will fire after onerror, triggering reconnect
      };
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create WebSocket",
      );
      scheduleReconnect(connect);
    }
  }, [clearTimers, scheduleReconnect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { events, connected, error };
}
