"use client";

import {
  Zap,
  User,
  Car,
  Bug,
  WifiOff,
  Video,
  ShieldAlert,
  Mic,
  Circle,
} from "lucide-react";
import { useEventStream } from "@/hooks/use-event-stream";
import type { OSPEvent, EventType, EventSeverity } from "@osp/shared";
import type { LucideIcon } from "lucide-react";

interface LiveEventFeedProps {
  readonly cameraIds?: string[];
  readonly eventTypes?: string[];
  readonly maxEvents?: number;
  readonly className?: string;
}

const EVENT_ICONS: Record<EventType, LucideIcon> = {
  motion: Zap,
  person: User,
  vehicle: Car,
  animal: Bug,
  camera_offline: WifiOff,
  camera_online: Video,
  tampering: ShieldAlert,
  audio: Mic,
  custom: Circle,
};

const SEVERITY_BORDER_COLORS: Record<EventSeverity, string> = {
  critical: "border-l-red-500",
  high: "border-l-amber-500",
  medium: "border-l-blue-500",
  low: "border-l-purple-500",
};

const SEVERITY_ICON_COLORS: Record<EventSeverity, string> = {
  critical: "text-red-400",
  high: "text-amber-400",
  medium: "text-blue-400",
  low: "text-purple-400",
};

function formatEventTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function EventRow({ event }: { readonly event: OSPEvent }) {
  const isRuleTriggered = Boolean(event.metadata?.["ruleTriggered"]);
  const Icon = isRuleTriggered ? ShieldAlert : (EVENT_ICONS[event.type] ?? Circle);
  const borderColor = isRuleTriggered
    ? "border-l-emerald-500"
    : (SEVERITY_BORDER_COLORS[event.severity] ?? "border-l-zinc-600");
  const iconColor = isRuleTriggered
    ? "text-emerald-400"
    : (SEVERITY_ICON_COLORS[event.severity] ?? "text-zinc-400");

  const displayType = isRuleTriggered
    ? `Rule: ${(event.metadata?.["ruleName"] as string) ?? "triggered"}`
    : event.type.replace("_", " ");

  const subtitle = isRuleTriggered
    ? `${(event.metadata?.["sourceEventType"] as string)?.replace("_", " ") ?? ""} on ${event.cameraName}`
    : event.cameraName;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 border-l-4 ${borderColor} border-b border-b-zinc-800/50 last:border-b-0 animate-[slideDown_300ms_ease-out] ${
        isRuleTriggered ? "bg-emerald-500/5" : ""
      }`}
    >
      {/* Thumbnail / Icon */}
      {event.snapshotUrl ? (
        <img
          src={event.snapshotUrl}
          alt=""
          className="h-10 w-10 rounded object-cover shrink-0"
        />
      ) : (
        <div className={`h-10 w-10 rounded flex items-center justify-center shrink-0 ${
          isRuleTriggered ? "bg-emerald-500/10" : "bg-zinc-800"
        }`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-200 truncate capitalize">
            {displayType}
          </span>
          {isRuleTriggered && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
              RULE
            </span>
          )}
        </div>
        <span className="text-[11px] text-zinc-500 truncate block">
          {subtitle}
        </span>
      </div>

      <span
        className="text-[10px] text-zinc-500 shrink-0 tabular-nums"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {formatEventTime(event.detectedAt)}
      </span>
    </div>
  );
}

export function LiveEventFeed({
  cameraIds,
  eventTypes,
  maxEvents = 30,
  className,
}: LiveEventFeedProps) {
  const { events, connected, error } = useEventStream({
    cameraIds,
    eventTypes,
  });

  const displayEvents = events.slice(0, maxEvents);

  return (
    <div
      className={`bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col overflow-hidden ${className ?? ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-50">Live Events</h3>
          {connected && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!connected && (
            <span
              className={`text-[10px] font-medium ${
                error
                  ? "text-red-400"
                  : "text-amber-400 animate-pulse"
              }`}
            >
              {error ? "Disconnected" : "Reconnecting..."}
            </span>
          )}
          {connected && (
            <span className="text-[10px] text-green-400 font-medium">
              Connected
            </span>
          )}
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto max-h-[600px]">
        {displayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
            <p className="text-xs">Listening for events...</p>
          </div>
        ) : (
          displayEvents.map((event) => (
            <EventRow key={event.id} event={event} />
          ))
        )}
      </div>
    </div>
  );
}
