"use client";

import { useEventStream } from "@/hooks/use-event-stream";
import type { OSPEvent, EventType } from "@osp/shared";

interface LiveEventFeedProps {
  readonly cameraIds?: string[];
  readonly eventTypes?: string[];
  readonly maxEvents?: number;
  readonly className?: string;
}

const EVENT_ICONS: Record<EventType, string> = {
  motion: "M13 10V3L4 14h7v7l9-11h-7z",
  person: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  vehicle: "M8 17h8M8 17l-2-8h12l-2 8M8 17H5a1 1 0 01-1-1v-1a1 1 0 011-1h1m12 3h3a1 1 0 001-1v-1a1 1 0 00-1-1h-1",
  animal: "M12 19c-4 0-7-2-7-5 0-2 1.5-3.5 3-4l1-3c.5-1.5 2-2 3-2s2.5.5 3 2l1 3c1.5.5 3 2 3 4 0 3-3 5-7 5z",
  camera_offline: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728A9 9 0 015.636 5.636",
  camera_online: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
  tampering: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  audio: "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z",
  custom: "M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-500/10 text-blue-400",
  medium: "bg-yellow-500/10 text-yellow-400",
  high: "bg-orange-500/10 text-orange-400",
  critical: "bg-red-500/10 text-red-400",
};

function formatEventTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function EventRow({ event }: { readonly event: OSPEvent }) {
  const iconPath = EVENT_ICONS[event.type] ?? EVENT_ICONS.custom;
  const severityClass =
    SEVERITY_COLORS[event.severity] ?? "bg-gray-500/10 text-gray-400";

  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 border-b border-[var(--color-border)] last:border-b-0 animate-[slideInEvent_0.2s_ease-out]"
    >
      {/* Snapshot placeholder / icon */}
      <div className="shrink-0 w-8 h-8 rounded bg-[var(--color-bg)] flex items-center justify-center">
        <svg
          className="w-4 h-4 text-[var(--color-muted)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium truncate capitalize">
            {event.type.replace("_", " ")}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded capitalize shrink-0 ${severityClass}`}
          >
            {event.severity}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-[var(--color-muted)] truncate">
            {event.cameraName}
          </span>
          <span className="text-[10px] text-[var(--color-muted)] opacity-60 shrink-0">
            {formatEventTime(event.detectedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function LiveEventFeed({
  cameraIds,
  eventTypes,
  maxEvents = 50,
  className,
}: LiveEventFeedProps) {
  const { events, connected, error } = useEventStream({
    cameraIds,
    eventTypes,
  });

  const displayEvents = events.slice(0, maxEvents);

  return (
    <div
      className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col ${className ?? ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold">Live Events</h3>
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              connected ? "bg-[var(--color-success)]" : "bg-[var(--color-error)] animate-pulse"
            }`}
          />
          <span className="text-[10px] text-[var(--color-muted)]">
            {connected ? "Connected" : error ? "Error" : "Reconnecting..."}
          </span>
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto max-h-[500px]">
        {displayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[var(--color-muted)]">
            <svg
              className="w-8 h-8 mb-2 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            <p className="text-xs">No events yet</p>
            {!connected && (
              <p className="text-[10px] mt-1 opacity-60">
                Waiting for connection...
              </p>
            )}
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
