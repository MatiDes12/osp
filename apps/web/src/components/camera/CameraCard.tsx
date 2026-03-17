"use client";

import Link from "next/link";
import type { Camera } from "@osp/shared";
import { StatusIndicator } from "@osp/ui";

interface CameraCardProps {
  readonly camera: Camera;
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

const PROTOCOL_COLORS: Record<string, string> = {
  rtsp: "bg-blue-500/20 text-blue-400",
  onvif: "bg-purple-500/20 text-purple-400",
  webrtc: "bg-green-500/20 text-green-400",
  usb: "bg-orange-500/20 text-orange-400",
  ip: "bg-cyan-500/20 text-cyan-400",
};

export function CameraCard({ camera }: CameraCardProps) {
  return (
    <Link
      href={`/cameras/${camera.id}`}
      className="group block rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden transition-colors hover:border-[var(--color-primary)]/50"
    >
      {/* Thumbnail placeholder */}
      <div className="aspect-video bg-black flex items-center justify-center relative">
        <span className="text-[var(--color-muted)] text-sm">{camera.name}</span>
        <div className="absolute top-2 right-2">
          <StatusIndicator status={camera.status} size="sm" />
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium truncate">{camera.name}</h3>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${
              PROTOCOL_COLORS[camera.protocol] ?? "bg-gray-500/20 text-gray-400"
            }`}
          >
            {camera.protocol}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
          <StatusIndicator status={camera.status} size="sm" label />
          <span>{formatRelativeTime(camera.lastSeenAt)}</span>
        </div>
      </div>
    </Link>
  );
}
