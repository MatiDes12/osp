"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Filter,
  Bell,
  CheckCircle2,
  Download,
  Eye,
  X,
  Zap,
  AlertTriangle,
  Info,
  ArrowDown,
  Wifi,
  WifiOff,
  Play,
} from "lucide-react";
import type { OSPEvent, EventType, EventSeverity, Camera } from "@osp/shared";
import { transformEvents, transformCameras } from "@/lib/transforms";
import { useEventStream } from "@/hooks/use-event-stream";
import { PageError } from "@/components/PageError";
import { VirtualList } from "@/components/ui/VirtualList";
import { exportEventsCSV, exportEventsJSON } from "@/lib/export";
import { showToast } from "@/stores/toast";
import { readLocalFileAsUrl } from "@/lib/tauri";
import { cacheEvents, getCachedEvents } from "@/lib/local-db";
import { SnapshotThumb } from "@/components/SnapshotThumb";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Async version — loads a local file as a blob URL for the full-size modal.
 */
async function resolveSnapshotBlobUrl(snapshotUrl: string): Promise<string> {
  if (snapshotUrl.startsWith("local://")) {
    const localPath = snapshotUrl.replace("local://", "");
    const blob = await readLocalFileAsUrl(localPath, "image/jpeg");
    return blob ?? "";
  }
  return snapshotUrl;
}

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

interface PaginationMeta {
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly hasMore: boolean;
}

interface EventSummaryData {
  readonly total: number;
  readonly byType: Record<string, number>;
  readonly bySeverity: Record<string, number>;
  readonly byCamera: Record<string, number>;
}

const INITIAL_FILTERS: Filters = {
  cameraIds: new Set(),
  eventTypes: new Set(),
  severities: new Set(),
  datePreset: "today",
  dateFrom: "",
  dateTo: "",
};

const PAGE_SIZE = 50;

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
  {
    level: "critical",
    label: "Critical",
    color: "text-red-400",
    borderColor: "border-l-red-500",
    badgeBg: "bg-red-500/10 text-red-400",
  },
  {
    level: "high",
    label: "Warning",
    color: "text-amber-400",
    borderColor: "border-l-amber-500",
    badgeBg: "bg-amber-500/10 text-amber-400",
  },
  {
    level: "medium",
    label: "Info",
    color: "text-blue-400",
    borderColor: "border-l-blue-500",
    badgeBg: "bg-blue-500/10 text-blue-400",
  },
  {
    level: "low",
    label: "Low",
    color: "text-zinc-400",
    borderColor: "border-l-zinc-500",
    badgeBg: "bg-zinc-500/10 text-zinc-400",
  },
];

function getSeverityBadgeClass(severity: EventSeverity): string {
  const config = SEVERITY_CONFIG.find((s) => s.level === severity);
  return config?.badgeBg ?? "bg-zinc-500/10 text-zinc-400";
}

function getEventBorderColor(event: OSPEvent): string {
  if (
    event.type === "person" ||
    event.type === "vehicle" ||
    event.type === "animal"
  ) {
    return "border-l-purple-500";
  }
  const config = SEVERITY_CONFIG.find((s) => s.level === event.severity);
  return config?.borderColor ?? "border-l-zinc-500";
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

function buildQueryParams(filters: Filters, page: number): URLSearchParams {
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
    if (filters.dateFrom)
      params.set("from", new Date(filters.dateFrom).toISOString());
    if (filters.dateTo)
      params.set("to", new Date(filters.dateTo).toISOString());
  }

  params.set("page", String(page));
  params.set("limit", String(PAGE_SIZE));

  return params;
}

export default function EventsPage() {
  const [events, setEvents] = useState<readonly OSPEvent[]>([]);
  const [cameras, setCameras] = useState<readonly Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [selectedEvent, setSelectedEvent] = useState<OSPEvent | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [summary, setSummary] = useState<EventSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [simulatingMotion, setSimulatingMotion] = useState(false);
  const [newWsEventCount, setNewWsEventCount] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const isScrolledRef = useRef(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [clipModalUrl, setClipModalUrl] = useState<string | null>(null);
  const [snapshotModalEvent, setSnapshotModalEvent] = useState<OSPEvent | null>(null);
  const [snapshotModalSrc, setSnapshotModalSrc] = useState<string>("");

  // Resolve the modal snapshot URL when it changes (async for local:// paths)
  useEffect(() => {
    if (!snapshotModalEvent?.snapshotUrl) { setSnapshotModalSrc(""); return; }
    void resolveSnapshotBlobUrl(snapshotModalEvent.snapshotUrl).then(setSnapshotModalSrc);
  }, [snapshotModalEvent]);

  // Real-time WebSocket events
  const { events: wsEvents, connected: wsConnected } = useEventStream({
    cameraIds: filters.cameraIds.size > 0 ? [...filters.cameraIds] : undefined,
    eventTypes:
      filters.eventTypes.size > 0 ? [...filters.eventTypes] : undefined,
  });

  // Track new WS events when scrolled down
  const prevWsLengthRef = useRef(0);
  useEffect(() => {
    if (wsEvents.length > prevWsLengthRef.current) {
      const newCount = wsEvents.length - prevWsLengthRef.current;
      if (isScrolledRef.current) {
        setNewWsEventCount((prev) => prev + newCount);
      }
    }
    prevWsLengthRef.current = wsEvents.length;
  }, [wsEvents.length]);

  // Track scroll position
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handleScroll = () => {
      isScrolledRef.current = el.scrollTop > 100;
      if (el.scrollTop <= 100) {
        setNewWsEventCount(0);
      }
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const updateFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPage(1);
      setHasMore(true);
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
    setPage(1);
    setHasMore(true);
  }, []);

  // Fetch events (supports both initial load and infinite scroll append)
  const fetchEvents = useCallback(
    async (append = false) => {
      if (!append) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      try {
        const targetPage = append ? page : 1;
        const params = buildQueryParams(filters, targetPage);

        const response = await fetch(
          `${API_URL}/api/v1/events?${params.toString()}`,
          {
            headers: getAuthHeaders(),
          },
        );

        const json = await response.json();
        if (json.success && json.data) {
          const newEvents = transformEvents(
            json.data as Record<string, unknown>[],
          );
          if (append) {
            setEvents((prev) => [...prev, ...newEvents]);
          } else {
            setEvents(newEvents);
            // Cache first page to IndexedDB for offline access
            void cacheEvents(newEvents);
          }
          if (json.meta) {
            const meta = json.meta as PaginationMeta;
            setPagination(meta);
            setHasMore(meta.hasMore);
          }
        } else {
          setError(json.error?.message ?? "Failed to load events");
        }
      } catch (err) {
        // Gateway unreachable — serve from local cache
        if (!append) {
          const cached = await getCachedEvents(PAGE_SIZE);
          if (cached.length > 0) {
            setEvents(cached);
            setHasMore(false);
          } else {
            setError(err instanceof Error ? err.message : "Network error");
          }
        } else {
          setError(err instanceof Error ? err.message : "Network error");
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters, page],
  );

  // Load more events for infinite scroll
  const loadMore = useCallback(() => {
    if (hasMore && !loadingMore && !loading) {
      setPage((prev) => prev + 1);
    }
  }, [hasMore, loadingMore, loading]);

  // Fetch cameras (once)
  const fetchCameras = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/v1/cameras`, {
        headers: getAuthHeaders(),
      });
      const json = await response.json();
      if (json.success && json.data) {
        setCameras(transformCameras(json.data as Record<string, unknown>[]));
      }
    } catch {
      // Camera list is non-critical
    }
  }, []);

  // Fetch event summary
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.datePreset !== "custom") {
        const range = getDateRange(filters.datePreset);
        if (range.from) params.set("from", range.from);
        if (range.to) params.set("to", range.to);
      } else {
        if (filters.dateFrom)
          params.set("from", new Date(filters.dateFrom).toISOString());
        if (filters.dateTo)
          params.set("to", new Date(filters.dateTo).toISOString());
      }

      const response = await fetch(
        `${API_URL}/api/v1/events/summary?${params.toString()}`,
        {
          headers: getAuthHeaders(),
        },
      );
      const json = await response.json();
      if (json.success && json.data) {
        setSummary(json.data as EventSummaryData);
      }
    } catch {
      // Summary is non-critical
    } finally {
      setSummaryLoading(false);
    }
  }, [filters.datePreset, filters.dateFrom, filters.dateTo]);

  // Load cameras once on mount
  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  // Refetch events when filters change (reset) or page changes (append)
  useEffect(() => {
    if (page === 1) {
      fetchEvents(false);
    } else {
      fetchEvents(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page]);

  // Refetch summary when date filters change
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleAcknowledge = useCallback(async (eventId: string) => {
    // Optimistic update
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId
          ? {
              ...e,
              acknowledged: true,
              acknowledgedAt: new Date().toISOString(),
            }
          : e,
      ),
    );
    try {
      const response = await fetch(
        `${API_URL}/api/v1/events/${eventId}/acknowledge`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
        },
      );
      const json = await response.json();
      if (!json.success) {
        // Revert optimistic update on failure
        setEvents((prev) =>
          prev.map((e) =>
            e.id === eventId
              ? { ...e, acknowledged: false, acknowledgedAt: null }
              : e,
          ),
        );
      }
    } catch {
      // Revert on network error
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? { ...e, acknowledged: false, acknowledgedAt: null }
            : e,
        ),
      );
    }
  }, []);

  const handleBulkAcknowledge = useCallback(async () => {
    const ids = [...selectedIds];
    // Optimistic update
    setEvents((prev) =>
      prev.map((e) =>
        selectedIds.has(e.id)
          ? {
              ...e,
              acknowledged: true,
              acknowledgedAt: new Date().toISOString(),
            }
          : e,
      ),
    );
    setSelectedIds(new Set());

    try {
      const response = await fetch(
        `${API_URL}/api/v1/events/bulk-acknowledge`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ eventIds: ids }),
        },
      );
      const json = await response.json();
      if (!json.success) {
        // Fallback to individual requests
        await Promise.allSettled(
          ids.map((id) =>
            fetch(`${API_URL}/api/v1/events/${id}/acknowledge`, {
              method: "PATCH",
              headers: getAuthHeaders(),
            }),
          ),
        );
      }
    } catch {
      // Already optimistically updated; events will be correct on next fetch
    }
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

  const handleSimulateMotion = useCallback(async () => {
    if (cameras.length === 0) return;
    setSimulatingMotion(true);
    try {
      const cameraId = cameras[0]!.id;
      await fetch(`${API_URL}/api/v1/dev/simulate-motion`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ cameraId }),
      });
      // The event will arrive via WebSocket or we can refetch
      setTimeout(() => fetchEvents(), 500);
    } catch {
      // Simulation is best-effort
    } finally {
      setSimulatingMotion(false);
    }
  }, [cameras, fetchEvents]);

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setNewWsEventCount(0);
  }, []);

  const cameraNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cam of cameras) {
      map.set(cam.id, cam.name);
    }
    return map;
  }, [cameras]);

  // Merge WS events with fetched events (prepend, deduplicate)
  const mergedEvents = useMemo(() => {
    const fetchedIds = new Set(events.map((e) => e.id));
    const newFromWs = wsEvents.filter((e) => !fetchedIds.has(e.id));
    return [...newFromWs, ...events];
  }, [events, wsEvents]);

  // Client-side filtering for multi-select (when more than one value is selected,
  // the API only accepts a single value, so we filter the rest client-side)
  const filteredEvents = useMemo(() => {
    return mergedEvents.filter((event) => {
      if (filters.cameraIds.size > 1 && !filters.cameraIds.has(event.cameraId))
        return false;
      if (filters.eventTypes.size > 1 && !filters.eventTypes.has(event.type))
        return false;
      if (
        filters.severities.size > 1 &&
        !filters.severities.has(event.severity)
      )
        return false;
      return true;
    });
  }, [mergedEvents, filters.cameraIds, filters.eventTypes, filters.severities]);

  // Export dropdown outside-click handler
  useEffect(() => {
    if (!exportOpen) return;
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [exportOpen]);

  const handleExportCSV = useCallback(() => {
    exportEventsCSV(filteredEvents);
    showToast(`Exported ${filteredEvents.length} events as CSV`, "success");
    setExportOpen(false);
  }, [filteredEvents]);

  const handleExportJSON = useCallback(() => {
    exportEventsJSON(filteredEvents);
    showToast(`Exported ${filteredEvents.length} events as JSON`, "success");
    setExportOpen(false);
  }, [filteredEvents]);

  const handleBulkExport = useCallback(() => {
    const selected = filteredEvents.filter((e) => selectedIds.has(e.id));
    exportEventsCSV(selected);
    showToast(`Exported ${selected.length} selected events as CSV`, "success");
  }, [filteredEvents, selectedIds]);

  const isDev =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DEV_MODE === "true";

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] -m-4 lg:-m-6 lg:flex-row">
      {/* Mobile horizontal filter bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/50 overflow-x-auto md:hidden shrink-0">
        {/* Date presets */}
        {(["today", "yesterday", "7d", "30d"] as const).map((preset) => (
          <button
            key={preset}
            onClick={() => updateFilter("datePreset", preset)}
            className={`min-h-[36px] whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-full transition-colors duration-150 cursor-pointer ${
              filters.datePreset === preset
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700"
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
        {/* Severity quick filters */}
        {SEVERITY_CONFIG.map(({ level, label, color }) => (
          <button
            key={level}
            onClick={() =>
              updateFilter(
                "severities",
                toggleSetItem(filters.severities, level),
              )
            }
            className={`min-h-[36px] whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-full transition-colors duration-150 cursor-pointer ${
              filters.severities.has(level)
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700"
            }`}
          >
            <span className={color}>{label}</span>
          </button>
        ))}
        {hasActiveFilters(filters) && (
          <button
            onClick={clearAllFilters}
            className="min-h-[36px] whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Filter sidebar (desktop) */}
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
            {cameras.length === 0 && (
              <p className="text-[10px] text-zinc-600 italic">
                No cameras loaded
              </p>
            )}
            {cameras.map((cam) => (
              <label
                key={cam.id}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={filters.cameraIds.has(cam.id)}
                  onChange={() =>
                    updateFilter(
                      "cameraIds",
                      toggleSetItem(filters.cameraIds, cam.id),
                    )
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
                    updateFilter(
                      "eventTypes",
                      toggleSetItem(filters.eventTypes, type),
                    )
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
                    updateFilter(
                      "severities",
                      toggleSetItem(filters.severities, level),
                    )
                  }
                  className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                />
                <span
                  className={`text-xs ${color} group-hover:brightness-125 transition-colors duration-150`}
                >
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
            {!loading && pagination && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-zinc-800 text-zinc-400">
                {pagination.total} total
              </span>
            )}
            {/* WebSocket status indicator */}
            <span
              className="flex items-center gap-1"
              title={
                wsConnected
                  ? "Live updates connected"
                  : "Live updates disconnected"
              }
            >
              {wsConnected ? (
                <Wifi className="w-3 h-3 text-green-500" />
              ) : (
                <WifiOff className="w-3 h-3 text-zinc-600" />
              )}
              <span
                className={`text-[10px] ${wsConnected ? "text-green-500" : "text-zinc-600"}`}
              >
                {wsConnected ? "Live" : "Offline"}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Export dropdown */}
            <div className="relative" ref={exportRef}>
              <button
                type="button"
                onClick={() => setExportOpen((prev) => !prev)}
                disabled={filteredEvents.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl z-50">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleExportJSON}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    Export JSON
                  </button>
                </div>
              )}
            </div>
            {isDev && (
              <button
                onClick={handleSimulateMotion}
                disabled={simulatingMotion || cameras.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
                title="Simulate a motion event (dev only)"
              >
                <Zap className="w-3.5 h-3.5" />
                {simulatingMotion ? "Simulating..." : "Simulate Motion"}
              </button>
            )}
          </div>
        </div>

        {/* Event summary bar */}
        {!summaryLoading && summary && (
          <div className="flex items-center gap-4 px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 shrink-0 overflow-x-auto">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Total
              </span>
              <span className="text-xs font-semibold text-zinc-200">
                {summary.total}
              </span>
            </div>
            <div className="w-px h-4 bg-zinc-800" />
            {SEVERITY_CONFIG.map(({ level, label, color }) => {
              const count = summary.bySeverity[level] ?? 0;
              if (count === 0) return null;
              return (
                <div key={level} className="flex items-center gap-1.5">
                  {level === "critical" && (
                    <AlertTriangle className={`w-3 h-3 ${color}`} />
                  )}
                  {level === "high" && (
                    <AlertTriangle className={`w-3 h-3 ${color}`} />
                  )}
                  {level === "medium" && (
                    <Info className={`w-3 h-3 ${color}`} />
                  )}
                  <span className={`text-xs font-medium ${color}`}>
                    {count}
                  </span>
                  <span className="text-[10px] text-zinc-500">{label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-900 border-b border-zinc-700 shrink-0 animate-[slideDown_300ms_ease-out] lg:gap-3 lg:px-4">
            <span className="text-xs text-zinc-300 font-medium whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <button
              onClick={handleBulkAcknowledge}
              className="inline-flex min-h-[36px] items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors duration-150 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Acknowledge All</span>
              <span className="sm:hidden">Ack All</span>
            </button>
            <button
              onClick={handleBulkExport}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors duration-150 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer"
              aria-label="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* New events banner */}
        {newWsEventCount > 0 && (
          <button
            onClick={scrollToTop}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500/10 border-b border-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/15 transition-colors duration-150 cursor-pointer shrink-0"
          >
            <ArrowDown className="w-3 h-3 rotate-180" />
            {newWsEventCount} new {newWsEventCount === 1 ? "event" : "events"} — click to scroll up
          </button>
        )}

        {/* Event list with virtual scrolling + infinite scroll */}
        <div
          ref={listRef}
          className="flex-1 overflow-hidden px-4 py-3 flex flex-col"
        >
          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[88px] bg-zinc-900 rounded-lg border border-zinc-800 animate-pulse"
                />
              ))}
            </div>
          )}

          {error && !loading && (
            <PageError message={error} onRetry={() => fetchEvents(false)} />
          )}

          {!loading && !error && (
            <VirtualList
              items={filteredEvents}
              itemHeight={88}
              overscan={8}
              onLoadMore={loadMore}
              loadMoreThreshold={100}
              isLoadingMore={loadingMore}
              className="flex-1"
              emptyState={
                <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                  <Bell className="w-8 h-8 mb-3 opacity-50" />
                  <p className="text-sm font-medium mb-1">
                    No events match your filters
                  </p>
                  <button
                    onClick={clearAllFilters}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors duration-150 cursor-pointer"
                  >
                    Adjust Filters
                  </button>
                </div>
              }
              renderItem={(event) => {
                const isSelected = selectedIds.has(event.id);
                const borderClass = getEventBorderColor(event);
                // WS events that aren't in the fetched set get a slide-in animation
                const isNewFromWs = !events.some((e) => e.id === event.id);

                return (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-4 ${borderClass} transition-all duration-150 cursor-pointer ${
                      event.acknowledged
                        ? "bg-zinc-900/50 opacity-60"
                        : "bg-zinc-900 hover:bg-zinc-800/60"
                    } ${
                      isSelected ? "ring-1 ring-blue-500/50" : ""
                    } ${selectedEvent?.id === event.id ? "bg-zinc-800/60 ring-1 ring-zinc-600/50" : ""}`}
                    style={
                      isNewFromWs
                        ? { animation: "slideInEvent 300ms ease-out" }
                        : undefined
                    }
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

                    {/* Snapshot thumbnail — always visible, click to enlarge */}
                    <div
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SnapshotThumb
                        snapshotUrl={event.snapshotUrl}
                        className="w-24 h-16 ring-1 ring-zinc-700/50"
                        onClick={event.snapshotUrl ? () => setSnapshotModalEvent(event) : undefined}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-200 capitalize">
                          {event.type === "lpr.detected"
                            ? "Plate Detected"
                            : event.type === "lpr.alert"
                              ? "Plate Alert"
                              : event.type.replace("_", " ")}
                        </span>
                        <span className="text-sm text-zinc-200 font-medium">
                          {event.cameraName ??
                            cameraNameMap.get(event.cameraId) ??
                            "Unknown"}
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
                        {(event.type === "person" ||
                          event.type === "vehicle" ||
                          event.type === "animal") && (
                          <span className="inline-flex px-1.5 py-0.5 text-[10px] rounded-full bg-purple-500/10 text-purple-400">
                            AI
                          </span>
                        )}
                        {(event.type === "lpr.detected" ||
                          event.type === "lpr.alert") &&
                          (() => {
                            const meta = event.metadata as Record<
                              string,
                              unknown
                            > | null;
                            const plates =
                              (meta?.plates as
                                | Array<{ plate: string }>
                                | undefined) ?? [];
                            const alertPlate = meta?.plate as
                              | string
                              | undefined;
                            const label = meta?.label as string | undefined;
                            const isAlert = event.type === "lpr.alert";
                            return (
                              <>
                                <span
                                  className={`inline-flex px-1.5 py-0.5 text-[10px] rounded-full ${isAlert ? "bg-red-500/15 text-red-400" : "bg-amber-500/10 text-amber-400"}`}
                                >
                                  LPR
                                </span>
                                {isAlert && alertPlate && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-red-500/10 text-red-300 font-mono font-semibold border border-red-500/20">
                                    {alertPlate}
                                    {label ? ` · ${label}` : ""}
                                  </span>
                                )}
                                {!isAlert &&
                                  plates.slice(0, 2).map((p) => (
                                    <span
                                      key={p.plate}
                                      className="inline-flex px-1.5 py-0.5 text-[10px] rounded bg-zinc-800 text-zinc-300 font-mono font-semibold"
                                    >
                                      {p.plate}
                                    </span>
                                  ))}
                                {!isAlert && plates.length > 2 && (
                                  <span className="text-[10px] text-zinc-500">
                                    +{plates.length - 2}
                                  </span>
                                )}
                              </>
                            );
                          })()}
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
                    <div className="flex items-center gap-0.5 shrink-0 lg:gap-1">
                      {event.clipUrl && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setClipModalUrl(event.clipUrl);
                          }}
                          className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center gap-1 px-2 py-1 text-[10px] rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors duration-150 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Clip</span>
                        </button>
                      )}
                      {!event.acknowledged && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcknowledge(event.id);
                          }}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 rounded-md transition-colors duration-150 cursor-pointer"
                          aria-label="Acknowledge event"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          )}
        </div>
      </main>

      {/* Snapshot viewer modal */}
      {snapshotModalEvent?.snapshotUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-[fadeIn_150ms_ease-out]">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setSnapshotModalEvent(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSnapshotModalEvent(null);
            }}
            role="button"
            tabIndex={-1}
            aria-label="Close snapshot"
          />
          <div className="relative z-50 w-full max-w-3xl mx-4 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-200 capitalize">
                  {snapshotModalEvent.type.replace("_", " ")} — Snapshot
                </span>
                <span className="text-xs text-zinc-500">
                  {new Date(snapshotModalEvent.detectedAt).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={snapshotModalEvent.snapshotUrl}
                  download={`snapshot-${snapshotModalEvent.id}.jpg`}
                  className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                >
                  Download
                </a>
                <button
                  onClick={() => setSnapshotModalEvent(null)}
                  className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <img
              src={snapshotModalSrc}
              alt="Event snapshot"
              className="w-full object-contain max-h-[70vh] bg-black"
            />
          </div>
        </div>
      )}

      {/* Clip playback modal */}
      {clipModalUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-[fadeIn_150ms_ease-out]">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setClipModalUrl(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setClipModalUrl(null);
            }}
            role="button"
            tabIndex={-1}
            aria-label="Close clip player"
          />
          <div className="relative z-50 w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-lg shadow-black/40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
              <span className="text-sm font-medium text-zinc-200">
                Event Clip
              </span>
              <button
                onClick={() => setClipModalUrl(null)}
                className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors duration-150 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-black">
              <video
                src={clipModalUrl}
                controls
                autoPlay
                className="w-full max-h-[60vh]"
              >
                <track kind="captions" />
              </video>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
