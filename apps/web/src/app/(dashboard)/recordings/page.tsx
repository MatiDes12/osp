"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  Recording,
  Camera,
  ApiResponse,
  RecordingTrigger,
} from "@osp/shared";
import { transformRecordings, transformCameras } from "@/lib/transforms";
import {
  Play,
  Download,
  Calendar,
  Filter,
  X,
  AlertCircle,
  Clock,
  HardDrive,
  Video,
  ChevronDown,
} from "lucide-react";
import { PageError } from "@/components/PageError";

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

  const videoRef = useRef<HTMLVideoElement>(null);

  /**
   * Resolve a playback URL for the selected recording.
   * If the recording already has a playbackUrl from the API, use it.
   * Otherwise fall back to go2rtc's live MP4 stream as an MVP preview.
   */
  const getPlaybackUrl = useCallback((rec: Recording): string => {
    if (rec.playbackUrl) return rec.playbackUrl;
    const go2rtcBase = process.env.NEXT_PUBLIC_GO2RTC_URL ?? "http://localhost:1984";
    return `${go2rtcBase}/api/stream.mp4?src=${encodeURIComponent(rec.cameraId)}&duration=30`;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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
      params.set("limit", "50");

      const [recordingsRes, camerasRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/recordings?${params.toString()}`, {
          headers: getAuthHeaders(),
        }),
        fetch(`${API_URL}/api/v1/cameras`, { headers: getAuthHeaders() }),
      ]);

      const recordingsJson = await recordingsRes.json();
      if (recordingsJson.success && recordingsJson.data) {
        setRecordings(transformRecordings(recordingsJson.data as Record<string, unknown>[]));
      } else {
        setError(
          recordingsJson.error?.message ?? "Failed to load recordings",
        );
      }

      const camerasJson = await camerasRes.json();
      if (camerasJson.success && camerasJson.data) {
        setCameras(transformCameras(camerasJson.data as Record<string, unknown>[]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [cameraFilter, dateFilter, triggerFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasFilters = cameraFilter || dateFilter || triggerFilter;
  const groupedRecordings = groupByDate(recordings);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-6">
      {/* ── Top controls bar ──────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800 bg-zinc-950 shrink-0">
        {/* Camera selector */}
        <div className="relative">
          <select
            value={cameraFilter}
            onChange={(e) => setCameraFilter(e.target.value)}
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
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 pl-9 pr-3 py-2 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors duration-150 cursor-pointer"
          />
        </div>

        {/* Trigger filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          <select
            value={triggerFilter}
            onChange={(e) =>
              setTriggerFilter(e.target.value as RecordingTrigger | "")
            }
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
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer"
          >
            <X className="h-3 w-3" />
            Clear
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
        {/* ── Left: Recording list ────────────────────────────── */}
        <div className="w-[40%] min-w-[320px] border-r border-zinc-800 overflow-y-auto px-3 py-3">
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
            <PageError message={error} onRetry={fetchData} />
          )}

          {!loading && !error && recordings.length === 0 && (
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
          )}

          {!loading &&
            !error &&
            Array.from(groupedRecordings.entries()).map(([dateKey, recs]) => (
              <div key={dateKey} className="mb-4">
                {/* Date header */}
                <div className="px-1 pb-2 pt-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    {formatDateHeader(recs[0]?.startTime ?? "")}
                  </span>
                </div>

                {/* Recording cards */}
                {recs.map((rec) => {
                  const triggerStyle = TRIGGER_STYLES[rec.trigger] ?? {
                    bg: "bg-zinc-500/10",
                    text: "text-zinc-400",
                    label: rec.trigger,
                  };
                  const isSelected = selectedRecording?.id === rec.id;

                  return (
                    <button
                      key={rec.id}
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
                })}
              </div>
            ))}
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
                    <Play className="h-12 w-12 mx-auto mb-2 text-zinc-600" />
                    <p className="text-sm text-zinc-500">
                      Recording in progress...
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
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 transition-colors duration-150 cursor-pointer">
                    <Download className="h-3.5 w-3.5" />
                    Download Recording
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
