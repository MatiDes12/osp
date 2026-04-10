"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Settings,
  Camera,
  Maximize,
  Minimize,
  RefreshCw,
  Plus,
  AlertTriangle,
  Circle,
  Square,
  Trash2,
  Loader2,
  Play,
  X,
  CheckCheck,
  Download,
  Video,
  Brain,
  Bell,
  Info,
  Clock,
  HardDrive,
  Zap,
  Eye,
  EyeOff,
  Save,
  ExternalLink,
} from "lucide-react";
import { LiveViewPlayer } from "@/components/camera/LiveViewPlayer";
import { PTZControls } from "@/components/camera/PTZControls";
import { ZoneDrawer } from "@/components/camera/ZoneDrawer";
import { ZoneNameDialog } from "@/components/camera/ZoneNameDialog";
import { TimelineScrubber } from "@/components/camera/TimelineScrubber";
import { HLSPlayer } from "@/components/camera/HLSPlayer";
import { useRecordings } from "@/hooks/use-recordings";
import { useEvents } from "@/hooks/use-events";
import type {
  Camera as CameraType,
  CameraZone,
  OSPEvent,
  Recording,
} from "@osp/shared";
import {
  transformCamera,
  transformZones,
  transformEvents,
  transformRecordings,
  isSnakeCaseRow,
} from "@/lib/transforms";
import { isTauri, convertFileSrc } from "@/lib/tauri";
import { SnapshotThumb } from "@/components/SnapshotThumb";
import { showToast } from "@/stores/toast";
import { useStorageSettings } from "@/stores/storage-settings";

/** Resolve a recording's playback URL for the current environment. */
function resolvePlaybackUrl(url: string): string | null {
  if (url.startsWith("local://")) {
    if (!isTauri()) return null;
    return convertFileSrc(url.replace("local://", ""));
  }
  return url;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("osp_access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never";
  const diffSec = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000,
  );
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function maskConnectionUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.username || parsed.password) {
      return uri.replace(`${parsed.username}:${parsed.password}@`, "***:***@");
    }
    return uri;
  } catch {
    return uri.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@");
  }
}

function SeverityDot({ severity }: { readonly severity: string }) {
  const colors: Record<string, string> = {
    low: "bg-blue-400",
    medium: "bg-amber-400",
    high: "bg-orange-400",
    critical: "bg-red-400",
  };
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors[severity] ?? "bg-zinc-500"}`}
    />
  );
}

function EventTypeBadge({ type }: { readonly type: string }) {
  const colorMap: Record<string, string> = {
    motion: "bg-blue-500/15 text-blue-400",
    person: "bg-purple-500/15 text-purple-400",
    vehicle: "bg-amber-500/15 text-amber-400",
    animal: "bg-green-500/15 text-green-400",
    package: "bg-orange-500/15 text-orange-400",
    camera_offline: "bg-red-500/15 text-red-400",
    camera_online: "bg-green-500/15 text-green-400",
    sound: "bg-cyan-500/15 text-cyan-400",
  };
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${colorMap[type] ?? "bg-zinc-500/15 text-zinc-400"}`}
    >
      {type.replace(/_/g, " ")}
    </span>
  );
}

function TriggerBadge({ trigger }: { readonly trigger: string }) {
  const map: Record<string, string> = {
    motion: "bg-amber-500/15 text-amber-400",
    ai_detection: "bg-purple-500/15 text-purple-400",
    manual: "bg-blue-500/15 text-blue-400",
    rule: "bg-green-500/15 text-green-400",
    continuous: "bg-zinc-500/15 text-zinc-400",
  };
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${map[trigger] ?? "bg-zinc-500/15 text-zinc-400"}`}
    >
      {trigger.replace(/_/g, " ")}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 animate-pulse">
      <div className="h-3 w-24 bg-zinc-800 rounded mb-3" />
      <div className="space-y-2">
        <div className="h-3 w-full bg-zinc-800 rounded" />
        <div className="h-3 w-3/4 bg-zinc-800 rounded" />
      </div>
    </div>
  );
}

// ─── Recording Tab ────────────────────────────────────────────────────────────

function RecordingTab({
  cameraId,
  onPlay,
}: {
  readonly cameraId: string;
  readonly onPlay: (url: string, offset?: number) => void;
}) {
  const { recordings, loading, error, refetch } = useRecordings({
    cameraId,
    limit: 30,
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await fetch(`${API_URL}/api/v1/recordings/${id}`, {
          method: "DELETE",
          headers: getAuthHeaders(),
        });
        await refetch();
      } catch {
        // ignore
      } finally {
        setDeletingId(null);
      }
    },
    [refetch],
  );

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-zinc-800 rounded-md animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <AlertTriangle className="w-6 h-6 text-red-400 mb-2" />
        <p className="text-xs text-zinc-500">{error}</p>
        <button
          onClick={() => refetch()}
          className="mt-3 text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Video className="w-8 h-8 text-zinc-600 mb-3" />
        <p className="text-sm font-medium text-zinc-400">No recordings yet</p>
        <p className="text-xs text-zinc-500 mt-1">
          Recordings will appear here when triggered by motion, AI, or manual
          start.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-800">
      {recordings.map((rec: Recording) => (
        <div
          key={rec.id}
          className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition-colors"
        >
          {/* Thumbnail */}
          <div className="w-16 h-10 rounded bg-zinc-800 shrink-0 overflow-hidden flex items-center justify-center">
            {rec.thumbnailUrl ? (
              <img
                src={rec.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <Video className="w-4 h-4 text-zinc-600" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <TriggerBadge trigger={rec.trigger} />
              <span
                className="text-[10px] text-zinc-500"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {new Date(rec.startTime).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {formatDuration(rec.durationSec)}
              </span>
              <span className="flex items-center gap-1">
                <HardDrive className="w-2.5 h-2.5" />
                {rec.playbackUrl?.startsWith("local://") ? "Local" : formatBytes(rec.sizeBytes)}
              </span>
              {rec.status === "recording" && (
                <span className="flex items-center gap-1 text-red-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Live
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {rec.playbackUrl && resolvePlaybackUrl(rec.playbackUrl) && (
              <button
                onClick={() => onPlay(resolvePlaybackUrl(rec.playbackUrl)!, 0)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors cursor-pointer"
                title="Play recording"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            )}
            {rec.playbackUrl && !rec.playbackUrl.startsWith("local://") && (
              <a
                href={rec.playbackUrl}
                download
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                title="Download"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              onClick={() => handleDelete(rec.id)}
              disabled={deletingId === rec.id}
              className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
              title="Delete recording"
            >
              {deletingId === rec.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Motion AI Tab ────────────────────────────────────────────────────────────

const AI_DETECTION_TYPES = [
  { key: "person", label: "Person" },
  { key: "vehicle", label: "Vehicle" },
  { key: "animal", label: "Animal" },
  { key: "package", label: "Package" },
  { key: "sound", label: "Sound" },
];

function MotionAITab({
  camera,
  onSaved,
}: {
  readonly camera: CameraType;
  readonly onSaved: () => void;
}) {
  const [recordingMode, setRecordingMode] = useState<
    "motion" | "continuous" | "off"
  >(camera.config.recordingMode);
  const [motionSensitivity, setMotionSensitivity] = useState(
    camera.config.motionSensitivity,
  );
  const [enabledDetections, setEnabledDetections] = useState<Set<string>>(
    new Set(["person", "vehicle"]),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggleDetection = (key: string) => {
    setEnabledDetections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/cameras/${camera.id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          config: {
            recordingMode,
            motionSensitivity,
            audioEnabled: camera.config.audioEnabled,
          },
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setSaveError(json.error?.message ?? "Failed to save");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        onSaved();
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      {/* Recording mode */}
      <div>
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Recording Mode
        </h4>
        <div className="grid grid-cols-3 gap-2">
          {(["motion", "continuous", "off"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setRecordingMode(mode)}
              className={`px-3 py-2 rounded-md text-xs font-medium border transition-colors cursor-pointer capitalize ${
                recordingMode === mode
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-zinc-500 mt-2">
          {recordingMode === "motion" &&
            "Records only when motion is detected."}
          {recordingMode === "continuous" && "Records 24/7 continuously."}
          {recordingMode === "off" &&
            "No automatic recording. Manual start only."}
        </p>
      </div>

      {/* Motion sensitivity */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Motion Sensitivity
          </h4>
          <span className="text-xs font-mono text-zinc-300">
            {motionSensitivity}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={motionSensitivity}
          onChange={(e) => setMotionSensitivity(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-zinc-700 accent-blue-500 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
          <span>Low</span>
          <span>High</span>
        </div>
      </div>

      {/* AI detection types */}
      <div>
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          AI Object Detection
        </h4>
        <div className="space-y-2">
          {AI_DETECTION_TYPES.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-md bg-zinc-800/50 px-3 py-2.5"
            >
              <span className="text-sm text-zinc-200">{label}</span>
              <button
                onClick={() => toggleDetection(key)}
                className={`relative w-8 h-4 rounded-full transition-colors duration-150 cursor-pointer ${
                  enabledDetections.has(key) ? "bg-blue-500" : "bg-zinc-600"
                }`}
                aria-label={`${enabledDetections.has(key) ? "Disable" : "Enable"} ${label} detection`}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-150 ${
                    enabledDetections.has(key) ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div>
        {saveError && <p className="text-xs text-red-400 mb-2">{saveError}</p>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-50"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saved ? "Saved!" : saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

// ─── Events Tab ───────────────────────────────────────────────────────────────

function EventsTab({
  cameraId,
  onPlayClip,
}: {
  readonly cameraId: string;
  readonly onPlayClip: (url: string) => void;
}) {
  const { events, loading, error, acknowledge, bulkAcknowledge, refetch } =
    useEvents({
      cameraId,
      limit: 50,
    });
  const [ackingId, setAckingId] = useState<string | null>(null);
  const [bulkAcking, setBulkAcking] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [snapshotModalUrl, setSnapshotModalUrl] = useState<string | null>(null);

  const unacknowledgedIds = events
    .filter((e) => !e.acknowledged)
    .map((e) => e.id);

  const filteredEvents =
    typeFilter === "all" ? events : events.filter((e) => e.type === typeFilter);

  const eventTypes = ["all", ...Array.from(new Set(events.map((e) => e.type)))];

  const handleAck = async (id: string) => {
    setAckingId(id);
    try {
      await acknowledge(id);
    } catch {
      // ignore
    } finally {
      setAckingId(null);
    }
  };

  const handleBulkAck = async () => {
    setBulkAcking(true);
    try {
      await bulkAcknowledge(unacknowledgedIds);
    } catch {
      // ignore
    } finally {
      setBulkAcking(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-zinc-800 rounded-md animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <AlertTriangle className="w-6 h-6 text-red-400 mb-2" />
        <p className="text-xs text-zinc-500">{error}</p>
        <button
          onClick={() => refetch()}
          className="mt-3 text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-zinc-800">
        {/* Type filter */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {eventTypes.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors cursor-pointer ${
                typeFilter === t
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "all" ? `All (${events.length})` : t.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        {unacknowledgedIds.length > 0 && (
          <button
            onClick={handleBulkAck}
            disabled={bulkAcking}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-40"
            title="Acknowledge all"
          >
            {bulkAcking ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <CheckCheck className="w-3 h-3" />
            )}
            Ack all
          </button>
        )}
      </div>

      {/* Snapshot lightbox */}
      {snapshotModalUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setSnapshotModalUrl(null)}
        >
          <div className="relative max-w-3xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSnapshotModalUrl(null)}
              className="absolute -top-10 right-0 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <SnapshotThumb
              snapshotUrl={snapshotModalUrl}
              className="w-full aspect-video rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}

      {filteredEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Bell className="w-8 h-8 text-zinc-600 mb-3" />
          <p className="text-sm font-medium text-zinc-400">No events</p>
          <p className="text-xs text-zinc-500 mt-1">
            Events from motion detection and AI will appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-800/60">
          {filteredEvents.map((event: OSPEvent) => (
            <div
              key={event.id}
              className={`flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors ${
                event.acknowledged ? "opacity-50" : ""
              }`}
            >
              {/* Snapshot thumbnail */}
              <SnapshotThumb
                snapshotUrl={event.snapshotUrl}
                className="w-20 h-14 ring-1 ring-zinc-700/50 shrink-0"
                onClick={event.snapshotUrl ? () => setSnapshotModalUrl(event.snapshotUrl) : undefined}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <EventTypeBadge type={event.type} />
                  {event.zoneName && (
                    <span className="text-[10px] text-zinc-500 truncate">
                      {event.zoneName}
                    </span>
                  )}
                </div>
                <span
                  className="text-[10px] text-zinc-500"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {formatRelativeTime(event.detectedAt)}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {event.clipUrl && (
                  <button
                    onClick={() => onPlayClip(event.clipUrl!)}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
                    title="Play clip"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                )}
                {!event.acknowledged && (
                  <button
                    onClick={() => handleAck(event.id)}
                    disabled={ackingId === event.id}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-green-400 hover:bg-green-500/10 transition-colors cursor-pointer disabled:opacity-40"
                    title="Acknowledge"
                  >
                    {ackingId === event.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCheck className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Info Tab ─────────────────────────────────────────────────────────────────

function InfoTab({
  camera,
  zones,
  onDrawZone,
  onToggleZoneAlert,
}: {
  readonly camera: CameraType;
  readonly zones: readonly CameraZone[];
  readonly onDrawZone: () => void;
  readonly onToggleZoneAlert: (zoneId: string, enabled: boolean) => void;
}) {
  const statusColor =
    camera.status === "online"
      ? "text-green-400"
      : camera.status === "connecting"
        ? "text-amber-400"
        : "text-red-400";
  const statusDot =
    camera.status === "online"
      ? "bg-green-400"
      : camera.status === "connecting"
        ? "bg-amber-400"
        : "bg-red-400";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      {/* Camera details */}
      <div>
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Camera Details
        </h4>
        <dl className="space-y-2 text-sm">
          {[
            { label: "Name", value: camera.name },
            {
              label: "Protocol",
              value: <span className="uppercase">{camera.protocol}</span>,
            },
            {
              label: "Status",
              value: (
                <span
                  className={`inline-flex items-center gap-1.5 capitalize ${statusColor}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                  {camera.status}
                </span>
              ),
            },
            {
              label: "Connection",
              value: (
                <span
                  className="text-zinc-400 text-xs truncate max-w-[160px] block"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  title={maskConnectionUri(camera.connectionUri)}
                >
                  {maskConnectionUri(camera.connectionUri)}
                </span>
              ),
            },
            camera.manufacturer && {
              label: "Manufacturer",
              value: camera.manufacturer,
            },
            camera.model && { label: "Model", value: camera.model },
            {
              label: "Resolution",
              value: camera.capabilities.resolution || "—",
            },
            {
              label: "Last Seen",
              value: (
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatRelativeTime(camera.lastSeenAt)}
                </span>
              ),
            },
          ]
            .filter(Boolean)
            .map((row) => {
              const r = row as { label: string; value: React.ReactNode };
              return (
                <div
                  key={r.label}
                  className="flex justify-between items-center gap-4"
                >
                  <dt className="text-zinc-500 shrink-0">{r.label}</dt>
                  <dd className="text-zinc-200 font-medium text-right">
                    {r.value}
                  </dd>
                </div>
              );
            })}
        </dl>

        {/* Capabilities */}
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mt-5 mb-3">
          Capabilities
        </h4>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "PTZ", enabled: camera.capabilities.ptz },
            { label: "Audio", enabled: camera.capabilities.audio },
            { label: "2-way Audio", enabled: camera.capabilities.twoWayAudio },
            { label: "Infrared", enabled: camera.capabilities.infrared },
          ].map(({ label, enabled }) => (
            <span
              key={label}
              className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                enabled
                  ? "bg-green-500/10 text-green-400"
                  : "bg-zinc-800 text-zinc-600"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Zones */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Detection Zones ({zones.length})
          </h4>
          <button
            onClick={onDrawZone}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            Draw Zone
          </button>
        </div>
        {zones.length === 0 ? (
          <p className="text-xs text-zinc-500 py-6 text-center">
            No zones configured. Draw zones on the video to define detection
            areas.
          </p>
        ) : (
          <div className="space-y-2">
            {zones.map((zone) => (
              <div
                key={zone.id}
                className="flex items-center justify-between rounded-md bg-zinc-800/50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: zone.colorHex }}
                  />
                  <div>
                    <p className="text-xs font-medium text-zinc-200">
                      {zone.name}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      Sensitivity: {zone.sensitivity}%
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onToggleZoneAlert(zone.id, !zone.alertEnabled)}
                  className={`relative w-8 h-4 rounded-full transition-colors duration-150 cursor-pointer ${
                    zone.alertEnabled ? "bg-green-500" : "bg-zinc-600"
                  }`}
                  aria-label={`${zone.alertEnabled ? "Disable" : "Enable"} alerts for ${zone.name}`}
                >
                  <span
                    className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-150 ${
                      zone.alertEnabled ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({
  camera,
  onSaved,
  onDeleted,
}: {
  readonly camera: CameraType;
  readonly onSaved: () => void;
  readonly onDeleted: () => void;
}) {
  const [name, setName] = useState(camera.name);
  const [connectionUri, setConnectionUri] = useState(camera.connectionUri);
  const [showUri, setShowUri] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [reconnectOk, setReconnectOk] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Capabilities
  const [twoWayAudio, setTwoWayAudio] = useState(
    camera.capabilities.twoWayAudio,
  );
  const [capSaving, setCapSaving] = useState(false);
  const [capError, setCapError] = useState<string | null>(null);
  const [capSaved, setCapSaved] = useState(false);

  const isOnvif =
    camera.connectionUri?.startsWith("onvif://") ||
    (camera.protocol as string) === "onvif";

  const handleSaveCapabilities = async () => {
    setCapSaving(true);
    setCapError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/v1/cameras/${camera.id}/capabilities`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({ twoWayAudio }),
        },
      );
      const json = await res.json();
      if (!json.success) {
        setCapError(json.error?.message ?? "Failed to save");
      } else {
        setCapSaved(true);
        setTimeout(() => setCapSaved(false), 2000);
        onSaved();
      }
    } catch (err) {
      setCapError(err instanceof Error ? err.message : "Network error");
    } finally {
      setCapSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {};
      if (name.trim() !== camera.name) body.name = name.trim();
      if (connectionUri.trim() !== camera.connectionUri)
        body.connectionUri = connectionUri.trim();
      if (Object.keys(body).length === 0) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        return;
      }
      const res = await fetch(`${API_URL}/api/v1/cameras/${camera.id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        setSaveError(json.error?.message ?? "Failed to save");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        onSaved();
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    setReconnectError(null);
    setReconnectOk(false);
    try {
      const res = await fetch(
        `${API_URL}/api/v1/cameras/${camera.id}/reconnect`,
        {
          method: "POST",
          headers: getAuthHeaders(),
        },
      );
      const json = await res.json();
      if (!json.success)
        setReconnectError(json.error?.message ?? "Failed to reconnect");
      else {
        setReconnectOk(true);
        setTimeout(() => setReconnectOk(false), 3000);
        onSaved();
      }
    } catch (err) {
      setReconnectError(err instanceof Error ? err.message : "Network error");
    } finally {
      setReconnecting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/cameras/${camera.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (!json.success) {
        setDeleteError(json.error?.message ?? "Failed to delete");
        setDeleting(false);
      } else {
        onDeleted();
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Network error");
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      {/* Basic info */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Camera Settings
        </h4>

        <div className="space-y-1.5">
          <label className="text-xs text-zinc-400">Camera Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="e.g. Front Door"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-zinc-400">Connection URI</label>
          <div className="relative">
            <input
              type={showUri ? "text" : "password"}
              value={connectionUri}
              onChange={(e) => setConnectionUri(e.target.value)}
              className="w-full px-3 py-2 pr-9 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors font-mono"
              placeholder="rtsp://..."
            />
            <button
              type="button"
              onClick={() => setShowUri((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
              aria-label={showUri ? "Hide URI" : "Show URI"}
            >
              {showUri ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-zinc-600">
            RTSP, ONVIF, or camera-specific protocol URL
          </p>
        </div>

        {saveError && <p className="text-xs text-red-400">{saveError}</p>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Capabilities */}
      <div className="border-t border-zinc-800 pt-5 space-y-4">
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Capabilities
        </h4>

        {/* Two-Way Audio toggle */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-zinc-200 font-medium">Two-Way Audio</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Send microphone audio from the browser to the camera speaker.
              {!isOnvif && (
                <span className="block mt-1 text-amber-400">
                  Only supported on ONVIF cameras. Your camera uses{" "}
                  {(camera.protocol as string).toUpperCase()}.
                </span>
              )}
              {isOnvif && (
                <span className="block mt-1 text-zinc-600">
                  Requires the camera to have a speaker and support ONVIF
                  backchannel.
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTwoWayAudio((v) => !v)}
            disabled={!isOnvif}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150
              ${twoWayAudio && isOnvif ? "bg-blue-500" : "bg-zinc-700"}
              ${!isOnvif ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
            role="switch"
            aria-checked={twoWayAudio}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-150 ${twoWayAudio ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        </div>

        {capError && <p className="text-xs text-red-400">{capError}</p>}
        <button
          onClick={handleSaveCapabilities}
          disabled={capSaving || !isOnvif}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-50"
        >
          {capSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {capSaved ? "Saved!" : capSaving ? "Saving..." : "Save Capabilities"}
        </button>
      </div>

      {/* Connection */}
      <div className="border-t border-zinc-800 pt-5 space-y-3">
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Connection
        </h4>
        <p className="text-xs text-zinc-500">
          Force reconnect the camera stream if it's stuck or offline.
        </p>
        {reconnectError && (
          <p className="text-xs text-red-400">{reconnectError}</p>
        )}
        {reconnectOk && (
          <p className="text-xs text-green-400">Reconnected successfully.</p>
        )}
        <button
          onClick={handleReconnect}
          disabled={reconnecting}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-50 hover:border-zinc-500 transition-colors cursor-pointer disabled:opacity-50"
        >
          {reconnecting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {reconnecting ? "Reconnecting..." : "Reconnect Camera"}
        </button>
      </div>

      {/* Alert Rules shortcut */}
      <div className="border-t border-zinc-800 pt-5 space-y-3">
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Alert Rules
        </h4>
        <p className="text-xs text-zinc-500">
          Create rules to record or send alerts when this camera detects motion,
          a person, or other events.
        </p>
        <a
          href="/rules"
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-50 hover:border-zinc-500 transition-colors"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          Manage Alert Rules
          <ExternalLink className="w-3 h-3 text-zinc-600" />
        </a>
      </div>

      {/* Danger zone */}
      <div className="border-t border-red-900/30 pt-5 space-y-3">
        <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">
          Danger Zone
        </h4>
        <p className="text-xs text-zinc-500">
          Deleting this camera removes all its zones, events, and recordings
          permanently.
        </p>
        {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-red-700/50 text-red-400 hover:bg-red-500/10 hover:border-red-500 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Camera
          </button>
        ) : (
          <div className="rounded-md border border-red-700/40 bg-red-500/5 p-3 space-y-3">
            <p className="text-xs text-red-300 font-medium">
              Are you sure? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-500 transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-3 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "recording" | "motion" | "events" | "info" | "settings";

export default function CameraDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const cameraId = params.id;
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const [camera, setCamera] = useState<CameraType | null>(null);
  const [zones, setZones] = useState<readonly CameraZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("events");

  // Clip playback modal
  const [clipModalUrl, setClipModalUrl] = useState<string | null>(null);

  // Zone drawing
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [pendingPolygon, setPendingPolygon] = useState<
    readonly { x: number; y: number }[] | null
  >(null);
  const [videoSize, setVideoSize] = useState({ width: 960, height: 540 });

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(
    null,
  );
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Local recording (Tauri desktop)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  // Tracks the Supabase recording row ID so we can stop it via API
  const activeRecordingIdRef = useRef<string | null>(null);
  const { saveMode, recordingsPath } = useStorageSettings();

  // Playback state
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackOffset, setPlaybackOffset] = useState(0);
  const playbackVideoRef = useRef<HTMLVideoElement>(null);
  const seekRequestIdRef = useRef(0);

  // Reconnect / delete
  const [reconnecting, setReconnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchCamera = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [cameraRes, zonesRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/cameras/${cameraId}`, {
          headers: getAuthHeaders(),
        }),
        fetch(`${API_URL}/api/v1/cameras/${cameraId}/zones`, {
          headers: getAuthHeaders(),
        }),
      ]);
      const cameraJson = await cameraRes.json();
      if (!cameraJson.success || !cameraJson.data) {
        if (!silent) setError(cameraJson.error?.message ?? "Camera not found");
        return;
      }
      const rawCamera = cameraJson.data as Record<string, unknown>;
      setCamera(
        isSnakeCaseRow(rawCamera)
          ? transformCamera(rawCamera)
          : (rawCamera as unknown as CameraType),
      );

      const zonesJson = await zonesRes.json();
      if (zonesJson.success && zonesJson.data) {
        setZones(transformZones(zonesJson.data as Record<string, unknown>[]));
      }
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Network error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [cameraId]);

  useEffect(() => {
    fetchCamera();
  }, [fetchCamera]);

  // Poll camera status while connecting — silent fetch so the page never flickers
  useEffect(() => {
    if (!camera || camera.status === "online" || camera.status === "disabled") return;
    const interval = setInterval(() => fetchCamera(true), 5000);
    return () => clearInterval(interval);
  }, [camera, fetchCamera]);

  useEffect(() => {
    const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFSChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFSChange);
  }, []);

  // Check active recording on mount.
  // In Tauri mode the MediaRecorder is always gone after a page reload —
  // any "recording" row in Supabase is an orphan. Auto-stop it so the UI
  // starts clean and the counter doesn't show stale time.
  useEffect(() => {
    if (!cameraId) return;
    fetch(`${API_URL}/api/v1/cameras/${cameraId}/record/status`, {
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.isRecording && json.data.recording) {
          if (isTauri()) {
            // Orphan — stop it silently, don't restore UI state
            fetch(`${API_URL}/api/v1/cameras/${cameraId}/record/stop`, {
              method: "POST",
              headers: getAuthHeaders(),
            }).catch(() => {});
          } else {
            setIsRecording(true);
            setRecordingStartTime(
              new Date(json.data.recording.start_time).getTime(),
            );
          }
        }
      })
      .catch(() => {});
  }, [cameraId]);

  // Recording timer
  useEffect(() => {
    if (isRecording && recordingStartTime) {
      const tick = () =>
        setRecordingDuration(
          Math.floor((Date.now() - recordingStartTime) / 1000),
        );
      tick();
      recordingTimerRef.current = setInterval(tick, 1000);
      return () => {
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      };
    }
    setRecordingDuration(0);
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecording, recordingStartTime]);

  const toggleFullscreen = useCallback(async () => {
    if (!videoContainerRef.current) return;
    try {
      if (!document.fullscreenElement)
        await videoContainerRef.current.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  }, []);

  const handleScreenshot = useCallback(() => {
    const video = videoContainerRef.current?.querySelector("video");
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const link = document.createElement("a");
    link.download = `${camera?.name ?? "camera"}-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [camera?.name]);

  const handleToggleRecording = useCallback(async () => {
    if (!cameraId) return;

    // ── Desktop (Tauri): record via MediaRecorder, save via native Rust ──────
    if (isTauri()) {
      if (isRecording) {
        // Stopping: flip UI immediately; onstop handler will call the API once the file is saved
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
        setRecordingStartTime(null);
      } else {
        const video = videoContainerRef.current?.querySelector("video");
        if (!video) return;

        // Prefer the live WebRTC stream (no re-encode, no lag).
        // Only fall back to captureStream() if srcObject is unavailable.
        const stream =
          (video.srcObject as MediaStream | null) ??
          (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
        if (!stream) return;

        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const safeName = (camera?.name ?? cameraId).replace(/[^a-zA-Z0-9-_]/g, "_");

        recordingChunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
          ? "video/webm;codecs=vp9,opus"
          : "video/webm";

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordingChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          const blob = new Blob(recordingChunksRef.current, { type: mimeType });
          if (blob.size === 0) return;
          const recFilename = `${safeName}-${ts}.webm`;
          const invoke = (window as unknown as { __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__?.invoke;

          let savedPath: string | null = null;
          if (invoke) {
            try {
              const arrayBuffer = await blob.arrayBuffer();
              const bytes = new Uint8Array(arrayBuffer);
              let binary = "";
              bytes.forEach((b) => (binary += String.fromCharCode(b)));
              const base64 = btoa(binary);
              // Pass custom folder if set in storage settings
              savedPath = (await invoke("save_recording", {
                filename: recFilename,
                dataBase64: base64,
                customDir: recordingsPath || null,
              })) as string;
            } catch {
              // Fall through to browser download
            }
          }

          if (!savedPath) {
            // Fallback: browser download (e.g. dev mode)
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = recFilename;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }

          // Mark the Supabase row as complete (skipped in local_only mode).
          if (activeRecordingIdRef.current && saveMode !== "local_only") {
            try {
              await fetch(`${API_URL}/api/v1/cameras/${cameraId}/record/stop`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ localFilePath: savedPath, sizeBytes: blob.size }),
              });
            } catch {
              // Non-critical
            }
            activeRecordingIdRef.current = null;
          }

          if (savedPath) {
            showToast("Recording saved to your device", "success");
          }
        };

        // Tell Supabase a recording is starting (skipped in local_only mode)
        if (saveMode !== "local_only") {
          try {
            const res = await fetch(
              `${API_URL}/api/v1/cameras/${cameraId}/record/start`,
              {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ trigger: "manual" }),
              },
            );
            const json = await res.json();
            if (json.success && json.data?.recordingId) {
              activeRecordingIdRef.current = json.data.recordingId as string;
            }
          } catch {
            // Non-critical — recording still captured locally
          }
        }

        recorder.start(250);
        setIsRecording(true);
        setRecordingStartTime(Date.now());
      }
      return;
    }

    // ── Cloud: call gateway API ─────────────────────────────────────────────
    if (isRecording) {
      // Optimistic: flip UI immediately
      setIsRecording(false);
      setRecordingStartTime(null);
      try {
        const res = await fetch(
          `${API_URL}/api/v1/cameras/${cameraId}/record/stop`,
          { method: "POST", headers: getAuthHeaders() },
        );
        const json = await res.json();
        if (!json.success) {
          setIsRecording(true);
          setRecordingStartTime(Date.now());
        }
      } catch {
        setIsRecording(true);
        setRecordingStartTime(Date.now());
      }
    } else {
      // Optimistic: flip UI immediately
      setIsRecording(true);
      setRecordingStartTime(Date.now());
      try {
        const res = await fetch(
          `${API_URL}/api/v1/cameras/${cameraId}/record/start`,
          {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ trigger: "manual" }),
          },
        );
        const json = await res.json();
        if (!json.success) {
          setIsRecording(false);
          setRecordingStartTime(null);
        }
      } catch {
        setIsRecording(false);
        setRecordingStartTime(null);
      }
    }
  }, [cameraId, isRecording, camera?.name]);

  const handleTimelineSeek = useCallback(
    async (timestamp: string) => {
      const requestId = ++seekRequestIdRef.current;
      const apply = (url: string, offsetSec: number) => {
        if (requestId !== seekRequestIdRef.current) return;
        setPlaybackUrl(url);
        setPlaybackOffset(Math.max(0, offsetSec));
      };
      try {
        const seekDate = timestamp.split("T")[0] ?? "";
        const seekMs = new Date(timestamp).getTime();
        if (Number.isNaN(seekMs)) return;
        const res = await fetch(
          `${API_URL}/api/v1/recordings/timeline?cameraId=${encodeURIComponent(cameraId)}&date=${encodeURIComponent(seekDate)}`,
          { headers: getAuthHeaders() },
        );
        const json = await res.json();
        if (!json.success || !json.data?.segments) return;
        const segments = json.data.segments as {
          startTime: string;
          endTime: string | null;
          recordingId: string;
        }[];
        const match =
          segments.find((seg) => {
            const start = new Date(seg.startTime).getTime();
            const end = seg.endTime
              ? new Date(seg.endTime).getTime()
              : Infinity;
            return seekMs >= start && seekMs <= end;
          }) ??
          segments
            .filter((seg) => new Date(seg.startTime).getTime() > seekMs)
            .sort(
              (a, b) =>
                new Date(a.startTime).getTime() -
                new Date(b.startTime).getTime(),
            )[0];
        if (!match) return;
        const recRes = await fetch(
          `${API_URL}/api/v1/recordings/${match.recordingId}`,
          { headers: getAuthHeaders() },
        );
        const recJson = await recRes.json();
        if (recJson.success && recJson.data) {
          const rows = Array.isArray(recJson.data)
            ? recJson.data
            : [recJson.data];
          const recs = transformRecordings(rows as Record<string, unknown>[]);
          if (recs.length > 0 && recs[0]!.playbackUrl) {
            const offsetSec =
              (seekMs - new Date(match.startTime).getTime()) / 1000;
            // Append auth token so the video element can make range requests
            const base = recs[0]!.playbackUrl;
            const token = localStorage.getItem("osp_access_token");
            const authedUrl = token
              ? `${base}${base.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
              : base;
            apply(authedUrl, offsetSec);
          }
        }
      } catch {}
    },
    [cameraId],
  );

  useEffect(() => {
    if (!playbackUrl || !playbackVideoRef.current) return;
    const video = playbackVideoRef.current;
    const seekAndPlay = () => {
      if (playbackOffset > 0) video.currentTime = playbackOffset;
      video.play().catch(() => {});
    };
    if (video.readyState >= 1) {
      seekAndPlay();
      return () => {};
    }
    video.addEventListener("loadedmetadata", seekAndPlay, { once: true });
    return () => video.removeEventListener("loadedmetadata", seekAndPlay);
  }, [playbackUrl, playbackOffset]);

  const handleZonePolygonCreated = useCallback(
    (polygon: readonly { x: number; y: number }[]) => {
      setPendingPolygon(polygon);
      setIsDrawingZone(false);
    },
    [],
  );

  const handleZoneSave = useCallback(
    async (zone: {
      name: string;
      colorHex: string;
      alertEnabled: boolean;
      sensitivity: number;
      polygonCoordinates: readonly { x: number; y: number }[];
    }) => {
      const res = await fetch(`${API_URL}/api/v1/cameras/${cameraId}/zones`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(zone),
      });
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error?.message ?? "Failed to create zone");
      setPendingPolygon(null);
      await fetchCamera();
    },
    [cameraId, fetchCamera],
  );

  const handleZoneDeleted = useCallback(
    async (zoneId: string) => {
      try {
        await fetch(`${API_URL}/api/v1/cameras/${cameraId}/zones/${zoneId}`, {
          method: "DELETE",
          headers: getAuthHeaders(),
        });
        await fetchCamera();
      } catch {}
    },
    [cameraId, fetchCamera],
  );

  const handleToggleZoneAlert = useCallback(
    async (zoneId: string, enabled: boolean) => {
      try {
        await fetch(`${API_URL}/api/v1/cameras/${cameraId}/zones/${zoneId}`, {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({ alertEnabled: enabled }),
        });
        await fetchCamera();
      } catch {}
    },
    [cameraId, fetchCamera],
  );

  const handleReconnect = useCallback(async () => {
    if (!cameraId || reconnecting) return;
    setReconnecting(true);
    setActionError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/v1/cameras/${cameraId}/reconnect`,
        {
          method: "POST",
          headers: getAuthHeaders(),
        },
      );
      const json = await res.json();
      if (!json.success)
        setActionError(json.error?.message ?? "Failed to reconnect");
      else await fetchCamera();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Network error");
    } finally {
      setReconnecting(false);
    }
  }, [cameraId, reconnecting, fetchCamera]);

  const handleDelete = useCallback(async () => {
    if (!cameraId || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/cameras/${cameraId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (!json.success) {
        setActionError(json.error?.message ?? "Failed to delete camera");
        setDeleting(false);
      } else {
        router.push("/cameras");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Network error");
      setDeleting(false);
    }
  }, [cameraId, deleting, router]);

  useEffect(() => {
    const container = videoContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setVideoSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const formatRecDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="aspect-video bg-zinc-900 rounded-lg border border-zinc-800 animate-pulse -mx-4 lg:mx-0" />
        <div className="grid grid-cols-1 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error || !camera) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center max-w-md">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-red-400 mb-1">
            Error loading camera
          </p>
          <p className="text-xs text-zinc-500 mb-4">
            {error ?? "Camera not found"}
          </p>
          <button
            onClick={() => router.push("/cameras")}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-50 hover:border-zinc-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to cameras
          </button>
        </div>
      </div>
    );
  }

  const statusBg =
    camera.status === "online"
      ? "bg-green-500/10"
      : camera.status === "connecting"
        ? "bg-amber-500/10"
        : "bg-red-500/10";
  const statusColor =
    camera.status === "online"
      ? "text-green-400"
      : camera.status === "connecting"
        ? "text-amber-400"
        : "text-red-400";
  const statusDot =
    camera.status === "online"
      ? "bg-green-400"
      : camera.status === "connecting"
        ? "bg-amber-400"
        : "bg-red-400";

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "events", label: "Events", icon: <Bell className="w-3.5 h-3.5" /> },
    {
      id: "recording",
      label: "Recording",
      icon: <Video className="w-3.5 h-3.5" />,
    },
    {
      id: "motion",
      label: "Motion & AI",
      icon: <Brain className="w-3.5 h-3.5" />,
    },
    {
      id: "info",
      label: "Info & Zones",
      icon: <Info className="w-3.5 h-3.5" />,
    },
    {
      id: "settings",
      label: "Settings",
      icon: <Settings className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="-m-4 p-4 lg:-m-6 lg:p-6 flex flex-col gap-4 lg:grid lg:grid-cols-[3fr_2fr] lg:items-start">
      {/* ── Left column: video + timeline + playback ── */}
      <div className="flex flex-col gap-3 min-w-0">
        {/* ── Video player ── */}
        <div
          ref={videoContainerRef}
          className="relative rounded-lg overflow-hidden bg-black -mx-4 lg:mx-0"
        >
          {/* Top overlay bar */}
          <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-2 py-2 lg:px-4 lg:py-2.5 bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex items-center gap-2 lg:gap-3 min-w-0">
              <button
                onClick={() => router.push("/cameras")}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-base font-semibold text-white drop-shadow-sm truncate lg:text-lg">
                {camera.name}
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusBg} ${statusColor} backdrop-blur-sm`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                {camera.status}
              </span>
            </div>

            <div className="flex items-center gap-0.5 lg:gap-1">
              {/* Zone draw */}
              <button
                onClick={() => setIsDrawingZone((p) => !p)}
                className={`hidden lg:flex items-center gap-1 px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
                  isDrawingZone
                    ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                    : "text-zinc-300 hover:text-white hover:bg-white/10"
                }`}
                title={isDrawingZone ? "Cancel zone drawing" : "Draw zone"}
              >
                <Plus className="w-4 h-4" />
                <span className="text-xs font-medium hidden sm:inline">
                  {isDrawingZone ? "Cancel" : "Zone"}
                </span>
              </button>

              {/* Recording button */}
              <button
                onClick={handleToggleRecording}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
                  isRecording
                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    : "text-zinc-300 hover:text-white hover:bg-white/10"
                }`}
                title={isRecording ? "Stop recording" : "Start recording"}
              >
                {isRecording ? (
                  <>
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                    <span className="text-xs font-mono font-medium">
                      REC {formatRecDuration(recordingDuration)}
                    </span>
                    <Square className="w-3 h-3 fill-current" />
                  </>
                ) : (
                  <Circle className="w-4 h-4 text-red-400 fill-red-400" />
                )}
              </button>

              <button
                onClick={handleScreenshot}
                className="p-2 rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Screenshot"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? (
                  <Minimize className="w-4 h-4" />
                ) : (
                  <Maximize className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={handleReconnect}
                disabled={reconnecting}
                className="hidden lg:inline-flex p-2 rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
                title="Reconnect"
              >
                {reconnecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => router.push(`/cameras/${cameraId}/settings`)}
                className="hidden lg:inline-flex p-2 rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="hidden lg:inline-flex p-2 rounded-md text-zinc-300 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                title="Delete camera"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <LiveViewPlayer
            cameraId={camera.id}
            cameraName={camera.name}
            className="w-full aspect-video"
            twoWayAudioSupported={camera.capabilities.twoWayAudio}
          />

          <ZoneDrawer
            zones={zones}
            cameraId={camera.id}
            videoWidth={videoSize.width}
            videoHeight={videoSize.height}
            isDrawing={isDrawingZone}
            onZoneCreated={handleZonePolygonCreated}
            onZoneDeleted={handleZoneDeleted}
            onDrawingCancelled={() => setIsDrawingZone(false)}
          />

          {camera.ptzCapable && (
            <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 lg:left-auto lg:right-4 lg:translate-x-0">
              <PTZControls cameraId={camera.id} />
            </div>
          )}

          <div className="absolute bottom-4 left-4 z-10">
            <button
              onClick={handleReconnect}
              disabled={reconnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-black/50 backdrop-blur-sm text-zinc-300 hover:text-white text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {reconnecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {reconnecting ? "Reconnecting..." : "Reconnect"}
            </button>
          </div>
        </div>

        {/* ── Error banner ── */}
        {actionError && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400 flex items-center justify-between">
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="text-red-400 hover:text-red-300 text-xs underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Timeline ── */}
        <TimelineScrubber cameraId={camera.id} onSeek={handleTimelineSeek} />

        {/* ── Playback player ── */}
        {playbackUrl && (
          <div className="relative rounded-lg overflow-hidden bg-black border border-zinc-700">
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400">
                Playback
              </span>
              <button
                onClick={() => {
                  setPlaybackUrl(null);
                  setPlaybackOffset(0);
                }}
                className="px-2 py-1 text-xs rounded-md bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
            {playbackUrl.endsWith(".m3u8") ? (
              <HLSPlayer
                url={playbackUrl}
                controls
                muted={false}
                videoRef={playbackVideoRef}
                className="w-full aspect-video"
              />
            ) : (
              <video
                ref={playbackVideoRef}
                src={playbackUrl}
                controls
                className="w-full aspect-video"
              />
            )}
          </div>
        )}
      </div>
      {/* end left column */}

      {/* ── Right column: Tabs ── */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden lg:sticky lg:top-4">
        {/* Tab bar */}
        <div className="flex border-b border-zinc-800 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium shrink-0 border-b-2 transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-400 bg-blue-500/5"
                  : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="max-h-[calc(100vh-160px)] overflow-y-auto">
          {activeTab === "recording" && (
            <RecordingTab
              cameraId={camera.id}
              onPlay={(url, offset) => {
                const token = localStorage.getItem("osp_access_token");
                const authedUrl = token
                  ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
                  : url;
                setPlaybackUrl(authedUrl);
                setPlaybackOffset(offset ?? 0);
              }}
            />
          )}
          {activeTab === "motion" && (
            <MotionAITab camera={camera} onSaved={fetchCamera} />
          )}
          {activeTab === "events" && (
            <EventsTab cameraId={camera.id} onPlayClip={setClipModalUrl} />
          )}
          {activeTab === "info" && (
            <InfoTab
              camera={camera}
              zones={zones}
              onDrawZone={() => setIsDrawingZone(true)}
              onToggleZoneAlert={handleToggleZoneAlert}
            />
          )}
          {activeTab === "settings" && (
            <SettingsTab
              camera={camera}
              onSaved={fetchCamera}
              onDeleted={() => router.push("/cameras")}
            />
          )}
        </div>
      </div>

      {/* ── Zone name dialog ── */}
      {pendingPolygon && (
        <ZoneNameDialog
          cameraId={camera.id}
          polygon={pendingPolygon}
          onSave={handleZoneSave}
          onCancel={() => setPendingPolygon(null)}
        />
      )}

      {/* ── Delete confirm dialog ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setShowDeleteConfirm(false);
            }}
            role="button"
            tabIndex={-1}
            aria-label="Close dialog"
          />
          <div className="relative z-50 mx-4 w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-lg shadow-black/40 sm:mx-auto">
            <h3 className="text-base font-semibold text-zinc-50 mb-2">
              Delete Camera
            </h3>
            <p className="text-sm text-zinc-400 mb-1">
              Are you sure you want to delete{" "}
              <span className="font-medium text-zinc-200">{camera.name}</span>?
            </p>
            <p className="text-xs text-zinc-500 mb-5">
              This will remove the camera, its zones, events, and recordings.
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clip playback modal ── */}
      {clipModalUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setClipModalUrl(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setClipModalUrl(null);
            }}
            role="button"
            tabIndex={-1}
            aria-label="Close"
          />
          <div className="relative z-50 w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-lg shadow-black/40 overflow-hidden mx-4">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
              <span className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Event Clip
              </span>
              <button
                onClick={() => setClipModalUrl(null)}
                className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
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
