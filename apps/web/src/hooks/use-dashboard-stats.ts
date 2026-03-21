"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useEventStream } from "./use-event-stream";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("osp_access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export interface DashboardStats {
  totalCameras: number;
  camerasOnline: number;
  eventsToday: number;
  unacknowledgedAlerts: number;
  activeRecordings: number;
  lastUpdated: string;
}

interface ChangedFields {
  totalCameras: boolean;
  camerasOnline: boolean;
  eventsToday: boolean;
  unacknowledgedAlerts: boolean;
  activeRecordings: boolean;
}

const EMPTY_CHANGED: ChangedFields = {
  totalCameras: false,
  camerasOnline: false,
  eventsToday: false,
  unacknowledgedAlerts: false,
  activeRecordings: false,
};

interface UseDashboardStatsReturn {
  readonly stats: DashboardStats;
  readonly loading: boolean;
  readonly changed: ChangedFields;
}

export function useDashboardStats(): UseDashboardStatsReturn {
  const [stats, setStats] = useState<DashboardStats>({
    totalCameras: 0,
    camerasOnline: 0,
    eventsToday: 0,
    unacknowledgedAlerts: 0,
    activeRecordings: 0,
    lastUpdated: new Date().toISOString(),
  });
  const [loading, setLoading] = useState(true);
  const [changed, setChanged] = useState<ChangedFields>(EMPTY_CHANGED);
  const changedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to all WebSocket events
  const { events } = useEventStream();

  // Flash animation: clear changed flags after a short delay
  const flashChanged = useCallback((fields: Partial<ChangedFields>) => {
    setChanged((prev) => ({ ...prev, ...fields }));
    if (changedTimerRef.current) {
      clearTimeout(changedTimerRef.current);
    }
    changedTimerRef.current = setTimeout(() => {
      setChanged(EMPTY_CHANGED);
    }, 1500);
  }, []);

  // Fetch initial stats from API
  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [camerasRes, eventSummaryRes, recordingsRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/cameras`, { headers: getAuthHeaders() }).catch(
          () => null,
        ),
        fetch(`${API_URL}/api/v1/events/summary`, {
          headers: getAuthHeaders(),
        }).catch(() => null),
        fetch(`${API_URL}/api/v1/recordings?status=recording&limit=50`, {
          headers: getAuthHeaders(),
        }).catch(() => null),
      ]);

      let totalCameras = 0;
      let camerasOnline = 0;
      let eventsToday = 0;
      let unacknowledgedAlerts = 0;
      let activeRecordings = 0;

      if (camerasRes) {
        try {
          const json = await camerasRes.json();
          if (json.success && Array.isArray(json.data)) {
            totalCameras = json.data.length;
            camerasOnline = json.data.filter(
              (c: Record<string, unknown>) =>
                (c.status ?? c.status) === "online",
            ).length;
          }
        } catch {
          // Non-critical
        }
      }

      if (eventSummaryRes) {
        try {
          const json = await eventSummaryRes.json();
          if (json.success && json.data) {
            eventsToday = json.data.total ?? 0;
            unacknowledgedAlerts = json.data.unacknowledged ?? 0;
          }
        } catch {
          // Non-critical
        }
      }

      if (recordingsRes) {
        try {
          const json = await recordingsRes.json();
          if (json.success && json.meta) {
            activeRecordings = json.meta.total ?? 0;
          } else if (json.success && Array.isArray(json.data)) {
            activeRecordings = json.data.length;
          }
        } catch {
          // Non-critical
        }
      }

      setStats({
        totalCameras,
        camerasOnline,
        eventsToday,
        unacknowledgedAlerts,
        activeRecordings,
        lastUpdated: new Date().toISOString(),
      });
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // React to new WebSocket events to update stats in real-time
  const prevEventsLengthRef = useRef(0);

  useEffect(() => {
    if (events.length === 0 || events.length <= prevEventsLengthRef.current) {
      prevEventsLengthRef.current = events.length;
      return;
    }

    // Process only new events (events are prepended, so new ones are at the start)
    const newCount = events.length - prevEventsLengthRef.current;
    const newEvents = events.slice(0, newCount);
    prevEventsLengthRef.current = events.length;

    setStats((prev) => {
      let camerasOnline = prev.camerasOnline;
      let eventsToday = prev.eventsToday;
      let activeRecordings = prev.activeRecordings;
      let unacknowledgedAlerts = prev.unacknowledgedAlerts;
      const changedUpdate: Partial<ChangedFields> = {};

      for (const event of newEvents) {
        // All events increment today's count
        eventsToday += 1;
        changedUpdate.eventsToday = true;

        // Unacknowledged alerts
        if (!event.acknowledged) {
          unacknowledgedAlerts += 1;
          changedUpdate.unacknowledgedAlerts = true;
        }

        // Camera online/offline changes
        if (event.type === "camera_online") {
          camerasOnline = Math.min(camerasOnline + 1, prev.totalCameras);
          changedUpdate.camerasOnline = true;
        } else if (event.type === "camera_offline") {
          camerasOnline = Math.max(camerasOnline - 1, 0);
          changedUpdate.camerasOnline = true;
        }
      }

      flashChanged(changedUpdate);

      return {
        ...prev,
        camerasOnline,
        eventsToday,
        activeRecordings,
        unacknowledgedAlerts,
        lastUpdated: new Date().toISOString(),
      };
    });
  }, [events, flashChanged]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (changedTimerRef.current) {
        clearTimeout(changedTimerRef.current);
      }
    };
  }, []);

  return { stats, loading, changed };
}
