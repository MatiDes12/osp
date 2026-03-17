"use client";

import { useState, useRef, useCallback, useMemo } from "react";

type TimeRange = "1h" | "6h" | "12h" | "24h";

interface TimelineSegment {
  readonly startPercent: number;
  readonly endPercent: number;
  readonly type: "recording" | "motion" | "ai";
}

interface TimelineScrubberProps {
  readonly currentTime?: number;
  readonly segments?: readonly TimelineSegment[];
  readonly range?: TimeRange;
  readonly onSeek?: (percent: number) => void;
  readonly onRangeChange?: (range: TimeRange) => void;
  readonly className?: string;
}

const RANGE_OPTIONS: readonly TimeRange[] = ["1h", "6h", "12h", "24h"];

function formatTimeFromPercent(percent: number, range: TimeRange): string {
  const totalHours = parseInt(range);
  const totalMinutes = totalHours * 60;
  const minutes = Math.round((percent / 100) * totalMinutes);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function getSegmentColor(type: TimelineSegment["type"]): string {
  switch (type) {
    case "recording":
      return "bg-green-500/60";
    case "motion":
      return "bg-red-500/80";
    case "ai":
      return "bg-purple-500/80";
  }
}

export function TimelineScrubber({
  currentTime = 0,
  segments = [],
  range = "24h",
  onSeek,
  onRangeChange,
  className,
}: TimelineScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(true);

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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true);
      const percent = getPercentFromEvent(e.clientX);
      onSeek?.(percent);
    },
    [getPercentFromEvent, onSeek],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const percent = getPercentFromEvent(e.clientX);
      setHoverPercent(percent);
      if (isDragging) {
        onSeek?.(percent);
      }
    },
    [getPercentFromEvent, isDragging, onSeek],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverPercent(null);
    setIsDragging(false);
  }, []);

  const startLabel = useMemo(() => formatTimeFromPercent(0, range), [range]);
  const endLabel = useMemo(() => formatTimeFromPercent(100, range), [range]);

  if (!isLoaded) {
    return (
      <div className={`h-12 bg-zinc-900 rounded-lg border border-zinc-800 animate-pulse ${className ?? ""}`} />
    );
  }

  return (
    <div className={`bg-zinc-900 rounded-lg border border-zinc-800 ${className ?? ""}`}>
      {/* Range selectors */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-green-500/60" />
            Recording
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-red-500/80" />
            Motion
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-purple-500/80" />
            AI
          </span>
        </div>
        <div className="flex items-center gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => onRangeChange?.(opt)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors duration-150 cursor-pointer
                ${
                  range === opt
                    ? "bg-zinc-700 text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline track */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-500 w-10 text-right shrink-0"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {startLabel}
          </span>

          <div
            ref={trackRef}
            className="relative flex-1 h-6 rounded cursor-pointer bg-zinc-800"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          >
            {/* Segments */}
            {segments.map((seg, i) => (
              <div
                key={i}
                className={`absolute top-0 h-full rounded-sm ${getSegmentColor(seg.type)}`}
                style={{
                  left: `${seg.startPercent}%`,
                  width: `${seg.endPercent - seg.startPercent}%`,
                }}
              />
            ))}

            {/* Hover indicator */}
            {hoverPercent !== null && (
              <>
                <div
                  className="absolute top-0 h-full w-px bg-zinc-400/40 pointer-events-none"
                  style={{ left: `${hoverPercent}%` }}
                />
                <div
                  className="absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded bg-zinc-700 text-[10px] text-zinc-200 pointer-events-none whitespace-nowrap"
                  style={{
                    left: `${hoverPercent}%`,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {formatTimeFromPercent(hoverPercent, range)}
                </div>
              </>
            )}

            {/* Playhead */}
            <div
              className="absolute top-0 h-full w-0.5 bg-white rounded-full shadow-[0_0_4px_rgba(255,255,255,0.4)] pointer-events-none"
              style={{ left: `${currentTime}%` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white" />
            </div>
          </div>

          <span className="text-[10px] font-mono text-zinc-500 w-10 shrink-0"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {endLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
