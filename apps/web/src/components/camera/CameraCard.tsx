"use client";

import { useState, useEffect, useRef, memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Maximize2, Settings, MapPin, Check, Usb } from "lucide-react";
import type { Camera } from "@osp/shared";
import { getToken } from "@/hooks/use-auth";
import type { CameraTag } from "@/hooks/use-tags";
import { isTauri } from "@/lib/tauri";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

interface CameraCardProps {
  readonly camera: Camera;
  readonly locationName?: string;
  readonly selectable?: boolean;
  readonly selected?: boolean;
  readonly onToggleSelect?: (cameraId: string) => void;
  readonly tags?: readonly CameraTag[];
  readonly isActivelyRecording?: boolean;
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
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      // Don't clear existing snapshot — avoids flash to black
      // when camera briefly goes connecting->online
      return;
    }

    let cancelled = false;

    const fetchSnapshot = async () => {
      // Guard against overlapping fetches (e.g., slow network)
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      try {
        let res: Response;
        if (isTauri()) {
          res = await fetch(
            `http://localhost:1984/api/frame.jpeg?src=${encodeURIComponent(cameraId)}`,
          );
        } else {
          const token = getToken();
          if (!token) return;
          res = await fetch(`${API_URL}/api/v1/cameras/${cameraId}/snapshot`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }

        if (res.ok && !cancelled) {
          const blob = await res.blob();
          const nextUrl = URL.createObjectURL(blob);

          // Preload and decode the image before swapping the visible src.
          // Using decode() ensures the frame is fully rasterized, preventing
          // any blank frame flash during the swap.
          const img = new Image();
          img.src = nextUrl;
          try {
            await img.decode();
          } catch {
            // decode() can fail for some formats — fall back to onload timing
          }

          if (cancelled) {
            URL.revokeObjectURL(nextUrl);
            return;
          }

          const oldUrl = prevUrlRef.current;
          prevUrlRef.current = nextUrl;
          setSnapshotUrl(nextUrl);

          // Revoke old URL after browser has painted the new frame
          if (oldUrl) {
            requestAnimationFrame(() => {
              setTimeout(() => URL.revokeObjectURL(oldUrl), 100);
            });
          }
        }
      } catch {
        // Snapshot unavailable — keep current image, no flicker
      } finally {
        fetchingRef.current = false;
      }
    };

    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      fetchingRef.current = false;
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

function getStatusConfig(status: string, lastSeenAt: string | null) {
  // A camera that has never been seen by the agent (lastSeenAt null) is still
  // initializing — treat error/offline as connecting so the user sees a spinner
  // instead of a permanent red "Error" state on first add.
  if ((status === "error" || status === "offline") && lastSeenAt === null) {
    return STATUS_CONFIG["connecting"]!;
  }
  return (STATUS_CONFIG[status] ?? STATUS_CONFIG["offline"])!;
}

export const CameraCard = memo(function CameraCard({
  camera,
  selectable = false,
  selected = false,
  onToggleSelect,
  tags = [],
  isActivelyRecording = false,
}: CameraCardProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const isOnline = camera.status === "online";
  const isRecording =
    isActivelyRecording || camera.config.recordingMode !== "off";
  const statusCfg = getStatusConfig(camera.status, camera.lastSeenAt ?? null);
  const effectiveStatus = statusCfg.label === "CONNECTING" ? "connecting" : camera.status;
  const snapshotUrl = useSnapshotUrl(
    camera.id,
    isOnline || effectiveStatus === "connecting",
  );

  const showCheckbox = selectable && (hovered || selected);

  const handleClick = (e: React.MouseEvent) => {
    if (selectable && onToggleSelect) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect(camera.id);
    }
  };

  const cardContent = (
    <div
      className={`relative aspect-video bg-black ${selected ? "ring-2 ring-blue-500" : ""}`}
      onClick={selectable ? handleClick : undefined}
    >
      {/* Snapshot preview — always render img to avoid mount/unmount flicker */}
      <img
        src={snapshotUrl ?? undefined}
        alt={`${camera.name} live preview`}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
          snapshotUrl ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* Placeholder shown when no snapshot is available */}
      {!snapshotUrl && (
        <div className="absolute inset-0 flex items-center justify-center">
          {effectiveStatus === "connecting" ? (
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

      {/* Selected overlay */}
      {selected && (
        <div className="absolute inset-0 bg-blue-500/10 pointer-events-none" />
      )}

      {/* Bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

      {/* Selection checkbox */}
      {showCheckbox && (
        <button
          type="button"
          className={`absolute top-2.5 left-10 z-10 flex h-5 w-5 items-center justify-center rounded border transition-colors cursor-pointer ${
            selected
              ? "bg-blue-500 border-blue-500 text-white"
              : "bg-zinc-900/80 border-zinc-500 text-transparent hover:border-blue-400"
          }`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect?.(camera.id);
          }}
          aria-label={selected ? "Deselect camera" : "Select camera"}
        >
          {selected && <Check className="h-3 w-3" />}
        </button>
      )}

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
        {camera.protocol === "usb" && (
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 backdrop-blur-sm">
            <Usb className="h-2.5 w-2.5" />
            USB
          </span>
        )}
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
        {isActivelyRecording ? (
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-600/30 text-red-300 backdrop-blur-sm ring-1 ring-red-500/40">
            <span className="relative h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            REC
          </span>
        ) : isRecording ? (
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            REC
          </span>
        ) : null}
      </div>

      {/* Bottom-left: Camera name + location + tags */}
      <div className="absolute bottom-2.5 left-2.5 max-w-[70%]">
        <span className="text-sm font-medium text-zinc-50 drop-shadow-md">
          {camera.name}
        </span>
        {camera.location?.label && (
          <span className="flex items-center gap-1 mt-0.5 text-[10px] text-zinc-400 drop-shadow-md">
            <MapPin className="h-2.5 w-2.5" />
            {camera.location.label}
          </span>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium text-white drop-shadow-md"
                style={{ backgroundColor: `${tag.color}CC` }}
              >
                {tag.name}
              </span>
            ))}
          </div>
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

      {/* Hover actions (hide when in selection mode) */}
      {!selectable && (
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
      )}
    </div>
  );

  if (selectable) {
    return (
      <div
        className={`group block border rounded-lg overflow-hidden cursor-pointer transition-all duration-200 ${
          selected
            ? "border-blue-500"
            : "border-zinc-800 hover:ring-1 hover:ring-blue-500/30"
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <Link
      href={`/cameras/${camera.id}`}
      className="group block border border-zinc-800 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:ring-1 hover:ring-blue-500/30"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {cardContent}
    </Link>
  );
});

export function CameraCardSkeleton() {
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <div className="aspect-video bg-zinc-900 animate-pulse" />
    </div>
  );
}
