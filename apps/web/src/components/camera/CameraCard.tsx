"use client";

import { useState } from "react";
import Link from "next/link";
import { Maximize2, Settings } from "lucide-react";
import type { Camera } from "@osp/shared";

interface CameraCardProps {
  readonly camera: Camera;
}

function formatTime(dateString: string | null): string {
  if (!dateString) return "--:--:--";
  return new Date(dateString).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function CameraCard({ camera }: CameraCardProps) {
  const [hovered, setHovered] = useState(false);
  const isOnline = camera.status === "online";
  const isRecording = camera.config.recordingMode !== "off";

  return (
    <Link
      href={`/cameras/${camera.id}`}
      className="group block border border-zinc-800 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:ring-1 hover:ring-blue-500/30"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Video area - 16:9 */}
      <div className="relative aspect-video bg-black">
        {/* Placeholder content */}
        {!isOnline && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-zinc-600 text-sm">Offline</span>
          </div>
        )}

        {/* Bottom gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

        {/* Top-left: Live indicator */}
        {isOnline && (
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <span className="text-[10px] font-semibold text-green-400 uppercase tracking-wider">
              Live
            </span>
          </div>
        )}

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

        {/* Bottom-left: Camera name */}
        <div className="absolute bottom-2.5 left-2.5">
          <span className="text-sm font-medium text-zinc-50 drop-shadow-md">
            {camera.name}
          </span>
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
            className="p-2 rounded-full bg-zinc-900/80 text-zinc-200 backdrop-blur-sm hover:bg-zinc-800 transition-colors"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            aria-label="Fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="p-2 rounded-full bg-zinc-900/80 text-zinc-200 backdrop-blur-sm hover:bg-zinc-800 transition-colors"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
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
