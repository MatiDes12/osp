"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { ChevronLeft, ChevronRight, Camera } from "lucide-react";
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

function timeToPercent(timeStr: string, dayStart: number): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.max(
    0,
    Math.min(100, ((new Date(timeStr).getTime() - dayStart) / DAY_MS) * 100),
  );
}

function percentToTime(percent: number, dayStart: number): Date {
  return new Date(dayStart + (percent / 100) * 24 * 60 * 60 * 1000);
}

function formatHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// ── Color maps ────────────────────────────────────────────────────────────────

function getRecordingColor(trigger: string): string {
  switch (trigger) {
    case "motion":
      return "#f59e0b"; // amber-500
    case "ai_detection":
      return "#a855f7"; // purple-500
    case "manual":
      return "#3b82f6"; // blue-500
    case "rule":
      return "#06b6d4"; // cyan-500
    default:
      return "#22c55e"; // green-500 (continuous)
  }
}

function getEventDotColor(type: string): string {
  switch (type) {
    case "motion":
      return "#ef4444"; // red-500
    case "person":
      return "#f97316"; // orange-500
    case "vehicle":
      return "#38bdf8"; // sky-400
    case "animal":
      return "#4ade80"; // green-400
    case "tampering":
      return "#eab308"; // yellow-500
    case "audio":
      return "#c084fc"; // purple-400
    case "camera_offline":
      return "#6b7280"; // gray-500
    case "camera_online":
      return "#6b7280"; // gray-500
    default:
      return "#a1a1aa"; // zinc-400
  }
}

function getEventLabel(type: string): string {
  switch (type) {
    case "motion":
      return "Motion";
    case "person":
      return "Person";
    case "vehicle":
      return "Vehicle";
    case "animal":
      return "Animal";
    case "tampering":
      return "Tampering";
    case "audio":
      return "Audio";
    case "camera_offline":
      return "Camera offline";
    case "camera_online":
      return "Camera online";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RenderedSegment {
  left: number;
  width: number;
  trigger: string;
  recordingId: string;
  startTime: string;
  endTime: string;
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
  nearEvent: RenderedEvent | null;
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
  const [snapshotModal, setSnapshotModal] = useState<{
    src: string;
    label: string;
    timestamp: string;
  } | null>(null);

  useEffect(() => {
    if (date) setCurrentDate(date);
  }, [date]);

  const { timeline, loading } = useTimeline(cameraId, currentDate);

  const dayStart = useMemo(
    () => new Date(`${currentDate}T00:00:00`).getTime(),
    [currentDate],
  );

  const renderedSegments = useMemo((): RenderedSegment[] => {
    if (!timeline?.segments) return [];
    return timeline.segments.map((seg) => {
      const left = timeToPercent(seg.startTime, dayStart);
      const right = timeToPercent(seg.endTime, dayStart);
      return {
        left,
        width: Math.max(right - left, 0.2),
        trigger: seg.trigger,
        recordingId: seg.recordingId,
        startTime: seg.startTime,
        endTime: seg.endTime,
      };
    });
  }, [timeline, dayStart]);

  const renderedEvents = useMemo((): RenderedEvent[] => {
    if (!timeline?.events) return [];
    return timeline.events.map((evt) => ({
      left: timeToPercent(evt.timestamp, dayStart),
      type: evt.type,
      severity: evt.severity,
      timestamp: evt.timestamp,
      eventId: evt.eventId,
      thumbnailUrl: evt.thumbnailUrl ?? null,
    }));
  }, [timeline, dayStart]);

  const getPercent = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(
      0,
      Math.min(100, ((clientX - rect.left) / rect.width) * 100),
    );
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const percent = getPercent(e.clientX);
      // Find nearest event within 1.5% threshold
      let nearEvent: RenderedEvent | null = null;
      let bestDist = 1.5;
      for (const evt of renderedEvents) {
        const dist = Math.abs(evt.left - percent);
        if (dist < bestDist) {
          bestDist = dist;
          nearEvent = evt;
        }
      }
      setHover({ percent, nearEvent });
    },
    [getPercent, renderedEvents],
  );

  const handleMouseLeave = useCallback(() => setHover(null), []);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      const percent = getPercent(e.clientX);
      onSeek?.(percentToTime(percent, dayStart).toISOString());
    },
    [getPercent, dayStart, onSeek],
  );

  const handleEventClick = useCallback(
    (e: React.MouseEvent, evt: RenderedEvent) => {
      e.stopPropagation();
      if (evt.thumbnailUrl) {
        setSnapshotModal({
          src: evt.thumbnailUrl,
          label: getEventLabel(evt.type),
          timestamp: evt.timestamp,
        });
      } else {
        onSeek?.(evt.timestamp);
      }
    },
    [onSeek],
  );

  const isToday = currentDate === getTodayStr();

  const hourMarkers = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => ({
      left: ((i * 4) / 24) * 100,
      label: `${String(i * 4).padStart(2, "0")}:00`,
    }));
  }, []);

  // Legend items
  const recordingLegend = [
    { color: "#22c55e", label: "Continuous" },
    { color: "#f59e0b", label: "Motion" },
    { color: "#3b82f6", label: "Manual" },
    { color: "#a855f7", label: "AI" },
  ];
  const eventLegend = [
    { color: "#ef4444", label: "Motion" },
    { color: "#f97316", label: "Person" },
    { color: "#38bdf8", label: "Vehicle" },
  ];

  if (loading) {
    return (
      <div
        className={`h-20 bg-zinc-900 rounded-lg border border-zinc-800 animate-pulse ${className ?? ""}`}
      />
    );
  }

  return (
    <div
      className={`bg-zinc-900 rounded-lg border border-zinc-800 select-none ${className ?? ""}`}
    >
      {/* Header: legend + date nav */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1 gap-2 flex-wrap">
        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[9px] uppercase tracking-wide text-zinc-600 font-medium">
            Rec
          </span>
          {recordingLegend.map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              <span
                className="w-2.5 h-2 rounded-sm"
                style={{ backgroundColor: l.color, opacity: 0.85 }}
              />
              <span className="text-[10px] text-zinc-500">{l.label}</span>
            </span>
          ))}
          <span className="text-[9px] uppercase tracking-wide text-zinc-600 font-medium ml-2">
            Events
          </span>
          {eventLegend.map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: l.color }}
              />
              <span className="text-[10px] text-zinc-500">{l.label}</span>
            </span>
          ))}
          <span className="flex items-center gap-1">
            <Camera className="w-2.5 h-2.5 text-zinc-400" />
            <span className="text-[10px] text-zinc-500">Snapshot</span>
          </span>
        </div>

        {/* Date nav */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setCurrentDate((p) => shiftDate(p, -1))}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded hover:bg-zinc-800 cursor-pointer"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-medium text-zinc-400 min-w-[90px] text-center">
            {formatDateLabel(currentDate)}
          </span>
          <button
            onClick={() =>
              setCurrentDate((p) => {
                const next = shiftDate(p, 1);
                return next > getTodayStr() ? p : next;
              })
            }
            disabled={isToday}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded hover:bg-zinc-800 cursor-pointer disabled:opacity-30 disabled:cursor-default"
            aria-label="Next day"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main timeline tracks */}
      <div className="px-3 pb-1">
        <div className="flex items-stretch gap-2">
          {/* Left col: time + row labels */}
          <div className="w-10 shrink-0 flex flex-col items-end gap-0.5">
            <span
              className="text-[10px] font-mono text-zinc-500 leading-5"
              style={{ fontFamily: "monospace" }}
            >
              00:00
            </span>
            <span className="text-[8px] text-zinc-700 leading-5 mt-0.5">
              EVT
            </span>
          </div>

          {/* Track container — recording bar + event row share same x-axis */}
          <div className="flex-1 relative">
            {/* ── Recording bar ── */}
            <div
              ref={trackRef}
              className="relative h-5 rounded bg-zinc-800 cursor-pointer overflow-hidden"
              onClick={handleTrackClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {renderedSegments.length === 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] text-zinc-700">
                  No recordings
                </span>
              )}

              {renderedSegments.map((seg) => (
                <div
                  key={seg.recordingId}
                  className="absolute top-0 h-full rounded-sm opacity-80 hover:opacity-100 transition-opacity"
                  style={{
                    left: `${seg.left}%`,
                    width: `${seg.width}%`,
                    backgroundColor: getRecordingColor(seg.trigger),
                  }}
                  title={`${seg.trigger} — ${new Date(seg.startTime).toLocaleTimeString()}`}
                />
              ))}

              {/* Hover crosshair */}
              {hover && (
                <div
                  className="absolute top-0 h-full w-px bg-white/30 pointer-events-none"
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
              {/* Track background guide line */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-zinc-800" />

              {renderedEvents.map((evt) => (
                <button
                  key={evt.eventId}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-zinc-900 cursor-pointer hover:scale-150 transition-transform z-10"
                  style={{
                    left: `${evt.left}%`,
                    backgroundColor: getEventDotColor(evt.type),
                    // Snapshot events get a ring
                    boxShadow: evt.thumbnailUrl
                      ? `0 0 0 1.5px ${getEventDotColor(evt.type)}`
                      : undefined,
                  }}
                  onClick={(e) => handleEventClick(e, evt)}
                  title={`${getEventLabel(evt.type)} — ${new Date(evt.timestamp).toLocaleTimeString()}`}
                >
                  {/* Camera icon for events that have a snapshot */}
                  {evt.thumbnailUrl && (
                    <Camera className="absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 text-zinc-300 pointer-events-none" />
                  )}
                </button>
              ))}

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
                    className="absolute -top-1 z-20 pointer-events-none"
                    style={{
                      left: `${pinLeft}%`,
                      transform: isRight
                        ? "translateX(-100%) translateY(-100%)"
                        : "translateY(-100%)",
                    }}
                  >
                    {hover.nearEvent ? (
                      /* Event tooltip with optional thumbnail */
                      <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-lg overflow-hidden text-left min-w-[140px]">
                        {hover.nearEvent.thumbnailUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={hover.nearEvent.thumbnailUrl}
                            alt="Event snapshot"
                            className="w-full h-20 object-cover"
                          />
                        )}
                        <div className="px-2 py-1.5 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor: getEventDotColor(
                                  hover.nearEvent.type,
                                ),
                              }}
                            />
                            <span className="text-[11px] font-medium text-zinc-200">
                              {getEventLabel(hover.nearEvent.type)}
                            </span>
                          </div>
                          <span className="block text-[10px] text-zinc-400 font-mono">
                            {new Date(
                              hover.nearEvent.timestamp,
                            ).toLocaleTimeString()}
                          </span>
                          {hover.nearEvent.thumbnailUrl && (
                            <span className="flex items-center gap-1 text-[9px] text-zinc-500">
                              <Camera className="w-2.5 h-2.5" />
                              Snapshot saved
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Plain time tooltip */
                      <div className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-200 font-mono whitespace-nowrap shadow">
                        {formatHHMM(percentToTime(hover.percent, dayStart))}
                      </div>
                    )}
                  </div>
                );
              })()}
          </div>

          {/* Right col: time */}
          <div className="w-10 shrink-0 flex flex-col items-start gap-0.5">
            <span
              className="text-[10px] font-mono text-zinc-500 leading-5"
              style={{ fontFamily: "monospace" }}
            >
              24:00
            </span>
          </div>
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
                style={{ left: `${marker.left}%`, fontFamily: "monospace" }}
              >
                {marker.label}
              </span>
            ))}
          </div>
          <span className="w-10 shrink-0" />
        </div>
      </div>

      {/* Snapshot lightbox modal */}
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
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: getEventDotColor(
                      snapshotModal.label.toLowerCase(),
                    ),
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
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            {/* Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={snapshotModal.src}
              alt={`${snapshotModal.label} snapshot`}
              className="w-full object-contain max-h-[70vh] bg-black"
            />
            {/* Footer actions */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800">
              <button
                onClick={() => {
                  onSeek?.(snapshotModal.timestamp);
                  setSnapshotModal(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 3l14 9-14 9V3z"
                  />
                </svg>
                Seek to recording
              </button>
              <a
                href={snapshotModal.src}
                download={`snapshot-${snapshotModal.timestamp}.jpg`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
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
