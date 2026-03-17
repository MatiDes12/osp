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
} from "lucide-react";
import { LiveViewPlayer } from "@/components/camera/LiveViewPlayer";
import { PTZControls } from "@/components/camera/PTZControls";
import type { Camera as CameraType, CameraZone, OSPEvent } from "@osp/shared";
import {
  transformCamera,
  transformZones,
  transformEvents,
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

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="aspect-video bg-zinc-900 rounded-lg border border-zinc-800 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
    <div className="flex flex-col gap-4 -m-6 p-6">
      {/* Video area with overlay header */}
      <div ref={videoContainerRef} className="relative rounded-lg overflow-hidden bg-black">
        {/* Overlay top bar — sits on top of the video */}
        <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-2.5 bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/cameras")}
              className="p-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              aria-label="Back to cameras"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-white drop-shadow-sm">{camera.name}</h1>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusBg} ${statusColor} backdrop-blur-sm`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
              {camera.status}
            </span>
          </div>

          <div className="flex items-center gap-1">
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
              onClick={() => router.push(`/cameras/${cameraId}/settings`)}
              className="p-2 rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              aria-label="Settings"
              title="Camera settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live video player */}
        <LiveViewPlayer
          cameraId={camera.id}
          cameraName={camera.name}
          className="w-full aspect-video"
        />

        {/* PTZ overlay — only if camera is PTZ-capable */}
        {camera.ptzCapable && (
          <div className="absolute bottom-4 right-4 z-10">
            <PTZControls
              onMove={(dir) => console.log("PTZ move:", dir)}
              onZoom={(z) => console.log("PTZ zoom:", z)}
            />
          </div>
        )}

        {/* Reconnect overlay button (bottom-left) */}
        <div className="absolute bottom-4 left-4 z-10">
          <button
            onClick={fetchCamera}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-black/50 backdrop-blur-sm text-zinc-300 hover:text-white text-xs transition-colors duration-150 cursor-pointer"
            title="Reconnect stream"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reconnect
          </button>
        </div>
      </div>

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
            <button className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors duration-150 cursor-pointer">
              <Plus className="w-3 h-3" />
              Add Zone
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
    </div>
  );
}
