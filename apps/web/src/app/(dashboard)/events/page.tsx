"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Filter,
  Bell,
  CheckCircle2,
  Download,
  Eye,
  X,
} from "lucide-react";
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

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

type DatePreset = "today" | "yesterday" | "7d" | "30d" | "custom";

interface Filters {
  readonly cameraIds: ReadonlySet<string>;
  readonly eventTypes: ReadonlySet<EventType>;
  readonly severities: ReadonlySet<EventSeverity>;
  readonly datePreset: DatePreset;
  readonly dateFrom: string;
  readonly dateTo: string;
}

const INITIAL_FILTERS: Filters = {
  cameraIds: new Set(),
  eventTypes: new Set(),
  severities: new Set(),
  datePreset: "today",
  dateFrom: "",
  dateTo: "",
};

const EVENT_TYPE_CONFIG: readonly {
  type: EventType;
  label: string;
  dotColor: string;
}[] = [
  { type: "motion", label: "Motion", dotColor: "bg-green-400" },
  { type: "person", label: "Person", dotColor: "bg-purple-400" },
  { type: "vehicle", label: "Vehicle", dotColor: "bg-purple-400" },
  { type: "animal", label: "Animal", dotColor: "bg-amber-400" },
  { type: "camera_offline", label: "Camera Offline", dotColor: "bg-red-400" },
  { type: "camera_online", label: "Camera Online", dotColor: "bg-green-400" },
  { type: "tampering", label: "Tampering", dotColor: "bg-red-400" },
  { type: "audio", label: "Audio", dotColor: "bg-blue-400" },
  { type: "custom", label: "Custom", dotColor: "bg-zinc-400" },
];

const SEVERITY_CONFIG: readonly {
  level: EventSeverity;
  label: string;
  color: string;
  borderColor: string;
  badgeBg: string;
}[] = [
  { level: "critical", label: "Critical", color: "text-red-400", borderColor: "border-l-red-500", badgeBg: "bg-red-500/10 text-red-400" },
  { level: "high", label: "Warning", color: "text-amber-400", borderColor: "border-l-amber-500", badgeBg: "bg-amber-500/10 text-amber-400" },
  { level: "medium", label: "Info", color: "text-blue-400", borderColor: "border-l-blue-500", badgeBg: "bg-blue-500/10 text-blue-400" },
  { level: "low", label: "Low", color: "text-zinc-400", borderColor: "border-l-zinc-500", badgeBg: "bg-zinc-500/10 text-zinc-400" },
];

function getSeverityBorderClass(severity: EventSeverity): string {
  const config = SEVERITY_CONFIG.find((s) => s.level === severity);
  return config?.borderColor ?? "border-l-zinc-500";
}

function getSeverityBadgeClass(severity: EventSeverity): string {
  const config = SEVERITY_CONFIG.find((s) => s.level === severity);
  return config?.badgeBg ?? "bg-zinc-500/10 text-zinc-400";
}

function getEventBorderColor(event: OSPEvent): string {
  if (event.type === "person" || event.type === "vehicle" || event.type === "animal") {
    return "border-l-purple-500";
  }
  return getSeverityBorderClass(event.severity);
}

function getDateRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { from: today.toISOString(), to: now.toISOString() };
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: yesterday.toISOString(), to: today.toISOString() };
    }
    case "7d": {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { from: weekAgo.toISOString(), to: now.toISOString() };
    }
    case "30d": {
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return { from: monthAgo.toISOString(), to: now.toISOString() };
    }
    default:
      return { from: "", to: "" };
  }
}

function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.cameraIds.size > 0 ||
    filters.eventTypes.size > 0 ||
    filters.severities.size > 0 ||
    filters.datePreset !== "today" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== ""
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<readonly OSPEvent[]>([]);
  const [cameras, setCameras] = useState<readonly Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<OSPEvent | null>(null);

  const updateFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const toggleSetItem = useCallback(
    <T extends string>(set: ReadonlySet<T>, item: T): ReadonlySet<T> => {
      const next = new Set(set);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      return next;
    },
    [],
  );

  const clearAllFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();

      if (filters.cameraIds.size === 1) {
        params.set("cameraId", [...filters.cameraIds][0] ?? "");
      }
      if (filters.eventTypes.size === 1) {
        params.set("type", [...filters.eventTypes][0] ?? "");
      }
      if (filters.severities.size === 1) {
        params.set("severity", [...filters.severities][0] ?? "");
      }

      if (filters.datePreset !== "custom") {
        const range = getDateRange(filters.datePreset);
        if (range.from) params.set("from", range.from);
        if (range.to) params.set("to", range.to);
      } else {
        if (filters.dateFrom) params.set("from", new Date(filters.dateFrom).toISOString());
        if (filters.dateTo) params.set("to", new Date(filters.dateTo).toISOString());
      }

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
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAcknowledge = useCallback(async (eventId: string) => {
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
      // User can retry
    }
  }, []);

  const handleBulkAcknowledge = useCallback(async () => {
    const ids = [...selectedIds];
    await Promise.allSettled(
      ids.map((id) =>
        fetch(`${API_URL}/api/v1/events/${id}/acknowledge`, {
          method: "POST",
          headers: getAuthHeaders(),
        }),
      ),
    );
    setEvents((prev) =>
      prev.map((e) =>
        selectedIds.has(e.id)
          ? { ...e, acknowledged: true, acknowledgedAt: new Date().toISOString() }
          : e,
      ),
    );
    setSelectedIds(new Set());
  }, [selectedIds]);

  const toggleSelectEvent = useCallback((eventId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  const cameraNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cam of cameras) {
      map.set(cam.id, cam.name);
    }
    return map;
  }, [cameras]);

  // Client-side filtering for multi-select
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filters.cameraIds.size > 1 && !filters.cameraIds.has(event.cameraId)) return false;
      if (filters.eventTypes.size > 1 && !filters.eventTypes.has(event.type)) return false;
      if (filters.severities.size > 1 && !filters.severities.has(event.severity)) return false;
      return true;
    });
  }, [events, filters.cameraIds, filters.eventTypes, filters.severities]);

  return (
    <div className="flex h-[calc(100vh-3rem)] -m-6">
      {/* Filter sidebar */}
      <aside className="w-60 shrink-0 bg-zinc-900 border-r border-zinc-800 p-4 overflow-y-auto hidden md:block">
        <div className="flex items-center gap-2 mb-5">
          <Filter className="w-4 h-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-50">Filters</h2>
        </div>

        {/* Camera multi-select */}
        <div className="mb-5">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Cameras
          </h3>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {cameras.map((cam) => (
              <label
                key={cam.id}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={filters.cameraIds.has(cam.id)}
                  onChange={() =>
                    updateFilter("cameraIds", toggleSetItem(filters.cameraIds, cam.id))
                  }
                  className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                />
                <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors duration-150 truncate">
                  {cam.name}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Event types */}
        <div className="mb-5">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Event Type
          </h3>
          <div className="space-y-1.5">
            {EVENT_TYPE_CONFIG.map(({ type, label, dotColor }) => (
              <label
                key={type}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={filters.eventTypes.has(type)}
                  onChange={() =>
                    updateFilter("eventTypes", toggleSetItem(filters.eventTypes, type))
                  }
                  className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                />
                <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors duration-150">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Severity */}
        <div className="mb-5">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Severity
          </h3>
          <div className="space-y-1.5">
            {SEVERITY_CONFIG.map(({ level, label, color }) => (
              <label
                key={level}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={filters.severities.has(level)}
                  onChange={() =>
                    updateFilter("severities", toggleSetItem(filters.severities, level))
                  }
                  className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                />
                <span className={`text-xs ${color} group-hover:brightness-125 transition-colors duration-150`}>
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div className="mb-5">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Date Range
          </h3>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {(["today", "yesterday", "7d", "30d"] as const).map((preset) => (
              <button
                key={preset}
                onClick={() => updateFilter("datePreset", preset)}
                className={`px-2 py-1.5 text-[10px] font-medium rounded transition-colors duration-150 cursor-pointer ${
                  filters.datePreset === preset
                    ? "bg-zinc-700 text-zinc-50"
                    : "bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-750"
                }`}
              >
                {preset === "today"
                  ? "Today"
                  : preset === "yesterday"
                    ? "Yesterday"
                    : preset === "7d"
                      ? "7 Days"
                      : "30 Days"}
              </button>
            ))}
          </div>
          <button
            onClick={() => updateFilter("datePreset", "custom")}
            className={`w-full px-2 py-1.5 text-[10px] font-medium rounded transition-colors duration-150 cursor-pointer mb-2 ${
              filters.datePreset === "custom"
                ? "bg-zinc-700 text-zinc-50"
                : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Custom Range
          </button>
          {filters.datePreset === "custom" && (
            <div className="space-y-1.5">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => updateFilter("dateFrom", e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => updateFilter("dateTo", e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
            </div>
          )}
        </div>

        {/* Clear all */}
        {hasActiveFilters(filters) && (
          <button
            onClick={clearAllFilters}
            className="w-full px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-md hover:border-zinc-700 transition-colors duration-150 cursor-pointer"
          >
            Clear All Filters
          </button>
        )}
      </aside>

      {/* Main event list */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/80 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-zinc-50">Events</h1>
            {!loading && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-zinc-800 text-zinc-400">
                {filteredEvents.length} results
              </span>
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-zinc-900 border-b border-zinc-700 shrink-0 animate-[slideDown_300ms_ease-out]">
            <span className="text-xs text-zinc-300 font-medium">
              {selectedIds.size} selected
            </span>
            <button
              onClick={handleBulkAcknowledge}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors duration-150 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Acknowledge All
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors duration-150 cursor-pointer">
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto p-1 text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer"
              aria-label="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Event list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 bg-zinc-900 rounded-lg border border-zinc-800 animate-pulse"
                />
              ))}
            </div>
          )}

          {error && !loading && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              <p className="font-medium mb-1">Failed to load events</p>
              <p className="text-xs text-zinc-500">{error}</p>
              <button
                onClick={fetchData}
                className="mt-2 text-xs text-zinc-400 underline hover:no-underline cursor-pointer"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && filteredEvents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <Bell className="w-8 h-8 mb-3 opacity-50" />
              <p className="text-sm font-medium mb-1">No events match your filters</p>
              <button
                onClick={clearAllFilters}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors duration-150 cursor-pointer"
              >
                Adjust Filters
              </button>
            </div>
          )}

          {!loading && !error && filteredEvents.length > 0 && (
            <div className="space-y-2">
              {filteredEvents.map((event) => {
                const isSelected = selectedIds.has(event.id);
                const borderClass = getEventBorderColor(event);

                return (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className={`flex items-center gap-3 p-3 rounded-lg border-l-4 ${borderClass} bg-zinc-900 hover:bg-zinc-800/50 transition-colors duration-150 cursor-pointer ${
                      isSelected ? "ring-1 ring-blue-500/50" : ""
                    } ${selectedEvent?.id === event.id ? "bg-zinc-800/50" : ""}`}
                    style={{ animation: "slideInEvent 300ms ease-out" }}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelectEvent(event.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/30 cursor-pointer shrink-0"
                    />

                    {/* Thumbnail */}
                    {event.snapshotUrl ? (
                      <img
                        src={event.snapshotUrl}
                        alt=""
                        className="w-12 h-12 rounded bg-zinc-800 object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                        <div className="w-6 h-6 rounded-full bg-zinc-700" />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-200 capitalize">
                          {event.type.replace("_", " ")}
                        </span>
                        <span className="text-sm text-zinc-200 font-medium">
                          {event.cameraName ?? cameraNameMap.get(event.cameraId) ?? "Unknown"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {event.zoneName && (
                          <span className="inline-flex px-1.5 py-0.5 text-[10px] rounded-full bg-zinc-800 text-zinc-400">
                            {event.zoneName}
                          </span>
                        )}
                        <span
                          className={`inline-flex px-1.5 py-0.5 text-[10px] rounded-full capitalize ${getSeverityBadgeClass(event.severity)}`}
                        >
                          {event.severity}
                        </span>
                        {(event.type === "person" || event.type === "vehicle" || event.type === "animal") && (
                          <span className="inline-flex px-1.5 py-0.5 text-[10px] rounded-full bg-purple-500/10 text-purple-400">
                            AI
                          </span>
                        )}
                        {event.acknowledged && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full bg-green-500/10 text-green-400">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Ack
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <span
                      className="text-xs text-zinc-500 shrink-0 whitespace-nowrap"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {formatRelativeTime(event.detectedAt)}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {event.clipUrl && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(event.clipUrl!, "_blank");
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors duration-150 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          View Clip
                        </button>
                      )}
                      {!event.acknowledged && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcknowledge(event.id);
                          }}
                          className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 rounded-md transition-colors duration-150 cursor-pointer"
                          aria-label="Acknowledge event"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
