"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  User,
  Car,
  Bug,
  Package,
  WifiOff,
  Wifi,
  Volume2,
  AlertTriangle,
} from "lucide-react";
import { useEventStream } from "@/hooks/use-event-stream";
import type { OSPEvent } from "@osp/shared";

const MAX_VISIBLE = 5;

function getEventIcon(type: string) {
  switch (type) {
    case "motion":
      return Activity;
    case "person":
      return User;
    case "vehicle":
      return Car;
    case "animal":
      return Bug;
    case "package":
      return Package;
    case "camera_offline":
      return WifiOff;
    case "camera_online":
      return Wifi;
    case "audio":
      return Volume2;
    case "tampering":
      return AlertTriangle;
    default:
      return Activity;
  }
}

function getEventColor(type: string): string {
  switch (type) {
    case "motion":
      return "bg-blue-500/15 text-blue-400 border-blue-500/20";
    case "person":
      return "bg-purple-500/15 text-purple-400 border-purple-500/20";
    case "vehicle":
      return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    case "animal":
      return "bg-green-500/15 text-green-400 border-green-500/20";
    case "package":
      return "bg-orange-500/15 text-orange-400 border-orange-500/20";
    case "camera_offline":
      return "bg-red-500/15 text-red-400 border-red-500/20";
    case "camera_online":
      return "bg-green-500/15 text-green-400 border-green-500/20";
    case "audio":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/20";
    case "tampering":
      return "bg-red-500/15 text-red-400 border-red-500/20";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
  }
}

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function formatEventLabel(type: string): string {
  switch (type) {
    case "motion":
      return "Motion";
    case "person":
      return "Person";
    case "vehicle":
      return "Vehicle";
    case "animal":
      return "Animal";
    case "package":
      return "Package";
    case "camera_offline":
      return "Offline";
    case "camera_online":
      return "Online";
    case "audio":
      return "Audio";
    case "tampering":
      return "Tamper";
    default:
      return type;
  }
}

interface ActivityTickerProps {
  readonly className?: string;
}

export function ActivityTicker({ className }: ActivityTickerProps) {
  const router = useRouter();
  const { events, connected } = useEventStream();

  const visibleEvents = useMemo(
    () => events.slice(0, MAX_VISIBLE),
    [events],
  );

  if (!connected && visibleEvents.length === 0) {
    return null;
  }

  if (visibleEvents.length === 0) {
    return (
      <div className={`flex items-center gap-2 text-xs text-zinc-500 ${className ?? ""}`}>
        <Activity className="w-3.5 h-3.5" />
        <span>No recent activity</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 overflow-x-auto scrollbar-none ${className ?? ""}`}>
      <Activity className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
      {visibleEvents.map((event: OSPEvent) => {
        const Icon = getEventIcon(event.type);
        const colorClasses = getEventColor(event.type);
        return (
          <button
            key={event.id}
            onClick={() => router.push(`/cameras/${event.cameraId}`)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium whitespace-nowrap shrink-0 transition-all duration-300 cursor-pointer hover:scale-[1.02] animate-[slideIn_300ms_ease-out] ${colorClasses}`}
            title={`${formatEventLabel(event.type)} on ${event.cameraName || "Unknown camera"}`}
          >
            <Icon className="w-3 h-3" />
            <span>{formatEventLabel(event.type)}</span>
            <span className="opacity-70">on</span>
            <span className="max-w-[120px] truncate">{event.cameraName || "Camera"}</span>
            <span className="opacity-50">{formatRelativeTime(event.detectedAt)}</span>
          </button>
        );
      })}
    </div>
  );
}
