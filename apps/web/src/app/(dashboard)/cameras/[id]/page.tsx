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
} from "lucide-react";
import { LiveViewPlayer } from "@/components/camera/LiveViewPlayer";
import { PTZControls } from "@/components/camera/PTZControls";
import { ZoneDrawer } from "@/components/camera/ZoneDrawer";
import { ZoneNameDialog } from "@/components/camera/ZoneNameDialog";
import { TimelineScrubber } from "@/components/camera/TimelineScrubber";
import { HLSPlayer } from "@/components/camera/HLSPlayer";
import type { Camera as CameraType, CameraZone, OSPEvent } from "@osp/shared";
import {
  transformCamera,
  transformZones,
  transformEvents,
  transformRecordings,
  isSnakeCaseRow,
} from "@/lib/transforms";

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

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never";
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

/** Mask credentials in a connection URI: rtsp://user:pass@host → rtsp://***:***@host */
function maskConnectionUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.username || parsed.password) {
      return uri.replace(
        `${parsed.username}:${parsed.password}@`,
        "***:***@",
      );
    }
    return uri;
  } catch {
    // If URL parsing fails (some RTSP URIs aren't standard), do regex masking
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
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors[severity] ?? "bg-zinc-500"}`} />
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
  const classes = colorMap[type] ?? "bg-zinc-500/15 text-zinc-400";
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${classes}`}>
      {type.replace(/_/g, " ")}
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

export default function CameraDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const cameraId = params.id;
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const [camera, setCamera] = useState<CameraType | null>(null);
  const [zones, setZones] = useState<readonly CameraZone[]>([]);
  const [events, setEvents] = useState<readonly OSPEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Clip playback state
  const [clipModalUrl, setClipModalUrl] = useState<string | null>(null);

  // Zone drawing state
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [pendingPolygon, setPendingPolygon] = useState<readonly { x: number; y: number }[] | null>(null);
  const [videoSize, setVideoSize] = useState({ width: 960, height: 540 });

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Playback state (for timeline seek → recording playback)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackOffset, setPlaybackOffset] = useState(0);
  const playbackVideoRef = useRef<HTMLVideoElement>(null);

  const fetchCamera = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cameraRes, zonesRes, eventsRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/cameras/${cameraId}`, {
          headers: getAuthHeaders(),
        }),
        fetch(`${API_URL}/api/v1/cameras/${cameraId}/zones`, {
          headers: getAuthHeaders(),
        }),
        fetch(`${API_URL}/api/v1/events?cameraId=${cameraId}&limit=20`, {
          headers: getAuthHeaders(),
        }),
      ]);

      const cameraJson = await cameraRes.json();
      if (!cameraJson.success || !cameraJson.data) {
        setError(cameraJson.error?.message ?? "Camera not found");
        return;
      }
      const rawCamera = cameraJson.data as Record<string, unknown>;
      setCamera(isSnakeCaseRow(rawCamera) ? transformCamera(rawCamera) : (rawCamera as unknown as CameraType));

      const zonesJson = await zonesRes.json();
      if (zonesJson.success && zonesJson.data) {
        setZones(transformZones(zonesJson.data as Record<string, unknown>[]));
      }

      const eventsJson = await eventsRes.json();
      if (eventsJson.success && eventsJson.data) {
        setEvents(transformEvents(eventsJson.data as Record<string, unknown>[]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [cameraId]);

  useEffect(() => {
    fetchCamera();
  }, [fetchCamera]);

  // Listen for fullscreen changes (e.g. user pressing Escape)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!videoContainerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await videoContainerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen not supported or denied
    }
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

  // Check for active recording on mount
  useEffect(() => {
    if (!cameraId) return;
    fetch(`${API_URL}/api/v1/cameras/${cameraId}/record/status`, {
      headers: getAuthHeaders(),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data?.isRecording && json.data.recording) {
          const rec = json.data.recording;
          setIsRecording(true);
          setRecordingId(rec.id);
          const startMs = new Date(rec.start_time).getTime();
          setRecordingStartTime(startMs);
        }
      })
      .catch(() => {
        // Non-critical — ignore
      });
  }, [cameraId]);

  // Recording duration timer
  useEffect(() => {
    if (isRecording && recordingStartTime) {
      const tick = () => {
        setRecordingDuration(Math.floor((Date.now() - recordingStartTime) / 1000));
      };
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

  const handleToggleRecording = useCallback(async () => {
    if (!cameraId) return;

    if (isRecording) {
      // Stop recording
      try {
        const res = await fetch(`${API_URL}/api/v1/cameras/${cameraId}/record/stop`, {
          method: "POST",
          headers: getAuthHeaders(),
        });
        const json = await res.json();
        if (json.success) {
          setIsRecording(false);
          setRecordingId(null);
          setRecordingStartTime(null);
        }
      } catch {
        // Failed to stop — ignore for now
      }
    } else {
      // Start recording
      try {
        const res = await fetch(`${API_URL}/api/v1/cameras/${cameraId}/record/start`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ trigger: "manual" }),
        });
        const json = await res.json();
        if (json.success && json.data?.recordingId) {
          setIsRecording(true);
          setRecordingId(json.data.recordingId);
          setRecordingStartTime(Date.now());
        }
      } catch {
        // Failed to start — ignore for now
      }
    }
  }, [cameraId, isRecording]);

  // Timeline seek handler — find recording containing the timestamp and play from offset
  const handleTimelineSeek = useCallback(
    async (timestamp: string) => {
      try {
        const seekDate = timestamp.split("T")[0] ?? "";
        const res = await fetch(
          `${API_URL}/api/v1/recordings/timeline?cameraId=${encodeURIComponent(cameraId)}&date=${encodeURIComponent(seekDate)}`,
          { headers: getAuthHeaders() },
        );
        const json = await res.json();
        if (!json.success || !json.data?.segments) return;

        const seekMs = new Date(timestamp).getTime();
        const segments = json.data.segments as {
          startTime: string;
          endTime: string;
          recordingId: string;
        }[];

        // Find the segment that contains the seeked timestamp
        const match = segments.find((seg) => {
          const start = new Date(seg.startTime).getTime();
          const end = new Date(seg.endTime).getTime();
          return seekMs >= start && seekMs <= end;
        });

        if (!match) {
          // No recording at this time; find the nearest recording after
          const after = segments
            .filter((seg) => new Date(seg.startTime).getTime() > seekMs)
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
          if (after.length > 0) {
            const nearest = after[0]!;
            // Fetch recording details to get playback URL
            const recRes = await fetch(
              `${API_URL}/api/v1/recordings/${nearest.recordingId}`,
              { headers: getAuthHeaders() },
            );
            const recJson = await recRes.json();
            if (recJson.success && recJson.data) {
              const rows = Array.isArray(recJson.data) ? recJson.data : [recJson.data];
              const recs = transformRecordings(rows as Record<string, unknown>[]);
              if (recs.length > 0 && recs[0]!.playbackUrl) {
                setPlaybackUrl(recs[0]!.playbackUrl);
                setPlaybackOffset(0);
              }
            }
          }
          return;
        }

        // Fetch the matched recording details
        const recRes = await fetch(
          `${API_URL}/api/v1/recordings/${match.recordingId}`,
          { headers: getAuthHeaders() },
        );
        const recJson = await recRes.json();
        if (recJson.success && recJson.data) {
          const rows = Array.isArray(recJson.data) ? recJson.data : [recJson.data];
          const recs = transformRecordings(rows as Record<string, unknown>[]);
          if (recs.length > 0 && recs[0]!.playbackUrl) {
            const offsetSec = (seekMs - new Date(match.startTime).getTime()) / 1000;
            setPlaybackUrl(recs[0]!.playbackUrl);
            setPlaybackOffset(Math.max(0, offsetSec));
          }
        }
      } catch {
        // Non-critical — ignore seek errors
      }
    },
    [cameraId],
  );

  // When playback URL/offset changes, seek the playback video
  useEffect(() => {
    if (!playbackUrl || !playbackVideoRef.current) return;
    const video = playbackVideoRef.current;
    const handleCanPlay = () => {
      if (playbackOffset > 0) {
        video.currentTime = playbackOffset;
      }
      video.play().catch(() => {
        // Autoplay blocked — user can click to play
      });
    };
    video.addEventListener("canplay", handleCanPlay, { once: true });
    return () => video.removeEventListener("canplay", handleCanPlay);
  }, [playbackUrl, playbackOffset]);

  const handleClosePlayback = useCallback(() => {
    setPlaybackUrl(null);
    setPlaybackOffset(0);
  }, []);

  // Zone drawing handlers
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
        body: JSON.stringify({
          name: zone.name,
          polygonCoordinates: zone.polygonCoordinates,
          alertEnabled: zone.alertEnabled,
          sensitivity: zone.sensitivity,
          colorHex: zone.colorHex,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? "Failed to create zone");
      }
      setPendingPolygon(null);
      // Refresh zones
      await fetchCamera();
    },
    [cameraId, fetchCamera],
  );

  const handleZoneDeleted = useCallback(
    async (zoneId: string) => {
      try {
        const res = await fetch(
          `${API_URL}/api/v1/cameras/${cameraId}/zones/${zoneId}`,
          { method: "DELETE", headers: getAuthHeaders() },
        );
        const json = await res.json();
        if (json.success) {
          await fetchCamera();
        }
      } catch {
        // Non-critical
      }
    },
    [cameraId, fetchCamera],
  );

  // Track video container size for zone overlay
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

  // Reconnect / Delete state
  const [reconnecting, setReconnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleReconnect = useCallback(async () => {
    if (!cameraId || reconnecting) return;
    setReconnecting(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/cameras/${cameraId}/reconnect`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (!json.success) {
        setActionError(json.error?.message ?? "Failed to reconnect");
      } else {
        // Refresh camera data to reflect new status
        await fetchCamera();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Network error");
    } finally {
      setReconnecting(false);
    }
  }, [cameraId, reconnecting, fetchCamera]);

  const handleDelete = useCallback(async () => {
    if (!cameraId || deleting) return;
    setDeleting(true);
    setActionError(null);
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
        // Redirect to cameras list
        router.push("/cameras");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Network error");
      setDeleting(false);
    }
  }, [cameraId, deleting, router]);

  const formatRecDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Loading skeleton
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

  // Error state
  if (error || !camera) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center max-w-md">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-red-400 mb-1">Error loading camera</p>
          <p className="text-xs text-zinc-500 mb-4">{error ?? "Camera not found"}</p>
          <button
            onClick={() => router.push("/cameras")}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-50 hover:border-zinc-600 transition-colors duration-150 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to cameras
          </button>
        </div>
      </div>
    );
  }

  const statusColor = camera.status === "online"
    ? "text-green-400"
    : camera.status === "connecting"
      ? "text-amber-400"
      : "text-red-400";
  const statusBg = camera.status === "online"
    ? "bg-green-500/10"
    : camera.status === "connecting"
      ? "bg-amber-500/10"
      : "bg-red-500/10";
  const statusDot = camera.status === "online"
    ? "bg-green-400"
    : camera.status === "connecting"
      ? "bg-amber-400"
      : "bg-red-400";

  return (
    <div className="flex flex-col gap-4 -m-4 p-4 lg:-m-6 lg:p-6">
      {/* Video area with overlay header */}
      <div ref={videoContainerRef} className="relative rounded-lg overflow-hidden bg-black -mx-4 lg:mx-0">
        {/* Overlay top bar — sits on top of the video */}
        <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-2 py-2 lg:px-4 lg:py-2.5 bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-2 lg:gap-3 min-w-0">
            <button
              onClick={() => router.push("/cameras")}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              aria-label="Back to cameras"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-semibold text-white drop-shadow-sm truncate lg:text-lg">{camera.name}</h1>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusBg} ${statusColor} backdrop-blur-sm`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
              {camera.status}
            </span>
          </div>

          <div className="flex items-center gap-0.5 lg:gap-1">
            {/* Draw zone button (hidden on mobile — available in zone panel below) */}
            <button
              onClick={() => setIsDrawingZone((prev) => !prev)}
              className={`hidden lg:flex items-center gap-1 px-2 py-1.5 rounded-md transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                isDrawingZone
                  ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                  : "text-zinc-300 hover:text-white hover:bg-white/10"
              }`}
              aria-label={isDrawingZone ? "Cancel zone drawing" : "Draw zone"}
              title={isDrawingZone ? "Cancel zone drawing" : "Draw zone on video"}
            >
              <Plus className="w-4 h-4" />
              <span className="text-xs font-medium hidden sm:inline">
                {isDrawingZone ? "Cancel" : "Zone"}
              </span>
            </button>
            {/* Recording indicator + button */}
            <button
              onClick={handleToggleRecording}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 ${
                isRecording
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  : "text-zinc-300 hover:text-white hover:bg-white/10"
              }`}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
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
              className="p-2 rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              aria-label="Screenshot"
              title="Save screenshot"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
            <button
              onClick={handleReconnect}
              disabled={reconnecting}
              className="hidden lg:inline-flex p-2 rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:opacity-50"
              aria-label="Reconnect stream"
              title="Reconnect stream"
            >
              {reconnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => router.push(`/cameras/${cameraId}/settings`)}
              className="hidden lg:inline-flex p-2 rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              aria-label="Settings"
              title="Camera settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="hidden lg:inline-flex p-2 rounded-md text-zinc-300 hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
              aria-label="Delete camera"
              title="Delete camera"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live video player */}
        <LiveViewPlayer
          cameraId={camera.id}
          cameraName={camera.name}
          className="w-full aspect-video"
          twoWayAudioSupported={camera.capabilities.twoWayAudio}
        />

        {/* Zone drawing overlay */}
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

        {/* PTZ overlay — only if camera is PTZ-capable */}
        {camera.ptzCapable && (
          <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 lg:left-auto lg:right-4 lg:translate-x-0">
            <PTZControls
              cameraId={camera.id}
            />
          </div>
        )}

        {/* Reconnect overlay button (bottom-left) */}
        <div className="absolute bottom-4 left-4 z-10">
          <button
            onClick={handleReconnect}
            disabled={reconnecting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-black/50 backdrop-blur-sm text-zinc-300 hover:text-white text-xs transition-colors duration-150 cursor-pointer disabled:opacity-50"
            title="Reconnect stream"
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

      {/* Action error banner */}
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

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-[fadeIn_150ms_ease-out]">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}
            onKeyDown={(e) => { if (e.key === "Escape") setShowDeleteConfirm(false); }}
            role="button"
            tabIndex={-1}
            aria-label="Close dialog"
          />
          <div className="relative z-50 mx-4 w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-lg shadow-black/40 sm:mx-auto">
            <h3 className="text-base font-semibold text-zinc-50 mb-2">Delete Camera</h3>
            <p className="text-sm text-zinc-400 mb-1">
              Are you sure you want to delete <span className="font-medium text-zinc-200">{camera.name}</span>?
            </p>
            <p className="text-xs text-zinc-500 mb-5">
              This will remove the camera, its zones, events, and recordings. This action cannot be undone.
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

      {/* Timeline Scrubber */}
      <TimelineScrubber
        cameraId={camera.id}
        onSeek={handleTimelineSeek}
      />

      {/* Recording playback overlay */}
      {playbackUrl && (
        <div className="relative rounded-lg overflow-hidden bg-black border border-zinc-700">
          <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400">
              Playback
            </span>
            <button
              onClick={handleClosePlayback}
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

      {/* Zone name dialog */}
      {pendingPolygon && (
        <ZoneNameDialog
          cameraId={camera.id}
          polygon={pendingPolygon}
          onSave={handleZoneSave}
          onCancel={() => setPendingPolygon(null)}
        />
      )}

      {/* Info panels below video */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Camera Details */}
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Camera Details
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Name</dt>
              <dd className="text-zinc-200 font-medium">{camera.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Protocol</dt>
              <dd className="text-zinc-200 font-medium uppercase">{camera.protocol}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-zinc-500">Status</dt>
              <dd className={`inline-flex items-center gap-1.5 font-medium capitalize ${statusColor}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                {camera.status}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 shrink-0">Connection</dt>
              <dd
                className="text-zinc-400 text-xs truncate"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                title={maskConnectionUri(camera.connectionUri)}
              >
                {maskConnectionUri(camera.connectionUri)}
              </dd>
            </div>
            {camera.manufacturer && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">Manufacturer</dt>
                <dd className="text-zinc-200 font-medium">{camera.manufacturer}</dd>
              </div>
            )}
            {camera.model && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">Model</dt>
                <dd className="text-zinc-200 font-medium">{camera.model}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-zinc-500">Last Seen</dt>
              <dd
                className="text-zinc-200 font-medium"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {formatRelativeTime(camera.lastSeenAt)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Zones */}
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Zones ({zones.length})
            </h3>
            <button
              onClick={() => setIsDrawingZone(true)}
              className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-md transition-colors duration-150 cursor-pointer ${
                isDrawingZone
                  ? "bg-blue-500/30 text-blue-300 ring-1 ring-blue-500/50"
                  : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
              }`}
            >
              <Plus className="w-3 h-3" />
              {isDrawingZone ? "Drawing..." : "Draw Zone"}
            </button>
          </div>
          {zones.length === 0 ? (
            <p className="text-xs text-zinc-500 py-6 text-center">
              No zones configured
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
                    <span className="text-xs font-medium text-zinc-200">{zone.name}</span>
                  </div>
                  <button
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

        {/* Events */}
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 flex flex-col max-h-80">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Events ({events.length})
          </h3>
          {events.length === 0 ? (
            <p className="text-xs text-zinc-500 py-6 text-center">
              No events yet
            </p>
          ) : (
            <div className="flex-1 overflow-y-auto -mx-4 px-4 space-y-1">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-zinc-800/50 transition-colors duration-150 cursor-pointer"
                >
                  <SeverityDot severity={event.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <EventTypeBadge type={event.type} />
                      {event.zoneName && (
                        <span className="text-[10px] text-zinc-500 truncate">
                          {event.zoneName}
                        </span>
                      )}
                    </div>
                  </div>
                  {event.clipUrl && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setClipModalUrl(event.clipUrl);
                      }}
                      className="p-1 text-zinc-500 hover:text-blue-400 transition-colors duration-150 cursor-pointer shrink-0"
                      aria-label="Play event clip"
                      title="Play event clip"
                    >
                      <Play className="w-3 h-3" />
                    </button>
                  )}
                  <span
                    className="text-[10px] text-zinc-500 shrink-0"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {formatRelativeTime(event.detectedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Clip playback modal */}
      {clipModalUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-[fadeIn_150ms_ease-out]">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setClipModalUrl(null)}
            onKeyDown={(e) => { if (e.key === "Escape") setClipModalUrl(null); }}
            role="button"
            tabIndex={-1}
            aria-label="Close clip player"
          />
          <div className="relative z-50 w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-lg shadow-black/40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
              <span className="text-sm font-medium text-zinc-200">Event Clip</span>
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
