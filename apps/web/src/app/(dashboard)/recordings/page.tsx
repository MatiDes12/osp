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
} from "lucide-react";
import { PageError } from "@/components/PageError";
import { VirtualList } from "@/components/ui/VirtualList";
import { exportRecordingsCSV } from "@/lib/export";
import { showToast } from "@/stores/toast";

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
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeRange(start: string, end: string): string {
  if (!end) return `${formatTime(start)} - ongoing`;
  return `${formatTime(start)} - ${formatTime(end)}`;
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
  { bg: string; text: string; label: string }
> = {
  motion: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    label: "Motion",
  },
  continuous: {
    bg: "bg-green-500/10",
    text: "text-green-400",
    label: "Continuous",
  },
  manual: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    label: "Manual",
  },
  rule: {
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    label: "Rule",
  },
  ai_detection: {
    bg: "bg-purple-500/10",
    text: "text-purple-400",
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
        <div className="w-16 h-12 bg-zinc-800 rounded" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-28 bg-zinc-800 rounded" />
          <div className="h-3 w-40 bg-zinc-800 rounded" />
        </div>
        <div className="h-5 w-14 bg-zinc-800 rounded" />
      </div>
    </div>
  );
}

function PlayerSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="bg-zinc-900 rounded-lg aspect-video" />
      <div className="mt-4 space-y-3">
        <div className="h-4 w-40 bg-zinc-800 rounded" />
        <div className="h-3 w-56 bg-zinc-800 rounded" />
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

  const [cameraFilter, setCameraFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [triggerFilter, setTriggerFilter] = useState<RecordingTrigger | "">("");
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  /**
   * Build a playback URL with the auth token as a query param.
   * This lets the <video> element use native range requests for seeking
   * without having to download the whole file as a blob first.
   */
  const getPlaybackUrl = useCallback((rec: Recording): string => {
    const base = rec.playbackUrl
      ? rec.playbackUrl
      : `${API_URL}/api/v1/recordings/${encodeURIComponent(rec.id)}/play`;
    const token = localStorage.getItem("osp_access_token");
    if (!token) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}token=${encodeURIComponent(token)}`;
  }, []);

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

      // Only fetch cameras on initial load
      if (!append) {
        fetches.push(
          fetch(`${API_URL}/api/v1/cameras`, { headers: getAuthHeaders() }),
        );
      }

      const responses = await Promise.all(fetches);

      const recordingsJson = await responses[0]!.json();
      if (recordingsJson.success && recordingsJson.data) {
        const newRecordings = transformRecordings(recordingsJson.data as Record<string, unknown>[]);
        if (append) {
          setRecordings((prev) => [...prev, ...newRecordings]);
        } else {
          setRecordings(newRecordings);
        }
        if (recordingsJson.meta) {
          setHasMore(recordingsJson.meta.hasMore as boolean);
        }
      } else {
        setError(
          recordingsJson.error?.message ?? "Failed to load recordings",
        );
      }

      if (!append && responses[1]) {
        const camerasJson = await responses[1].json();
        if (camerasJson.success && camerasJson.data) {
          setCameras(transformCameras(camerasJson.data as Record<string, unknown>[]));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cameraFilter, dateFilter, triggerFilter, page]);

  // Load more recordings for infinite scroll
  const loadMoreRecordings = useCallback(() => {
    if (hasMore && !loadingMore && !loading) {
      setPage((prev) => prev + 1);
    }
  }, [hasMore, loadingMore, loading]);

  useEffect(() => {
    if (page === 1) {
      fetchData(false);
    } else {
      fetchData(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraFilter, dateFilter, triggerFilter, page]);


  const hasFilters = cameraFilter || dateFilter || triggerFilter;


  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-6">
      {/* ── Top controls bar ──────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800 bg-zinc-950 shrink-0">
        {/* Camera selector */}
        <div className="relative">
          <select
            value={cameraFilter}
            onChange={(e) => { setCameraFilter(e.target.value); setPage(1); setHasMore(true); }}
            className="appearance-none rounded-lg border border-zinc-800 bg-zinc-900 pl-3 pr-8 py-2 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors duration-150 cursor-pointer"
          >
            <option value="">All Cameras</option>
            {cameras.map((cam) => (
              <option key={cam.id} value={cam.id}>
                {cam.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
        </div>

        {/* Date picker */}
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => { setDateFilter(e.target.value); setPage(1); setHasMore(true); }}
            className="rounded-lg border border-zinc-800 bg-zinc-900 pl-9 pr-3 py-2 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors duration-150 cursor-pointer"
          />
        </div>

        {/* Trigger filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          <select
            value={triggerFilter}
            onChange={(e) => {
              setTriggerFilter(e.target.value as RecordingTrigger | "");
              setPage(1);
              setHasMore(true);
            }}
            className="appearance-none rounded-lg border border-zinc-800 bg-zinc-900 pl-9 pr-8 py-2 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors duration-150 cursor-pointer"
          >
            {TRIGGER_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={() => {
              setCameraFilter("");
              setDateFilter("");
              setTriggerFilter("");
              setPage(1);
              setHasMore(true);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}

        {/* Export CSV */}
        {!loading && !error && recordings.length > 0 && (
          <button
            type="button"
            onClick={() => {
              exportRecordingsCSV(recordings);
              showToast(`Exported ${recordings.length} recordings as CSV`, "success");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors duration-150 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        )}

        {/* Recording count */}
        {!loading && !error && (
          <span className="ml-auto text-xs text-zinc-500">
            {recordings.length} recording{recordings.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── Split view ────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left: Recording list with virtual scrolling + infinite scroll ── */}
        <div className="w-[40%] min-w-[320px] border-r border-zinc-800 flex flex-col px-3 py-3">
          {loading && (
            <>
              <RecordingCardSkeleton />
              <RecordingCardSkeleton />
              <RecordingCardSkeleton />
              <RecordingCardSkeleton />
              <RecordingCardSkeleton />
            </>
          )}

          {error && !loading && (
            <PageError message={error} onRetry={() => fetchData(false)} />
          )}

          {!loading && !error && (
            <VirtualList
              items={recordings}
              itemHeight={80}
              overscan={6}
              onLoadMore={loadMoreRecordings}
              loadMoreThreshold={100}
              isLoadingMore={loadingMore}
              className="flex-1"
              emptyState={
                <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                  <Play className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium text-zinc-400">
                    No recordings found
                  </p>
                  <p className="text-xs text-zinc-600 mt-1">
                    {hasFilters
                      ? "Try adjusting your filters"
                      : "Recordings will appear here when cameras start recording"}
                  </p>
                </div>
              }
              renderItem={(rec) => {
                const triggerStyle = TRIGGER_STYLES[rec.trigger] ?? {
                  bg: "bg-zinc-500/10",
                  text: "text-zinc-400",
                  label: rec.trigger,
                };
                const isSelected = selectedRecording?.id === rec.id;

                return (
                  <button
                    onClick={() => setSelectedRecording(rec)}
                    className={`w-full text-left rounded-lg border p-3 mb-2 cursor-pointer transition-all duration-150 hover:bg-zinc-800/50 ${
                      isSelected
                        ? "ring-1 ring-blue-500/50 border-zinc-700 bg-zinc-800/30"
                        : "border-zinc-800 bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Thumbnail */}
                      <div className="w-16 h-12 shrink-0 rounded bg-zinc-800 flex items-center justify-center overflow-hidden">
                        {rec.thumbnailUrl ? (
                          <img
                            src={rec.thumbnailUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Video className="h-5 w-5 text-zinc-600" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-zinc-50 truncate">
                            {rec.cameraName}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${triggerStyle.bg} ${triggerStyle.text}`}
                          >
                            {triggerStyle.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-zinc-500">
                            {formatTimeRange(rec.startTime, rec.endTime)}
                          </span>
                          <span className="text-xs text-zinc-600">
                            {formatDuration(rec.durationSec)}
                          </span>
                        </div>
                        <span className="text-xs text-zinc-500">
                          {formatBytes(rec.sizeBytes)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              }}
            />
          )}
        </div>

        {/* ── Right: Player panel ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedRecording ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <Play className="h-16 w-16 mb-4 opacity-20" />
              <p className="text-lg font-medium text-zinc-400">
                No recordings found
              </p>
              <p className="text-sm text-zinc-600 mt-1">
                Select a recording to play or adjust your filters
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              {/* Video player */}
              <div className="bg-black rounded-lg aspect-video overflow-hidden flex items-center justify-center relative group">
                {selectedRecording.status === "recording" ? (
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm font-semibold text-red-400">Recording in progress</span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Stop the recording to play it back
                    </p>
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    key={selectedRecording.id}
                    src={getPlaybackUrl(selectedRecording)}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                    poster={selectedRecording.thumbnailUrl ?? undefined}
                  />
                )}
              </div>

              {/* Metadata */}
              <div className="mt-4 bg-zinc-900 rounded-lg border border-zinc-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-50">
                    {selectedRecording.cameraName}
                  </h3>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      TRIGGER_STYLES[selectedRecording.trigger]?.bg ??
                      "bg-zinc-500/10"
                    } ${
                      TRIGGER_STYLES[selectedRecording.trigger]?.text ??
                      "text-zinc-400"
                    }`}
                  >
                    {TRIGGER_STYLES[selectedRecording.trigger]?.label ??
                      selectedRecording.trigger}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-zinc-500" />
                    <div>
                      <p className="text-xs text-zinc-500">Duration</p>
                      <p className="font-mono text-xs text-zinc-300">
                        {formatDuration(selectedRecording.durationSec)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-3.5 w-3.5 text-zinc-500" />
                    <div>
                      <p className="text-xs text-zinc-500">Size</p>
                      <p className="font-mono text-xs text-zinc-300">
                        {formatBytes(selectedRecording.sizeBytes)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                    <div>
                      <p className="text-xs text-zinc-500">Time</p>
                      <p className="font-mono text-xs text-zinc-300">
                        {formatTimeRange(
                          selectedRecording.startTime,
                          selectedRecording.endTime,
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Video className="h-3.5 w-3.5 text-zinc-500" />
                    <div>
                      <p className="text-xs text-zinc-500">Retention Until</p>
                      <p className="font-mono text-xs text-zinc-300">
                        {new Date(
                          selectedRecording.retentionUntil,
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Download */}
                <div className="mt-4 pt-3 border-t border-zinc-800">
                  <a
                    href={getPlaybackUrl(selectedRecording)}
                    download={`${selectedRecording.cameraName}-${new Date(selectedRecording.startTime).toISOString().slice(0, 19)}.mp4`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 transition-colors duration-150 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Recording
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
