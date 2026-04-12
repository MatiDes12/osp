"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Camera,
  ZoomIn,
  ZoomOut,
  Activity,
  Video,
  AlertTriangle,
  Clock,
  RotateCcw,
} from "lucide-react";
import { useTimeline } from "@/hooks/use-recordings";

interface TimelineScrubberProps {
  readonly cameraId: string;
  readonly date?: string;
  readonly onSeek?: (timestamp: string) => void;
  readonly className?: string;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function timeToPercent(timeStr: string, windowStart: number, windowMs: number): number {
  return Math.max(
    0,
    Math.min(100, ((new Date(timeStr).getTime() - windowStart) / windowMs) * 100),
  );
}

function percentToTime(percent: number, windowStart: number, windowMs: number): Date {
  return new Date(windowStart + (percent / 100) * windowMs);
}

function formatHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatHHMMSS(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function formatDurationShort(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ── Color maps ────────────────────────────────────────────────────────────────

const RECORDING_COLORS: Record<string, { bar: string; glow: string; label: string }> = {
  motion: { bar: "#f59e0b", glow: "#f59e0b30", label: "Motion" },
  ai_detection: { bar: "#a855f7", glow: "#a855f730", label: "AI" },
  manual: { bar: "#3b82f6", glow: "#3b82f630", label: "Manual" },
  rule: { bar: "#06b6d4", glow: "#06b6d430", label: "Rule" },
  continuous: { bar: "#22c55e", glow: "#22c55e30", label: "Continuous" },
};

function getRecColor(trigger: string) {
  return RECORDING_COLORS[trigger] ?? RECORDING_COLORS.continuous!;
}

const EVENT_COLORS: Record<string, { dot: string; label: string }> = {
  motion: { dot: "#ef4444", label: "Motion" },
  person: { dot: "#f97316", label: "Person" },
  vehicle: { dot: "#38bdf8", label: "Vehicle" },
  animal: { dot: "#4ade80", label: "Animal" },
  tampering: { dot: "#eab308", label: "Tampering" },
  audio: { dot: "#c084fc", label: "Audio" },
  camera_offline: { dot: "#6b7280", label: "Offline" },
  camera_online: { dot: "#6b7280", label: "Online" },
};

function getEvtColor(type: string) {
  return EVENT_COLORS[type] ?? { dot: "#a1a1aa", label: type.charAt(0).toUpperCase() + type.slice(1) };
}

// ── Zoom presets ─────────────────────────────────────────────────────────────

type ZoomLevel = "24h" | "12h" | "6h" | "3h" | "1h";
const ZOOM_MS: Record<ZoomLevel, number> = {
  "24h": 24 * 3600_000,
  "12h": 12 * 3600_000,
  "6h": 6 * 3600_000,
  "3h": 3 * 3600_000,
  "1h": 1 * 3600_000,
};
const ZOOM_ORDER: ZoomLevel[] = ["24h", "12h", "6h", "3h", "1h"];

// ── Types ─────────────────────────────────────────────────────────────────────

interface RenderedSegment {
  left: number;
  width: number;
  trigger: string;
  recordingId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
}

interface RenderedEvent {
  left: number;
  type: string;
  severity: string;
  timestamp: string;
  eventId: string;
  thumbnailUrl: string | null;
}

interface HoverState {
  percent: number;
  clientX: number;
  nearEvent: RenderedEvent | null;
  nearSegment: RenderedSegment | null;
}

// ── Motion density heatmap helper ────────────────────────────────────────────

function buildMotionHeatmap(events: RenderedEvent[], buckets: number): number[] {
  const heat = new Array(buckets).fill(0) as number[];
  for (const evt of events) {
    if (evt.type === "motion") {
      const idx = Math.min(buckets - 1, Math.max(0, Math.floor((evt.left / 100) * buckets)));
      heat[idx]!++;
    }
  }
  // Normalise to 0-1
  const max = Math.max(1, ...heat);
  return heat.map((v) => v / max);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TimelineScrubber({
  cameraId,
  date,
  onSeek,
  className,
}: TimelineScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [currentDate, setCurrentDate] = useState(date ?? getTodayStr());
  const [hover, setHover] = useState<HoverState | null>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("24h");
  const [zoomCenterHour, setZoomCenterHour] = useState(12); // hour of day the zoom window is centered on
  const [snapshotModal, setSnapshotModal] = useState<{
    src: string;
    label: string;
    timestamp: string;
  } | null>(null);
  const [nowPercent, setNowPercent] = useState<number | null>(null);

  useEffect(() => {
    if (date) setCurrentDate(date);
  }, [date]);

  const isToday = currentDate === getTodayStr();

  // Auto-refresh every 15s for today, no refresh for past days
  const { timeline, loading } = useTimeline(cameraId, currentDate, isToday ? 15_000 : 0);

  const dayStartMs = useMemo(
    () => new Date(`${currentDate}T00:00:00`).getTime(),
    [currentDate],
  );

  // Visible window
  const windowMs = ZOOM_MS[zoomLevel];
  const windowStartMs = useMemo(() => {
    if (zoomLevel === "24h") return dayStartMs;
    const centerMs = dayStartMs + zoomCenterHour * 3600_000;
    const half = windowMs / 2;
    const start = Math.max(dayStartMs, centerMs - half);
    return Math.min(start, dayStartMs + 24 * 3600_000 - windowMs);
  }, [dayStartMs, zoomLevel, zoomCenterHour, windowMs]);

  // Current-time playhead (only for today)
  useEffect(() => {
    if (!isToday) {
      setNowPercent(null);
      return;
    }
    const tick = () => {
      const pct = ((Date.now() - windowStartMs) / windowMs) * 100;
      setNowPercent(pct >= 0 && pct <= 100 ? pct : null);
    };
    tick();
    const id = setInterval(tick, 5_000);
    return () => clearInterval(id);
  }, [isToday, windowStartMs, windowMs]);

  // Rendered data
  const renderedSegments = useMemo((): RenderedSegment[] => {
    if (!timeline?.segments) return [];
    return timeline.segments
      .map((seg) => {
        const startMs = new Date(seg.startTime).getTime();
        const endMs = new Date(seg.endTime).getTime();
        const left = timeToPercent(seg.startTime, windowStartMs, windowMs);
        const right = timeToPercent(seg.endTime, windowStartMs, windowMs);
        return {
          left,
          width: Math.max(right - left, 0.15),
          trigger: seg.trigger,
          recordingId: seg.recordingId,
          startTime: seg.startTime,
          endTime: seg.endTime,
          durationMs: endMs - startMs,
        };
      })
      .filter((s) => s.left + s.width > 0 && s.left < 100);
  }, [timeline, windowStartMs, windowMs]);

  const renderedEvents = useMemo((): RenderedEvent[] => {
    if (!timeline?.events) return [];
    return timeline.events
      .map((evt) => ({
        left: timeToPercent(evt.timestamp, windowStartMs, windowMs),
        type: evt.type,
        severity: evt.severity,
        timestamp: evt.timestamp,
        eventId: evt.eventId,
        thumbnailUrl: evt.thumbnailUrl ?? null,
      }))
      .filter((e) => e.left >= 0 && e.left <= 100);
  }, [timeline, windowStartMs, windowMs]);

  // Motion heatmap
  const HEATMAP_BUCKETS = 96; // 15-min buckets for 24h
  const motionHeat = useMemo(
    () => buildMotionHeatmap(renderedEvents, HEATMAP_BUCKETS),
    [renderedEvents],
  );

  // Stats
  const stats = useMemo(() => {
    const totalRecMs = renderedSegments.reduce((sum, s) => sum + s.durationMs, 0);
    const motionCount = renderedEvents.filter((e) => e.type === "motion").length;
    const aiCount = renderedEvents.filter(
      (e) => e.type === "person" || e.type === "vehicle" || e.type === "animal",
    ).length;
    const totalEvents = renderedEvents.length;
    return { totalRecMs, motionCount, aiCount, totalEvents };
  }, [renderedSegments, renderedEvents]);

  // Mouse helpers
  const getPercent = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const percent = getPercent(e.clientX);
      let nearEvent: RenderedEvent | null = null;
      let bestEvtDist = 1.5;
      for (const evt of renderedEvents) {
        const dist = Math.abs(evt.left - percent);
        if (dist < bestEvtDist) {
          bestEvtDist = dist;
          nearEvent = evt;
        }
      }
      let nearSegment: RenderedSegment | null = null;
      for (const seg of renderedSegments) {
        if (percent >= seg.left && percent <= seg.left + seg.width) {
          nearSegment = seg;
          break;
        }
      }
      setHover({ percent, clientX: e.clientX, nearEvent, nearSegment });
    },
    [getPercent, renderedEvents, renderedSegments],
  );

  const handleMouseLeave = useCallback(() => setHover(null), []);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      const percent = getPercent(e.clientX);
      onSeek?.(percentToTime(percent, windowStartMs, windowMs).toISOString());
    },
    [getPercent, windowStartMs, windowMs, onSeek],
  );

  const handleEventClick = useCallback(
    (e: React.MouseEvent, evt: RenderedEvent) => {
      e.stopPropagation();
      if (evt.thumbnailUrl) {
        setSnapshotModal({
          src: evt.thumbnailUrl,
          label: getEvtColor(evt.type).label,
          timestamp: evt.timestamp,
        });
      } else {
        onSeek?.(evt.timestamp);
      }
    },
    [onSeek],
  );

  // Zoom helpers
  const zoomIn = useCallback(() => {
    const idx = ZOOM_ORDER.indexOf(zoomLevel);
    if (idx < ZOOM_ORDER.length - 1) {
      setZoomLevel(ZOOM_ORDER[idx + 1]!);
      // Center on current hover position or "now"
      if (hover) {
        const t = percentToTime(hover.percent, windowStartMs, windowMs);
        setZoomCenterHour(t.getHours() + t.getMinutes() / 60);
      } else if (isToday) {
        const now = new Date();
        setZoomCenterHour(now.getHours() + now.getMinutes() / 60);
      }
    }
  }, [zoomLevel, hover, windowStartMs, windowMs, isToday]);

  const zoomOut = useCallback(() => {
    const idx = ZOOM_ORDER.indexOf(zoomLevel);
    if (idx > 0) setZoomLevel(ZOOM_ORDER[idx - 1]!);
  }, [zoomLevel]);

  const panWindow = useCallback(
    (dir: number) => {
      const stepH = (ZOOM_MS[zoomLevel] / 3600_000) * 0.5;
      setZoomCenterHour((h) => Math.max(0, Math.min(24, h + dir * stepH)));
    },
    [zoomLevel],
  );

  // Hour markers for current window
  const hourMarkers = useMemo(() => {
    const markers: { left: number; label: string }[] = [];
    const stepHrs = windowMs <= 3 * 3600_000 ? 0.5 : windowMs <= 6 * 3600_000 ? 1 : windowMs <= 12 * 3600_000 ? 2 : 4;
    const startHour = Math.floor((windowStartMs - dayStartMs) / 3600_000);
    const endHour = startHour + windowMs / 3600_000;
    for (let h = Math.ceil(startHour / stepHrs) * stepHrs; h <= endHour; h += stepHrs) {
      const ms = dayStartMs + h * 3600_000;
      const pct = ((ms - windowStartMs) / windowMs) * 100;
      if (pct >= 0 && pct <= 100) {
        const hr = Math.floor(h);
        const min = Math.round((h - hr) * 60);
        markers.push({
          left: pct,
          label: `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
        });
      }
    }
    return markers;
  }, [windowStartMs, windowMs, dayStartMs]);

  // Unique recording legend items based on actual data
  const activeTriggers = useMemo(() => {
    const set = new Set(renderedSegments.map((s) => s.trigger));
    return Array.from(set);
  }, [renderedSegments]);

  // Unique event types
  const activeEventTypes = useMemo(() => {
    const set = new Set(renderedEvents.map((e) => e.type));
    return Array.from(set);
  }, [renderedEvents]);

  if (loading && !timeline) {
    return (
      <div
        className={`bg-zinc-900/80 rounded-xl border border-zinc-800 animate-pulse ${className ?? ""}`}
      >
        <div className="h-[180px] flex items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-zinc-900/80 rounded-xl border border-zinc-800 backdrop-blur-sm ${className ?? ""}`}
    >
      {/* ── Header: stats + date nav + zoom ── */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 gap-2 flex-wrap border-b border-zinc-800/60">
        {/* Stats badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800/80 text-[10px]">
            <Video className="w-3 h-3 text-blue-400" />
            <span className="text-zinc-300 font-medium">
              {renderedSegments.length}
            </span>
            <span className="text-zinc-500">
              rec{renderedSegments.length !== 1 ? "s" : ""}
            </span>
            {stats.totalRecMs > 0 && (
              <span className="text-zinc-600 ml-0.5">
                ({formatDurationShort(stats.totalRecMs)})
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800/80 text-[10px]">
            <Activity className="w-3 h-3 text-amber-400" />
            <span className="text-zinc-300 font-medium">{stats.motionCount}</span>
            <span className="text-zinc-500">motion</span>
          </span>
          {stats.aiCount > 0 && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800/80 text-[10px]">
              <AlertTriangle className="w-3 h-3 text-purple-400" />
              <span className="text-zinc-300 font-medium">{stats.aiCount}</span>
              <span className="text-zinc-500">AI</span>
            </span>
          )}
          {stats.totalEvents > 0 && stats.totalEvents !== stats.motionCount + stats.aiCount && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800/80 text-[10px]">
              <Clock className="w-3 h-3 text-zinc-400" />
              <span className="text-zinc-300 font-medium">{stats.totalEvents}</span>
              <span className="text-zinc-500">total</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Zoom controls */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={zoomOut}
              disabled={zoomLevel === "24h"}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded hover:bg-zinc-800 cursor-pointer disabled:opacity-30"
              title="Zoom out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="text-[10px] font-mono text-zinc-400 min-w-[28px] text-center">
              {zoomLevel}
            </span>
            <button
              onClick={zoomIn}
              disabled={zoomLevel === "1h"}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded hover:bg-zinc-800 cursor-pointer disabled:opacity-30"
              title="Zoom in"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            {zoomLevel !== "24h" && (
              <button
                onClick={() => setZoomLevel("24h")}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded hover:bg-zinc-800 cursor-pointer ml-0.5"
                title="Reset zoom"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Date nav */}
          <div className="flex items-center gap-0.5 ml-1">
            <button
              onClick={() => setCurrentDate((p) => shiftDate(p, -1))}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded hover:bg-zinc-800 cursor-pointer"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              className="text-[10px] font-medium text-zinc-400 min-w-[95px] text-center px-1 py-0.5 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
              onClick={() => {
                setCurrentDate(getTodayStr());
                setZoomLevel("24h");
              }}
              title="Go to today"
            >
              {isToday ? "Today" : formatDateLabel(currentDate)}
            </button>
            <button
              onClick={() =>
                setCurrentDate((p) => {
                  const next = shiftDate(p, 1);
                  return next > getTodayStr() ? p : next;
                })
              }
              disabled={isToday}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded hover:bg-zinc-800 cursor-pointer disabled:opacity-30"
              aria-label="Next day"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main timeline area ── */}
      <div className="px-3 pt-2 pb-1">
        {/* Pan arrows for zoomed view */}
        <div className="flex items-stretch gap-1.5">
          {zoomLevel !== "24h" && (
            <button
              onClick={() => panWindow(-1)}
              className="flex items-center justify-center w-5 shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
              title="Pan left"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
          )}

          <div className="flex-1 relative">
            {/* ── Motion density heatmap ── */}
            <div className="relative h-3 rounded-t bg-zinc-800/40 overflow-hidden mb-px">
              {motionHeat.map((val, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full"
                  style={{
                    left: `${(i / HEATMAP_BUCKETS) * 100}%`,
                    width: `${100 / HEATMAP_BUCKETS + 0.1}%`,
                    backgroundColor: `rgba(239, 68, 68, ${val * 0.6})`,
                  }}
                />
              ))}
              {motionHeat.every((v) => v === 0) && (
                <span className="absolute inset-0 flex items-center justify-center text-[7px] text-zinc-700 uppercase tracking-wider">
                  No motion
                </span>
              )}
            </div>

            {/* ── Recording bar ── */}
            <div
              ref={trackRef}
              className="relative h-7 rounded bg-zinc-800/60 cursor-pointer overflow-hidden"
              onClick={handleTrackClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {/* Empty state */}
              {renderedSegments.length === 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] text-zinc-700">
                  No recordings for this {zoomLevel === "24h" ? "day" : "window"}
                </span>
              )}

              {/* Recording segments */}
              {renderedSegments.map((seg) => {
                const rc = getRecColor(seg.trigger);
                return (
                  <div
                    key={seg.recordingId}
                    className="absolute top-0.5 bottom-0.5 rounded-sm transition-opacity"
                    style={{
                      left: `${seg.left}%`,
                      width: `${seg.width}%`,
                      backgroundColor: rc.bar,
                      opacity: hover?.nearSegment?.recordingId === seg.recordingId ? 1 : 0.75,
                      boxShadow: hover?.nearSegment?.recordingId === seg.recordingId
                        ? `0 0 8px ${rc.glow}`
                        : undefined,
                    }}
                    title={`${rc.label} — ${new Date(seg.startTime).toLocaleTimeString()} – ${new Date(seg.endTime).toLocaleTimeString()}`}
                  />
                );
              })}

              {/* Now playhead */}
              {nowPercent != null && (
                <div
                  className="absolute top-0 h-full w-0.5 z-10"
                  style={{ left: `${nowPercent}%` }}
                >
                  <div className="w-0.5 h-full bg-red-500" />
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                </div>
              )}

              {/* Hover crosshair */}
              {hover && (
                <div
                  className="absolute top-0 h-full w-px bg-white/40 pointer-events-none z-10"
                  style={{ left: `${hover.percent}%` }}
                />
              )}
            </div>

            {/* ── Event row ── */}
            <div
              className="relative h-5 mt-0.5 cursor-pointer"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={handleTrackClick}
            >
              {/* Guide line */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-zinc-800/80" />

              {renderedEvents.map((evt) => {
                const ec = getEvtColor(evt.type);
                const isActive =
                  hover?.nearEvent?.eventId === evt.eventId;
                return (
                  <button
                    key={evt.eventId}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-zinc-900 cursor-pointer transition-transform z-10"
                    style={{
                      left: `${evt.left}%`,
                      backgroundColor: ec.dot,
                      width: isActive ? 14 : 10,
                      height: isActive ? 14 : 10,
                      boxShadow: evt.thumbnailUrl
                        ? `0 0 0 1.5px ${ec.dot}`
                        : isActive
                          ? `0 0 6px ${ec.dot}`
                          : undefined,
                    }}
                    onClick={(e) => handleEventClick(e, evt)}
                    title={`${ec.label} — ${new Date(evt.timestamp).toLocaleTimeString()}`}
                  >
                    {evt.thumbnailUrl && (
                      <Camera className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-2 h-2 text-zinc-300 pointer-events-none" />
                    )}
                  </button>
                );
              })}

              {/* Hover crosshair on event row */}
              {hover && (
                <div
                  className="absolute top-0 h-full w-px bg-white/20 pointer-events-none"
                  style={{ left: `${hover.percent}%` }}
                />
              )}
            </div>

            {/* ── Hover tooltip ── */}
            {hover &&
              (() => {
                const pinLeft = Math.max(2, Math.min(98, hover.percent));
                const isRight = pinLeft > 65;
                return (
                  <div
                    className="absolute z-20 pointer-events-none"
                    style={{
                      left: `${pinLeft}%`,
                      top: -4,
                      transform: isRight
                        ? "translateX(-100%) translateY(-100%)"
                        : "translateY(-100%)",
                    }}
                  >
                    {hover.nearEvent ? (
                      <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl overflow-hidden text-left min-w-[150px]">
                        {hover.nearEvent.thumbnailUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={hover.nearEvent.thumbnailUrl}
                            alt="Event snapshot"
                            className="w-full h-20 object-cover"
                          />
                        )}
                        <div className="px-2.5 py-2 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: getEvtColor(hover.nearEvent.type).dot }}
                            />
                            <span className="text-[11px] font-semibold text-zinc-200">
                              {getEvtColor(hover.nearEvent.type).label}
                            </span>
                            {hover.nearEvent.severity === "critical" && (
                              <span className="px-1 py-0 text-[8px] font-bold uppercase tracking-wider rounded bg-red-500/20 text-red-400">
                                Critical
                              </span>
                            )}
                          </div>
                          <span className="block text-[10px] text-zinc-400 font-mono">
                            {formatHHMMSS(new Date(hover.nearEvent.timestamp))}
                          </span>
                          {hover.nearEvent.thumbnailUrl && (
                            <span className="flex items-center gap-1 text-[9px] text-zinc-500">
                              <Camera className="w-2.5 h-2.5" />
                              Click to view snapshot
                            </span>
                          )}
                        </div>
                      </div>
                    ) : hover.nearSegment ? (
                      <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl px-2.5 py-2 min-w-[140px]">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className="w-2.5 h-1.5 rounded-sm shrink-0"
                            style={{ backgroundColor: getRecColor(hover.nearSegment.trigger).bar }}
                          />
                          <span className="text-[11px] font-semibold text-zinc-200">
                            {getRecColor(hover.nearSegment.trigger).label} Recording
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono space-y-0.5">
                          <p>
                            {formatHHMMSS(new Date(hover.nearSegment.startTime))} –{" "}
                            {formatHHMMSS(new Date(hover.nearSegment.endTime))}
                          </p>
                          <p className="text-zinc-500">
                            Duration: {formatDurationShort(hover.nearSegment.durationMs)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="px-2 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-200 font-mono whitespace-nowrap shadow-lg">
                        {formatHHMMSS(percentToTime(hover.percent, windowStartMs, windowMs))}
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* ── Hour markers ── */}
            <div className="relative h-3 mt-0.5">
              {hourMarkers.map((marker) => (
                <span
                  key={marker.label}
                  className="absolute text-[8px] text-zinc-600 -translate-x-1/2 select-none font-mono"
                  style={{ left: `${marker.left}%` }}
                >
                  {marker.label}
                </span>
              ))}
            </div>
          </div>

          {zoomLevel !== "24h" && (
            <button
              onClick={() => panWindow(1)}
              className="flex items-center justify-center w-5 shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
              title="Pan right"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-3 px-3 pb-2 pt-0.5 flex-wrap">
        {activeTriggers.length > 0 && (
          <>
            <span className="text-[8px] uppercase tracking-widest text-zinc-700 font-medium">
              Rec
            </span>
            {activeTriggers.map((t) => {
              const rc = getRecColor(t);
              return (
                <span key={t} className="flex items-center gap-1">
                  <span
                    className="w-3 h-1.5 rounded-sm"
                    style={{ backgroundColor: rc.bar, opacity: 0.85 }}
                  />
                  <span className="text-[9px] text-zinc-500">{rc.label}</span>
                </span>
              );
            })}
          </>
        )}
        {activeEventTypes.length > 0 && (
          <>
            <span className="text-[8px] uppercase tracking-widest text-zinc-700 font-medium ml-1">
              Events
            </span>
            {activeEventTypes.map((t) => {
              const ec = getEvtColor(t);
              return (
                <span key={t} className="flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: ec.dot }}
                  />
                  <span className="text-[9px] text-zinc-500">{ec.label}</span>
                </span>
              );
            })}
          </>
        )}
        {nowPercent != null && (
          <span className="flex items-center gap-1 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="text-[9px] text-zinc-500">Now</span>
          </span>
        )}
      </div>

      {/* ── Snapshot lightbox modal ── */}
      {snapshotModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setSnapshotModal(null)}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div
            className="relative z-10 max-w-3xl w-full mx-4 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: getEvtColor(snapshotModal.label.toLowerCase()).dot,
                  }}
                />
                <span className="text-sm font-medium text-zinc-200">
                  {snapshotModal.label} — Snapshot
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  {new Date(snapshotModal.timestamp).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => setSnapshotModal(null)}
                className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer rounded"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={snapshotModal.src}
              alt={`${snapshotModal.label} snapshot`}
              className="w-full object-contain max-h-[70vh] bg-black"
            />
            <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800">
              <button
                onClick={() => {
                  onSeek?.(snapshotModal.timestamp);
                  setSnapshotModal(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
                </svg>
                Seek to recording
              </button>
              <a
                href={snapshotModal.src}
                download={`snapshot-${snapshotModal.timestamp}.jpg`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
