"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Maximize2, Settings, MapPin } from "lucide-react";
import type { Camera } from "@osp/shared";
import { getToken } from "@/hooks/use-auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

interface CameraCardProps {
  readonly camera: Camera;
  readonly locationName?: string;
}

function formatTime(dateString: string | null): string {
  if (!dateString) return "--:--:--";
  return new Date(dateString).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function useSnapshotUrl(cameraId: string, enabled: boolean): string | null {
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSnapshotUrl(null);
      return;
    }

    let cancelled = false;

    const fetchSnapshot = async () => {
      try {
        const token = getToken();
        if (!token) return;

        const res = await fetch(
          `${API_URL}/api/v1/cameras/${cameraId}/snapshot`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (res.ok && !cancelled) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);

          // Revoke the previous object URL to avoid memory leaks
          if (prevUrlRef.current) {
            URL.revokeObjectURL(prevUrlRef.current);
          }
          prevUrlRef.current = url;
          setSnapshotUrl(url);
        }
      } catch {
        // Snapshot unavailable — keep current image or show placeholder
      }
    };

    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
    };
  }, [cameraId, enabled]);

  return snapshotUrl;
}

const STATUS_CONFIG: Record<
  string,
  { dotClass: string; badgeClass: string; label: string; ping?: boolean }
> = {
  online: {
    dotClass: "bg-green-500",
    badgeClass: "text-green-400",
    label: "LIVE",
    ping: true,
  },
  connecting: {
    dotClass: "bg-blue-500",
    badgeClass: "text-blue-400",
    label: "CONNECTING",
    ping: true,
  },
  offline: {
    dotClass: "bg-red-500",
    badgeClass: "text-red-400",
    label: "OFFLINE",
  },
  error: {
    dotClass: "bg-red-500",
    badgeClass: "text-red-400",
    label: "ERROR",
  },
};

function getStatusConfig(status: string) {
  return (STATUS_CONFIG[status] ?? STATUS_CONFIG["offline"])!;
}

export function CameraCard({ camera }: CameraCardProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const isOnline = camera.status === "online";
  const isRecording = camera.config.recordingMode !== "off";
  const snapshotUrl = useSnapshotUrl(camera.id, isOnline || camera.status === "connecting");
  const statusCfg = getStatusConfig(camera.status);

  return (
    <Link
      href={`/cameras/${camera.id}`}
      className="group block border border-zinc-800 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:ring-1 hover:ring-blue-500/30"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Video area - 16:9 */}
      <div className="relative aspect-video bg-black">
        {/* Snapshot preview */}
        {snapshotUrl ? (
          <img
            src={snapshotUrl}
            alt={`${camera.name} live preview`}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {camera.status === "connecting" ? (
              <div className="h-6 w-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            ) : !isOnline ? (
              <span className="text-zinc-600 text-sm">
                {camera.status === "error" ? "Error" : "Offline"}
              </span>
            ) : (
              <div className="h-6 w-6 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        )}

        {/* Bottom gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

        {/* Top-left: Status indicator */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            {statusCfg.ping && (
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full ${statusCfg.dotClass} opacity-75`}
              />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${statusCfg.dotClass}`}
            />
          </span>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider ${statusCfg.badgeClass}`}
          >
            {statusCfg.label}
          </span>
        </div>

        {/* Top-right: Badges */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          {camera.capabilities.resolution && (
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-900/80 text-zinc-300 backdrop-blur-sm">
              {camera.capabilities.resolution.includes("1080") ||
              camera.capabilities.resolution.includes("1920")
                ? "HD"
                : camera.capabilities.resolution.includes("4K") ||
                    camera.capabilities.resolution.includes("3840")
                  ? "4K"
                  : "SD"}
            </span>
          )}
          {isRecording && (
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              REC
            </span>
          )}
        </div>

        {/* Bottom-left: Camera name + location */}
        <div className="absolute bottom-2.5 left-2.5">
          <span className="text-sm font-medium text-zinc-50 drop-shadow-md">
            {camera.name}
          </span>
          {camera.location?.label && (
            <span className="flex items-center gap-1 mt-0.5 text-[10px] text-zinc-400 drop-shadow-md">
              <MapPin className="h-2.5 w-2.5" />
              {camera.location.label}
            </span>
          )}
        </div>

        {/* Bottom-right: Timestamp */}
        <div className="absolute bottom-2.5 right-2.5">
          <span
            className="text-xs text-zinc-400 drop-shadow-md"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {formatTime(camera.lastSeenAt)}
          </span>
        </div>

        {/* Hover actions */}
        <div
          className={`absolute inset-0 flex items-center justify-center gap-3 bg-black/20 transition-opacity duration-200 ${
            hovered ? "opacity-100" : "opacity-0"
          }`}
        >
          <button
            type="button"
            className="p-2 rounded-full bg-zinc-900/80 text-zinc-200 backdrop-blur-sm hover:bg-zinc-800 transition-colors cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.open(`/cameras/${camera.id}`, "_blank");
            }}
            aria-label="Fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="p-2 rounded-full bg-zinc-900/80 text-zinc-200 backdrop-blur-sm hover:bg-zinc-800 transition-colors cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/cameras/${camera.id}?tab=settings`);
            }}
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Link>
  );
}

export function CameraCardSkeleton() {
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <div className="aspect-video bg-zinc-900 animate-pulse" />
    </div>
  );
}
