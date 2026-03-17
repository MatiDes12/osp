"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTimeline } from "@/hooks/use-recordings";
import type { TimelineSegment as APITimelineSegment } from "@osp/shared";

interface TimelineScrubberProps {
  readonly cameraId: string;
  readonly date?: string;
  readonly onSeek?: (timestamp: string) => void;
  readonly className?: string;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeToPercent(timeStr: string, dayStart: number): number {
  const ms = new Date(timeStr).getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.min(100, ((ms - dayStart) / DAY_MS) * 100));
}

function percentToTime(percent: number, dayStart: number): Date {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return new Date(dayStart + (percent / 100) * DAY_MS);
}

function formatHourMinute(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function getSegmentColor(trigger: string): string {
  switch (trigger) {
    case "motion":
      return "bg-amber-500/70";
    case "ai_detection":
      return "bg-purple-500/70";
    case "manual":
      return "bg-blue-500/70";
    default:
      return "bg-green-500/60";
  }
}

interface RenderedSegment {
  readonly left: number;
  readonly width: number;
  readonly trigger: string;
  readonly recordingId: string;
  readonly startTime: string;
  readonly endTime: string;
}

interface RenderedEvent {
  readonly left: number;
  readonly type: string;
  readonly severity: string;
  readonly timestamp: string;
  readonly eventId: string;
}

export function TimelineScrubber({
  cameraId,
  date,
  onSeek,
  className,
}: TimelineScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [currentDate, setCurrentDate] = useState(date ?? getTodayStr());

  // Sync if parent changes date prop
  useEffect(() => {
    if (date) {
      setCurrentDate(date);
    }
  }, [date]);

  const { timeline, loading } = useTimeline(cameraId, currentDate);

  const dayStart = useMemo(
    () => new Date(currentDate + "T00:00:00").getTime(),
    [currentDate],
  );

  const renderedSegments: readonly RenderedSegment[] = useMemo(() => {
    if (!timeline?.segments) return [];
    return timeline.segments.map((seg: APITimelineSegment) => {
      const left = timeToPercent(seg.startTime, dayStart);
      const right = timeToPercent(seg.endTime, dayStart);
      return {
        left,
        width: Math.max(right - left, 0.15),
        trigger: seg.trigger,
        recordingId: seg.recordingId,
        startTime: seg.startTime,
        endTime: seg.endTime,
      };
    });
  }, [timeline, dayStart]);

  const renderedEvents: readonly RenderedEvent[] = useMemo(() => {
    if (!timeline?.events) return [];
    return timeline.events.map((evt) => ({
      left: timeToPercent(evt.timestamp, dayStart),
      type: evt.type,
      severity: evt.severity,
      timestamp: evt.timestamp,
      eventId: evt.eventId,
    }));
  }, [timeline, dayStart]);

  const getPercentFromEvent = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const x = clientX - rect.left;
      return Math.max(0, Math.min(100, (x / rect.width) * 100));
    },
    [],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const percent = getPercentFromEvent(e.clientX);
      const clickedTime = percentToTime(percent, dayStart);
      onSeek?.(clickedTime.toISOString());
    },
    [getPercentFromEvent, dayStart, onSeek],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      setHoverPercent(getPercentFromEvent(e.clientX));
    },
    [getPercentFromEvent],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverPercent(null);
  }, []);

  const handlePrevDay = useCallback(() => {
    setCurrentDate((prev) => shiftDate(prev, -1));
  }, []);

  const handleNextDay = useCallback(() => {
    const today = getTodayStr();
    setCurrentDate((prev) => {
      const next = shiftDate(prev, 1);
      return next > today ? prev : next;
    });
  }, []);

  const isToday = currentDate === getTodayStr();

  // Hour markers for the 24h track
  const hourMarkers = useMemo(() => {
    const markers: { left: number; label: string }[] = [];
    for (let h = 0; h <= 24; h += 4) {
      markers.push({
        left: (h / 24) * 100,
        label: `${String(h).padStart(2, "0")}:00`,
      });
    }
    return markers;
  }, []);

  if (loading) {
    return (
      <div className={`h-16 bg-zinc-900 rounded-lg border border-zinc-800 animate-pulse ${className ?? ""}`} />
    );
  }

  return (
    <div className={`bg-zinc-900 rounded-lg border border-zinc-800 ${className ?? ""}`}>
      {/* Top bar: legend + date navigation */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-green-500/60" />
            Recording
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-amber-500/70" />
            Motion
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-purple-500/70" />
            AI
          </span>
          <span className="flex items-center gap-1">
            <span className="w-0.5 h-2 rounded-sm bg-red-500/80" />
            Event
          </span>
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrevDay}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer rounded hover:bg-zinc-800"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-medium text-zinc-400 min-w-[90px] text-center select-none">
            {formatDateLabel(currentDate)}
          </span>
          <button
            onClick={handleNextDay}
            disabled={isToday}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-default"
            aria-label="Next day"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Timeline track */}
      <div className="px-3 pb-1">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-mono text-zinc-500 w-10 text-right shrink-0"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            00:00
          </span>

          <div
            ref={trackRef}
            className="relative flex-1 h-6 rounded cursor-pointer bg-zinc-800"
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Recording segments */}
            {renderedSegments.map((seg) => (
              <div
                key={seg.recordingId}
                className={`absolute top-0 h-full rounded-sm ${getSegmentColor(seg.trigger)} transition-opacity hover:opacity-100 opacity-80`}
                style={{
                  left: `${seg.left}%`,
                  width: `${seg.width}%`,
                }}
                title={`${seg.trigger} recording`}
              />
            ))}

            {/* Event markers (thin red vertical lines) */}
            {renderedEvents.map((evt) => (
              <div
                key={evt.eventId}
                className="absolute top-0 h-full w-[2px] bg-red-500/80 pointer-events-none"
                style={{ left: `${evt.left}%` }}
              />
            ))}

            {/* Hover indicator with tooltip */}
            {hoverPercent !== null && (
              <>
                <div
                  className="absolute top-0 h-full w-px bg-zinc-400/40 pointer-events-none"
                  style={{ left: `${hoverPercent}%` }}
                />
                <div
                  className="absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded bg-zinc-700 text-[10px] text-zinc-200 pointer-events-none whitespace-nowrap z-10"
                  style={{
                    left: `${hoverPercent}%`,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {formatHourMinute(percentToTime(hoverPercent, dayStart))}
                </div>
              </>
            )}
          </div>

          <span
            className="text-[10px] font-mono text-zinc-500 w-10 shrink-0"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            24:00
          </span>
        </div>
      </div>

      {/* Hour markers */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0" />
          <div className="relative flex-1 h-3">
            {hourMarkers.map((marker) => (
              <span
                key={marker.label}
                className="absolute text-[8px] text-zinc-600 -translate-x-1/2 select-none"
                style={{
                  left: `${marker.left}%`,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {marker.label}
              </span>
            ))}
          </div>
          <span className="w-10 shrink-0" />
        </div>
      </div>
    </div>
  );
}
