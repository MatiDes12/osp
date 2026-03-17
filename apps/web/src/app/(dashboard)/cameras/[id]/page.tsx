"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Share2,
  Download,
  Settings,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Camera,
  Maximize,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { StatusIndicator } from "@osp/ui";
import { LiveViewPlayer } from "@/components/camera/LiveViewPlayer";
import { TimelineScrubber } from "@/components/camera/TimelineScrubber";
import { PTZControls } from "@/components/camera/PTZControls";
import type { Camera as CameraType, CameraZone, OSPEvent, ApiResponse } from "@osp/shared";
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

const PLAYBACK_SPEEDS = [0.5, 1, 2, 4, 8] as const;

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

  const [camera, setCamera] = useState<CameraType | null>(null);
  const [zones, setZones] = useState<readonly CameraZone[]>([]);
  const [events, setEvents] = useState<readonly OSPEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [timelineRange, setTimelineRange] = useState<"1h" | "6h" | "12h" | "24h">("24h");
  const [timelinePosition, setTimelinePosition] = useState(50);

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

  const cycleSpeed = useCallback(() => {
    setPlaybackSpeed((prev: number) => {
      const idx = PLAYBACK_SPEEDS.indexOf(prev as (typeof PLAYBACK_SPEEDS)[number]);
      const next = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length];
      return next ?? 1;
    });
  }, []);

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-4">
        {/* Top bar skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-800 rounded animate-pulse" />
            <div className="h-5 w-40 bg-zinc-800 rounded animate-pulse" />
            <div className="h-5 w-16 bg-zinc-800 rounded-full animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-zinc-800 rounded animate-pulse" />
            <div className="w-8 h-8 bg-zinc-800 rounded animate-pulse" />
            <div className="w-8 h-8 bg-zinc-800 rounded animate-pulse" />
          </div>
        </div>
        {/* Video skeleton */}
        <div className="aspect-video bg-zinc-900 rounded-lg border border-zinc-800 animate-pulse" />
        {/* Timeline skeleton */}
        <div className="h-12 bg-zinc-900 rounded-lg border border-zinc-800 animate-pulse" />
        {/* Controls skeleton */}
        <div className="h-10 bg-zinc-900 rounded-lg border border-zinc-800 animate-pulse" />
      </div>
    );
  }

  // Error state
  if (error || !camera) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center max-w-md">
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

  const statusColor = camera.status === "online" ? "text-green-400" : "text-red-400";
  const statusBg = camera.status === "online" ? "bg-green-500/10" : "bg-red-500/10";

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] -m-6">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/cameras")}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            aria-label="Back to cameras"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-zinc-50">{camera.name}</h1>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusBg} ${statusColor}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${camera.status === "online" ? "bg-green-400" : "bg-red-400"}`} />
            {camera.status}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="p-2 rounded-md text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            aria-label="Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            className="p-2 rounded-md text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            aria-label="Download"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            className="p-2 rounded-md text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main content: video + optional sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Video column */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Video area */}
          <div className="relative flex-1 bg-black min-h-0">
            <LiveViewPlayer
              cameraId={camera.id}
              cameraName={camera.name}
              className="w-full h-full"
            />

            {/* PTZ overlay */}
            {camera.ptzCapable && (
              <div className="absolute bottom-4 right-4 z-10">
                <PTZControls
                  onMove={(dir) => console.log("PTZ move:", dir)}
                  onZoom={(z) => console.log("PTZ zoom:", z)}
                />
              </div>
            )}
          </div>

          {/* Timeline scrubber */}
          <div className="shrink-0 px-3 py-2 bg-zinc-950 border-t border-zinc-800">
            <TimelineScrubber
              currentTime={timelinePosition}
              range={timelineRange}
              onRangeChange={setTimelineRange}
              onSeek={setTimelinePosition}
              segments={[
                { startPercent: 10, endPercent: 35, type: "recording" },
                { startPercent: 45, endPercent: 70, type: "recording" },
                { startPercent: 75, endPercent: 90, type: "recording" },
                { startPercent: 22, endPercent: 24, type: "motion" },
                { startPercent: 55, endPercent: 57, type: "motion" },
                { startPercent: 62, endPercent: 63, type: "ai" },
                { startPercent: 82, endPercent: 84, type: "ai" },
              ]}
            />
          </div>

          {/* Controls bar */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-zinc-900 border-t border-zinc-800">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsPlaying((p) => !p)}
                className="p-2 rounded-md text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                className="p-2 rounded-md text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                aria-label="Skip back 10 seconds"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                className="p-2 rounded-md text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                aria-label="Skip forward 10 seconds"
              >
                <SkipForward className="w-4 h-4" />
              </button>
              <button
                onClick={cycleSpeed}
                className="px-2 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                aria-label="Playback speed"
              >
                {playbackSpeed}x
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                className="p-2 rounded-md text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                aria-label="Volume"
              >
                <Volume2 className="w-4 h-4" />
              </button>
              <button
                className="p-2 rounded-md text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                aria-label="Screenshot"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button
                className="p-2 rounded-md text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                aria-label="Download clip"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                className="p-2 rounded-md text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                aria-label="Fullscreen"
              >
                <Maximize className="w-4 h-4" />
              </button>

              {/* Sidebar toggle */}
              <div className="w-px h-5 bg-zinc-700 mx-1" />
              <button
                onClick={() => setSidebarOpen((o) => !o)}
                className="p-2 rounded-md text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                aria-label={sidebarOpen ? "Hide events panel" : "Show events panel"}
              >
                {sidebarOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right sidebar: Events */}
        {sidebarOpen && (
          <aside className="hidden lg:flex flex-col w-80 border-l border-zinc-800 bg-zinc-950 shrink-0">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-50">Events</h2>
              <p className="text-[10px] text-zinc-500 mt-0.5">{events.length} recent events</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                  <p className="text-xs">No events for this camera</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/50">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors duration-150 cursor-pointer"
                    >
                      {/* Thumbnail */}
                      {event.snapshotUrl ? (
                        <img
                          src={event.snapshotUrl}
                          alt=""
                          className="w-12 h-12 rounded bg-zinc-800 object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                          <SeverityDot severity={event.severity} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-200 capitalize truncate">
                          {event.type.replace("_", " ")}
                        </p>
                        {event.zoneName && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 text-[10px] rounded-full bg-zinc-800 text-zinc-400">
                            {event.zoneName}
                          </span>
                        )}
                        <p
                          className="text-[10px] text-zinc-500 mt-0.5"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {formatRelativeTime(event.detectedAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Camera info + Zones (below video area) */}
      <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 py-4 overflow-y-auto max-h-64">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Camera details card */}
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Camera Details
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {[
                ["Protocol", camera.protocol.toUpperCase()],
                ["Resolution", camera.capabilities?.resolution ?? "Unknown"],
                ["Manufacturer", camera.manufacturer ?? "Unknown"],
                ["Model", camera.model ?? "Unknown"],
                ["Firmware", camera.firmwareVersion ?? "N/A"],
                ["Location", camera.location?.label ?? "Not set"],
                ["Recording", camera.config.recordingMode],
                ["Last Seen", formatRelativeTime(camera.lastSeenAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-1">
                  <span className="text-zinc-500">{label}</span>
                  <span className="text-zinc-200 font-medium capitalize">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Zones card */}
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Zones ({zones.length})
              </h3>
              <button className="px-2 py-1 text-[10px] rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors duration-150 cursor-pointer">
                Add Zone
              </button>
            </div>
            {zones.length === 0 ? (
              <p className="text-xs text-zinc-500 py-3 text-center">
                No detection zones configured.
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
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-zinc-500">
                        Sensitivity {zone.sensitivity}/10
                      </span>
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
