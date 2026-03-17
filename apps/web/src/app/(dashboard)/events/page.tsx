"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { OSPEvent, EventType, EventSeverity, Camera, ApiResponse } from "@osp/shared";

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

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const EVENT_TYPES: readonly EventType[] = [
  "motion",
  "person",
  "vehicle",
  "animal",
  "camera_offline",
  "camera_online",
  "tampering",
  "audio",
  "custom",
];

const SEVERITY_LEVELS: readonly EventSeverity[] = ["low", "medium", "high", "critical"];

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-500/10 text-blue-400",
  medium: "bg-yellow-500/10 text-yellow-400",
  high: "bg-orange-500/10 text-orange-400",
  critical: "bg-red-500/10 text-red-400",
};

export default function EventsPage() {
  const [events, setEvents] = useState<readonly OSPEvent[]>([]);
  const [cameras, setCameras] = useState<readonly Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [cameraFilter, setCameraFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cameraFilter) params.set("cameraId", cameraFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (severityFilter) params.set("severity", severityFilter);
      if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
      if (dateTo) params.set("to", new Date(dateTo).toISOString());
      params.set("limit", "50");

      const [eventsRes, camerasRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/events?${params.toString()}`, {
          headers: getAuthHeaders(),
        }),
        fetch(`${API_URL}/api/v1/cameras`, {
          headers: getAuthHeaders(),
        }),
      ]);

      const eventsJson: ApiResponse<OSPEvent[]> = await eventsRes.json();
      if (eventsJson.success && eventsJson.data) {
        setEvents(eventsJson.data);
      } else {
        setError(eventsJson.error?.message ?? "Failed to load events");
      }

      const camerasJson: ApiResponse<Camera[]> = await camerasRes.json();
      if (camerasJson.success && camerasJson.data) {
        setCameras(camerasJson.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [cameraFilter, typeFilter, severityFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAcknowledge = useCallback(
    async (eventId: string) => {
      try {
        const response = await fetch(`${API_URL}/api/v1/events/${eventId}/acknowledge`, {
          method: "POST",
          headers: getAuthHeaders(),
        });
        const json: ApiResponse<void> = await response.json();
        if (json.success) {
          setEvents((prev) =>
            prev.map((e) =>
              e.id === eventId
                ? { ...e, acknowledged: true, acknowledgedAt: new Date().toISOString() }
                : e,
            ),
          );
        }
      } catch {
        // Silently fail for ack - user can retry
      }
    },
    [],
  );

  const cameraNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cam of cameras) {
      map.set(cam.id, cam.name);
    }
    return map;
  }, [cameras]);

  return (
    <div>
      {/* Header */}
      <h1 className="text-2xl font-bold mb-6">Events</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={cameraFilter}
          onChange={(e) => setCameraFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        >
          <option value="">All Cameras</option>
          {cameras.map((cam) => (
            <option key={cam.id} value={cam.id}>
              {cam.name}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        >
          <option value="">All Types</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        >
          <option value="">All Severities</option>
          {SEVERITY_LEVELS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          placeholder="From"
        />

        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          placeholder="To"
        />

        {(cameraFilter || typeFilter || severityFilter || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setCameraFilter("");
              setTypeFilter("");
              setSeverityFilter("");
              setDateFrom("");
              setDateTo("");
            }}
            className="px-3 py-2 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-[var(--color-muted)]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]" />
          <span className="ml-3 text-sm">Loading events...</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 p-4 text-sm text-[var(--color-error)]">
          <p className="font-medium mb-1">Failed to load events</p>
          <p className="text-xs opacity-80">{error}</p>
          <button onClick={fetchData} className="mt-2 text-xs underline hover:no-underline">
            Try again
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
          {events.length === 0 ? (
            <div className="py-12 text-center text-[var(--color-muted)]">
              <p className="text-sm">No events found matching your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Camera</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {events.map((event) => (
                    <tr key={event.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-[var(--color-muted)] whitespace-nowrap">
                        {formatTimestamp(event.detectedAt)}
                      </td>
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {event.cameraName ?? cameraNameMap.get(event.cameraId) ?? "Unknown"}
                      </td>
                      <td className="px-4 py-3 capitalize whitespace-nowrap">
                        {event.type.replace("_", " ")}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                            SEVERITY_COLORS[event.severity] ?? "bg-gray-500/10 text-gray-400"
                          }`}
                        >
                          {event.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {event.acknowledged ? (
                          <span className="text-xs text-[var(--color-success)]">Acknowledged</span>
                        ) : (
                          <span className="text-xs text-[var(--color-warning)]">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!event.acknowledged && (
                          <button
                            onClick={() => handleAcknowledge(event.id)}
                            className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-primary)]/50 transition-colors"
                          >
                            Acknowledge
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
