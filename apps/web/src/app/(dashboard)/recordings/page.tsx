"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  Recording,
  Camera,
  RecordingTrigger,
} from "@osp/shared";
import { transformRecordings, transformCameras } from "@/lib/transforms";
import {
  Play,
  Download,
  Calendar,
  Filter,
  X,
  Clock,
  HardDrive,
  Video,
  ChevronDown,
  Search,
  Trash2,
  Maximize2,
  AlertTriangle,
  RefreshCw,
  Film,
  Database,
  Timer,
} from "lucide-react";
import { PageError } from "@/components/PageError";
import { VirtualList } from "@/components/ui/VirtualList";
import { exportRecordingsCSV } from "@/lib/export";
import { showToast } from "@/stores/toast";
import { isTauri, readLocalFileAsUrl } from "@/lib/tauri";
import { cacheRecordings, getCachedRecordings } from "@/lib/local-db";

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

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDurationTotal(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(seconds)}s`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/** Format a timestamp as HH:MM:SS including seconds */
function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTimeRange(start: string, end: string | null): string {
  if (!end) return `${formatTime(start)} — ongoing`;
  return `${formatTime(start)} — ${formatTime(end)}`;
}

function formatDateHeader(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const formatted = date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (isToday) return `Today — ${formatted}`;
  if (isYesterday) return `Yesterday — ${formatted}`;
  return formatted;
}

function groupByDate(
  recordings: readonly Recording[],
): Map<string, Recording[]> {
  const groups = new Map<string, Recording[]>();
  for (const rec of recordings) {
    const dateKey = new Date(rec.startTime).toDateString();
    const existing = groups.get(dateKey);
    if (existing) {
      existing.push(rec);
    } else {
      groups.set(dateKey, [rec]);
    }
  }
  return groups;
}

const TRIGGER_STYLES: Record<
  RecordingTrigger,
  { bg: string; text: string; dot: string; label: string }
> = {
  motion: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    dot: "bg-amber-400",
    label: "Motion",
  },
  continuous: {
    bg: "bg-green-500/10",
    text: "text-green-400",
    dot: "bg-green-400",
    label: "Continuous",
  },
  manual: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    dot: "bg-blue-400",
    label: "Manual",
  },
  rule: {
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    dot: "bg-purple-400",
    label: "Rule",
  },
  ai_detection: {
    bg: "bg-violet-500/10",
    text: "text-violet-400",
    dot: "bg-violet-400",
    label: "AI Detection",
  },
};

const TRIGGER_FILTER_OPTIONS: readonly {
  value: RecordingTrigger | "";
  label: string;
}[] = [
  { value: "", label: "All Triggers" },
  { value: "motion", label: "Motion" },
  { value: "continuous", label: "Continuous" },
  { value: "manual", label: "Manual" },
  { value: "rule", label: "Rule" },
  { value: "ai_detection", label: "AI Detection" },
];

/* ------------------------------------------------------------------ */
/*  Skeleton loaders                                                   */
/* ------------------------------------------------------------------ */
function RecordingCardSkeleton() {
  return (
    <div className="animate-pulse bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-2">
      <div className="flex items-center gap-3">
        <div className="w-20 h-14 bg-zinc-800 rounded-md" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-28 bg-zinc-800 rounded" />
          <div className="h-3 w-44 bg-zinc-800 rounded" />
          <div className="h-3 w-20 bg-zinc-800 rounded" />
        </div>
        <div className="h-5 w-14 bg-zinc-800 rounded" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<readonly Recording[]>([]);
  const [cameras, setCameras] = useState<readonly Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [cameraFilter, setCameraFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [triggerFilter, setTriggerFilter] = useState<RecordingTrigger | "">("");
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
  const prevBlobUrl = useRef<string | null>(null);

  // Revoke previous blob URL and load new one when selection changes
  useEffect(() => {
    if (prevBlobUrl.current) {
      URL.revokeObjectURL(prevBlobUrl.current);
      prevBlobUrl.current = null;
    }
    setLocalBlobUrl(null);
    if (!selectedRecording) return;
    const rawUrl = selectedRecording.playbackUrl || "";
    if (!rawUrl.startsWith("local://") || !isTauri()) return;
    const localPath = rawUrl.replace("local://", "");
    const mime = localPath.toLowerCase().endsWith(".mp4") ? "video/mp4" : "video/webm";
    void readLocalFileAsUrl(localPath, mime).then((url) => {
      if (url) {
        prevBlobUrl.current = url;
        setLocalBlobUrl(url);
      }
    });
  }, [selectedRecording]);

  // Escape key closes fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const getPlaybackUrl = useCallback((rec: Recording): string | null => {
    const rawUrl = rec.playbackUrl || "";
    if (rawUrl.startsWith("local://")) {
      if (!isTauri()) return null;
      return localBlobUrl;
    }
    const apiUrl = rawUrl || `${API_URL}/api/v1/recordings/${encodeURIComponent(rec.id)}/play`;
    const token = localStorage.getItem("osp_access_token");
    if (!token) return apiUrl;
    const sep = apiUrl.includes("?") ? "&" : "?";
    return `${apiUrl}${sep}token=${encodeURIComponent(token)}`;
  }, [localBlobUrl]);

  const fetchData = useCallback(async (append = false) => {
    if (!append) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const targetPage = append ? page : 1;
      const params = new URLSearchParams();
      if (cameraFilter) params.set("cameraId", cameraFilter);
      if (dateFilter) {
        const dayStart = new Date(dateFilter);
        const dayEnd = new Date(dateFilter);
        dayEnd.setDate(dayEnd.getDate() + 1);
        params.set("from", dayStart.toISOString());
        params.set("to", dayEnd.toISOString());
      }
      if (triggerFilter) params.set("trigger", triggerFilter);
      params.set("page", String(targetPage));
      params.set("limit", "50");

      const fetches: Promise<Response>[] = [
        fetch(`${API_URL}/api/v1/recordings?${params.toString()}`, {
          headers: getAuthHeaders(),
        }),
      ];
      if (!append) {
        fetches.push(fetch(`${API_URL}/api/v1/cameras`, { headers: getAuthHeaders() }));
      }

      const responses = await Promise.all(fetches);
      const recordingsJson = await responses[0]!.json();
      if (recordingsJson.success && recordingsJson.data) {
        const newRecordings = transformRecordings(recordingsJson.data as Record<string, unknown>[]);
        if (append) {
          setRecordings((prev) => [...prev, ...newRecordings]);
        } else {
          setRecordings(newRecordings);
          void cacheRecordings(newRecordings);
        }
        if (recordingsJson.meta) {
          setHasMore(recordingsJson.meta.hasMore as boolean);
        }
      } else {
        setError(recordingsJson.error?.message ?? "Failed to load recordings");
      }

      if (!append && responses[1]) {
        const camerasJson = await responses[1].json();
        if (camerasJson.success && camerasJson.data) {
          setCameras(transformCameras(camerasJson.data as Record<string, unknown>[]));
        }
      }
    } catch (err) {
      if (!append) {
        const cached = await getCachedRecordings(50);
        if (cached.length > 0) {
          setRecordings(cached);
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
  }, [cameraFilter, dateFilter, triggerFilter, page]);

  const loadMoreRecordings = useCallback(() => {
    if (hasMore && !loadingMore && !loading) {
      setPage((prev) => prev + 1);
    }
  }, [hasMore, loadingMore, loading]);

  useEffect(() => {
    if (page === 1) fetchData(false);
    else fetchData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraFilter, dateFilter, triggerFilter, page]);

  const handleDelete = useCallback(async (rec: Recording) => {
    if (!confirm(`Delete this recording from ${rec.cameraName}?`)) return;
    setDeletingId(rec.id);
    try {
      await fetch(`${API_URL}/api/v1/recordings/${rec.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      setRecordings((prev) => prev.filter((r) => r.id !== rec.id));
      if (selectedRecording?.id === rec.id) setSelectedRecording(null);
      showToast("Recording deleted", "success");
    } catch {
      showToast("Failed to delete recording", "error");
    } finally {
      setDeletingId(null);
    }
  }, [selectedRecording]);

  const hasFilters = cameraFilter || dateFilter || triggerFilter || search;

  // Client-side search filter on camera name
  const visibleRecordings = search.trim()
    ? recordings.filter((r) =>
        r.cameraName.toLowerCase().includes(search.toLowerCase()),
      )
    : recordings;

  // Stats for the current filtered list
  const totalDuration = visibleRecordings.reduce((sum, r) => sum + (r.durationSec ?? 0), 0);
  const totalSize = visibleRecordings.reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0);
  const liveCount = visibleRecordings.filter((r) => r.status === "recording").length;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-6">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-950 shrink-0 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search cameras…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 pl-8 pr-3 py-1.5 text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 w-40"
          />
        </div>

        {/* Camera selector */}
        <div className="relative">
          <select
            value={cameraFilter}
            onChange={(e) => { setCameraFilter(e.target.value); setPage(1); setHasMore(true); }}
            className="appearance-none rounded-lg border border-zinc-800 bg-zinc-900 pl-3 pr-7 py-1.5 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="">All Cameras</option>
            {cameras.map((cam) => (
              <option key={cam.id} value={cam.id}>{cam.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        </div>

        {/* Date picker */}
        <div className="relative">
          <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => { setDateFilter(e.target.value); setPage(1); setHasMore(true); }}
            className="rounded-lg border border-zinc-800 bg-zinc-900 pl-8 pr-3 py-1.5 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          />
        </div>

        {/* Trigger filter */}
        <div className="relative">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
          <select
            value={triggerFilter}
            onChange={(e) => { setTriggerFilter(e.target.value as RecordingTrigger | ""); setPage(1); setHasMore(true); }}
            className="appearance-none rounded-lg border border-zinc-800 bg-zinc-900 pl-8 pr-7 py-1.5 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            {TRIGGER_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={() => { setCameraFilter(""); setDateFilter(""); setTriggerFilter(""); setSearch(""); setPage(1); setHasMore(true); }}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}

        {/* Refresh */}
        <button
          onClick={() => { setPage(1); fetchData(false); }}
          disabled={loading}
          className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>

        {/* Export CSV */}
        {!loading && !error && recordings.length > 0 && (
          <button
            onClick={() => { exportRecordingsCSV(recordings); showToast(`Exported ${recordings.length} recordings`, "success"); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            <Download className="w-3 h-3" />
            Export CSV
          </button>
        )}

        {/* Stats pills */}
        {!loading && !error && visibleRecordings.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            {liveCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {liveCount} live
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400">
              <Film className="w-2.5 h-2.5" />
              {visibleRecordings.length}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400">
              <Timer className="w-2.5 h-2.5" />
              {formatDurationTotal(totalDuration)}
            </span>
            {totalSize > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400">
                <Database className="w-2.5 h-2.5" />
                {formatBytes(totalSize)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Split view ────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left: Recording list ── */}
        <div className="w-[38%] min-w-[300px] border-r border-zinc-800 flex flex-col">
          {loading && (
            <div className="px-3 py-3 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <RecordingCardSkeleton key={i} />)}
            </div>
          )}

          {error && !loading && (
            <PageError message={error} onRetry={() => fetchData(false)} />
          )}

          {!loading && !error && (
            <VirtualList
              items={visibleRecordings}
              itemHeight={88}
              overscan={6}
              onLoadMore={loadMoreRecordings}
              loadMoreThreshold={100}
              isLoadingMore={loadingMore}
              className="flex-1 px-3 py-3"
              emptyState={
                <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                  <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
                    <Video className="h-7 w-7 text-zinc-600" />
                  </div>
                  <p className="text-sm font-medium text-zinc-400">No recordings found</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    {hasFilters ? "Try adjusting your filters" : "Recordings will appear here when cameras start recording"}
                  </p>
                </div>
              }
              renderItem={(rec) => {
                const triggerStyle = TRIGGER_STYLES[rec.trigger] ?? {
                  bg: "bg-zinc-500/10", text: "text-zinc-400", dot: "bg-zinc-400", label: rec.trigger,
                };
                const isSelected = selectedRecording?.id === rec.id;
                const isLive = rec.status === "recording";

                return (
                  <button
                    onClick={() => setSelectedRecording(rec)}
                    className={`w-full text-left rounded-xl border p-3 mb-2 cursor-pointer transition-all duration-150 group ${
                      isSelected
                        ? "ring-1 ring-blue-500/60 border-blue-500/30 bg-blue-500/5"
                        : "border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Thumbnail */}
                      <div className="w-20 h-14 shrink-0 rounded-md bg-zinc-800 flex items-center justify-center overflow-hidden relative">
                        {rec.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={rec.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <Video className="h-5 w-5 text-zinc-600" />
                          </div>
                        )}
                        {isLive && (
                          <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                            <span className="flex items-center gap-1 text-[9px] font-bold text-red-400 bg-black/60 px-1.5 py-0.5 rounded">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                              LIVE
                            </span>
                          </div>
                        )}
                        {isSelected && !isLive && (
                          <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                            <Play className="w-5 h-5 text-white drop-shadow" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${triggerStyle.dot}`}
                          />
                          <span className="text-xs font-semibold text-zinc-200 truncate">
                            {rec.cameraName}
                          </span>
                          <span
                            className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${triggerStyle.bg} ${triggerStyle.text} font-medium`}
                          >
                            {triggerStyle.label}
                          </span>
                        </div>

                        {/* Time range with seconds */}
                        <p className="font-mono text-[10px] text-zinc-500 truncate mb-0.5">
                          {formatTimeRange(rec.startTime, rec.endTime)}
                        </p>

                        <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDuration(rec.durationSec)}
                          </span>
                          {rec.sizeBytes > 0 && !rec.playbackUrl?.startsWith("local://") && (
                            <span className="flex items-center gap-0.5">
                              <HardDrive className="w-2.5 h-2.5" />
                              {formatBytes(rec.sizeBytes)}
                            </span>
                          )}
                          {rec.playbackUrl?.startsWith("local://") && (
                            <span className="flex items-center gap-0.5 text-zinc-500">
                              <HardDrive className="w-2.5 h-2.5" />
                              Local
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              }}
            />
          )}
        </div>

        {/* ── Right: Player panel ─────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {!selectedRecording ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
              <div className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <Play className="h-9 w-9 text-zinc-700" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-400">Select a recording</p>
                <p className="text-xs text-zinc-600 mt-1">
                  {visibleRecordings.length > 0
                    ? "Click any recording on the left to play it"
                    : "No recordings to show with current filters"}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-5 max-w-3xl mx-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${TRIGGER_STYLES[selectedRecording.trigger]?.dot ?? "bg-zinc-400"}`}
                  />
                  <h2 className="text-sm font-semibold text-zinc-100">
                    {selectedRecording.cameraName}
                  </h2>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      TRIGGER_STYLES[selectedRecording.trigger]?.bg ?? "bg-zinc-800"
                    } ${
                      TRIGGER_STYLES[selectedRecording.trigger]?.text ?? "text-zinc-400"
                    }`}
                  >
                    {TRIGGER_STYLES[selectedRecording.trigger]?.label ?? selectedRecording.trigger}
                  </span>
                  {selectedRecording.status === "recording" && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      Live
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsFullscreen(true)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Fullscreen"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(selectedRecording)}
                    disabled={deletingId === selectedRecording.id}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
                    title="Delete recording"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Video player */}
              <div className="bg-black rounded-xl overflow-hidden border border-zinc-800 aspect-video flex items-center justify-center relative">
                {selectedRecording.status === "recording" ? (
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm font-semibold text-red-400">Recording in progress</span>
                    </div>
                    <p className="text-xs text-zinc-500">Stop the recording to play it back</p>
                  </div>
                ) : getPlaybackUrl(selectedRecording) ? (
                  <video
                    ref={videoRef}
                    key={getPlaybackUrl(selectedRecording)!}
                    src={getPlaybackUrl(selectedRecording)!}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                    poster={selectedRecording.thumbnailUrl ?? undefined}
                  />
                ) : selectedRecording.playbackUrl?.startsWith("local://") && !localBlobUrl ? (
                  <div className="text-center px-4">
                    <div className="w-8 h-8 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-xs text-zinc-500">Loading local file…</p>
                  </div>
                ) : (
                  <div className="text-center px-4">
                    <HardDrive className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                    <p className="text-sm font-medium text-zinc-400">Not available</p>
                    <p className="text-xs text-zinc-600 mt-1">No playback URL for this recording</p>
                  </div>
                )}
              </div>

              {/* Metadata grid */}
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Timer className="w-3 h-3 text-zinc-500" />
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Duration</span>
                  </div>
                  <p className="font-mono text-sm text-zinc-200 font-medium">
                    {formatDuration(selectedRecording.durationSec)}
                  </p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3 h-3 text-zinc-500" />
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Start</span>
                  </div>
                  <p className="font-mono text-xs text-zinc-200">
                    {formatTime(selectedRecording.startTime)}
                  </p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3 h-3 text-zinc-500" />
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">End</span>
                  </div>
                  <p className="font-mono text-xs text-zinc-200">
                    {selectedRecording.endTime ? formatTime(selectedRecording.endTime) : "—"}
                  </p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <HardDrive className="w-3 h-3 text-zinc-500" />
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Size</span>
                  </div>
                  <p className="font-mono text-sm text-zinc-200">
                    {selectedRecording.playbackUrl?.startsWith("local://")
                      ? "Local"
                      : formatBytes(selectedRecording.sizeBytes)}
                  </p>
                </div>
              </div>

              {/* Date + actions row */}
              <div className="mt-2 flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="text-xs text-zinc-400">
                    {formatDateHeader(selectedRecording.startTime)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedRecording.retentionUntil && (
                    <span className="text-[10px] text-zinc-600">
                      Expires {new Date(selectedRecording.retentionUntil).toLocaleDateString()}
                    </span>
                  )}
                  {!selectedRecording.playbackUrl?.startsWith("local://") && getPlaybackUrl(selectedRecording) && (
                    <a
                      href={getPlaybackUrl(selectedRecording)!}
                      download={`${selectedRecording.cameraName}-${new Date(selectedRecording.startTime).toISOString().slice(0, 19)}.mp4`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer"
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(selectedRecording)}
                    disabled={deletingId === selectedRecording.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Fullscreen overlay ─────────────────────────────────────── */}
      {isFullscreen && selectedRecording && getPlaybackUrl(selectedRecording) && (
        <div
          className="fixed inset-0 bg-black flex items-center justify-center"
          style={{ zIndex: 9999 }}
          onClick={() => setIsFullscreen(false)}
        >
          <video
            key={getPlaybackUrl(selectedRecording)!}
            src={getPlaybackUrl(selectedRecording)!}
            controls
            autoPlay
            className="max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-zinc-400 bg-black/60 px-3 py-1 rounded-full pointer-events-none">
            Press Esc or click outside to exit
          </div>
        </div>
      )}
    </div>
  );
}
