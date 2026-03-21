"use client";

import { useState, useMemo } from "react";
import {
  BarChart2,
  TrendingUp,
  Camera,
  HardDrive,
  Clock,
  Activity,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import {
  useEventTimeSeries,
  useEventHeatmap,
  useEventBreakdown,
  useCameraActivity,
  useRecordingsSummary,
  presetToRange,
  type DatePreset,
} from "@/hooks/use-analytics";
import type {
  AnalyticsTimeSeriesPoint,
  AnalyticsHeatmapCell,
  AnalyticsEventTypeBreakdown,
  AnalyticsCameraActivity,
} from "@osp/shared";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtBucket(iso: string, granularity: "hour" | "day"): string {
  const d = new Date(iso);
  if (granularity === "hour") {
    return d.toLocaleTimeString([], { month: "short", day: "numeric", hour: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const EVENT_COLORS: Record<string, string> = {
  motion: "#3b82f6",
  person: "#8b5cf6",
  vehicle: "#f59e0b",
  animal: "#10b981",
  camera_offline: "#ef4444",
  camera_online: "#22c55e",
  tampering: "#f97316",
  audio: "#06b6d4",
  custom: "#6b7280",
};

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "blue",
}: {
  icon: React.ElementType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color?: "blue" | "purple" | "green" | "orange";
}) {
  const bg: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-400",
    purple: "bg-purple-500/10 text-purple-400",
    green: "bg-emerald-500/10 text-emerald-400",
    orange: "bg-orange-500/10 text-orange-400",
  };
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
      <div className="flex items-center gap-3 mb-3">
        <span className={`p-2 rounded-lg ${bg[color]}`}>
          <Icon size={16} />
        </span>
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Line / bar chart (SVG) ───────────────────────────────────────────────────

function TimelineChart({
  data,
  granularity,
}: {
  data: AnalyticsTimeSeriesPoint[];
  granularity: "hour" | "day";
}) {
  if (data.length === 0)
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        No data for this period
      </div>
    );

  const W = 100; // viewBox %
  const H = 140;
  const PAD = { top: 10, right: 4, bottom: 28, left: 36 };

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const xs = data.map((_, i) => PAD.left + (i / Math.max(data.length - 1, 1)) * (W - PAD.left - PAD.right));
  const ys = data.map((d) => PAD.top + (1 - d.count / maxCount) * (H - PAD.top - PAD.bottom));

  const points = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  const fillPath = `M${xs[0]},${H - PAD.bottom} ${xs.map((x, i) => `L${x},${ys[i]}`).join(" ")} L${xs[xs.length - 1]},${H - PAD.bottom} Z`;

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    y: PAD.top + (1 - r) * (H - PAD.top - PAD.bottom),
    label: Math.round(r * maxCount),
  }));

  // X-axis: show up to 6 labels
  const xStep = Math.max(1, Math.floor(data.length / 6));
  const xTicks = data
    .map((d, i) => ({ i, label: fmtBucket(d.bucket, granularity) }))
    .filter((_, i) => i % xStep === 0 || i === data.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" preserveAspectRatio="none">
      {/* Grid lines */}
      {yTicks.map((t) => (
        <line key={t.label} x1={PAD.left} x2={W - PAD.right} y1={t.y} y2={t.y}
          stroke="#ffffff10" strokeWidth="0.5" />
      ))}
      {/* Y labels */}
      {yTicks.map((t) => (
        <text key={t.label} x={PAD.left - 2} y={t.y + 1.5} textAnchor="end"
          fontSize="5" fill="#6b7280">{t.label}</text>
      ))}
      {/* Fill */}
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill="url(#areaGrad)" />
      {/* Line */}
      <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="1.2"
        strokeLinejoin="round" strokeLinecap="round" />
      {/* X labels */}
      {xTicks.map(({ i, label }) => (
        <text key={i} x={xs[i]} y={H - 2} textAnchor="middle" fontSize="4.5" fill="#6b7280">
          {label}
        </text>
      ))}
    </svg>
  );
}

// ─── Donut chart ─────────────────────────────────────────────────────────────

function DonutChart({ data }: { data: AnalyticsEventTypeBreakdown[] }) {
  if (data.length === 0)
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        No data for this period
      </div>
    );

  const R = 40;
  const CX = 50;
  const CY = 50;
  const r = 25;
  const total = data.reduce((s, d) => s + d.count, 0);

  let cumAngle = -Math.PI / 2;
  const slices = data.map((d) => {
    const angle = (d.count / total) * 2 * Math.PI;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;
    const x1 = CX + R * Math.cos(startAngle);
    const y1 = CY + R * Math.sin(startAngle);
    const x2 = CX + R * Math.cos(endAngle);
    const y2 = CY + R * Math.sin(endAngle);
    const ix1 = CX + r * Math.cos(startAngle);
    const iy1 = CY + r * Math.sin(startAngle);
    const ix2 = CX + r * Math.cos(endAngle);
    const iy2 = CY + r * Math.sin(endAngle);
    const large = angle > Math.PI ? 1 : 0;
    const path = [
      `M ${x1} ${y1}`,
      `A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${r} ${r} 0 ${large} 0 ${ix1} ${iy1}`,
      "Z",
    ].join(" ");
    return { ...d, path };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-36 h-36 shrink-0">
        {slices.map((s) => (
          <path key={s.type} d={s.path}
            fill={EVENT_COLORS[s.type] ?? "#6b7280"} opacity="0.9" />
        ))}
        <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="middle"
          fontSize="8" fontWeight="600" fill="white">{total}</text>
        <text x={CX} y={CY + 10} textAnchor="middle" fontSize="4.5" fill="#9ca3af">
          events
        </text>
      </svg>
      <ul className="flex-1 space-y-1.5">
        {slices.slice(0, 6).map((s) => (
          <li key={s.type} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block"
                style={{ background: EVENT_COLORS[s.type] ?? "#6b7280" }} />
              <span className="text-gray-300 capitalize">{s.type.replace(/_/g, " ")}</span>
            </span>
            <span className="text-gray-400">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────

function HeatmapChart({ data }: { data: AnalyticsHeatmapCell[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  // Build a 7 × 24 grid
  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const cell of data) {
    grid[cell.dayOfWeek - 1]![cell.hourOfDay] = cell.count;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        {/* Hour labels */}
        <div className="flex ml-10 mb-1">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center text-[9px] text-gray-600">
              {h % 4 === 0 ? `${h}h` : ""}
            </div>
          ))}
        </div>
        {grid.map((row, dow) => (
          <div key={dow} className="flex items-center gap-0.5 mb-0.5">
            <span className="w-10 text-[10px] text-gray-500 text-right pr-2 shrink-0">
              {DOW_LABELS[dow]}
            </span>
            {row.map((count, hour) => {
              const intensity = count / maxCount;
              const bg =
                count === 0
                  ? "bg-white/5"
                  : intensity < 0.33
                    ? "bg-blue-900/70"
                    : intensity < 0.66
                      ? "bg-blue-600/80"
                      : "bg-blue-400";
              return (
                <div key={hour} title={`${DOW_LABELS[dow]} ${hour}:00 — ${count} events`}
                  className={`flex-1 h-4 rounded-[2px] ${bg} cursor-default`} />
              );
            })}
          </div>
        ))}
        <div className="flex items-center gap-2 mt-3 justify-end text-[10px] text-gray-500">
          <span>Less</span>
          {["bg-white/5", "bg-blue-900/70", "bg-blue-600/80", "bg-blue-400"].map((c) => (
            <span key={c} className={`w-3 h-3 rounded-sm ${c}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

// ─── Horizontal bar chart for cameras ────────────────────────────────────────

function CameraActivityChart({ data }: { data: AnalyticsCameraActivity[] }) {
  if (data.length === 0)
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        No data for this period
      </div>
    );

  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <ul className="space-y-2">
      {data.map((row) => (
        <li key={row.cameraId}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-300 font-mono truncate max-w-[180px]">
              {row.cameraId.slice(0, 8)}…
            </span>
            <span className="text-gray-400">{row.count.toLocaleString()}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PRESETS: { label: string; value: DatePreset }[] = [
  { label: "Last 24 h", value: "24h" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
];

export default function AnalyticsPage() {
  const [preset, setPreset] = useState<DatePreset>("7d");
  const [granularity, setGranularity] = useState<"hour" | "day">("day");
  const [showPresetMenu, setShowPresetMenu] = useState(false);

  const range = useMemo(() => presetToRange(preset), [preset]);

  const timeseries = useEventTimeSeries({ ...range, granularity });
  const heatmap = useEventHeatmap(range);
  const breakdown = useEventBreakdown(range);
  const cameras = useCameraActivity({ ...range, limit: 8 });
  const recordings = useRecordingsSummary(range);

  const totalEvents = useMemo(
    () => timeseries.data.reduce((s, d) => s + d.count, 0),
    [timeseries.data],
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Event trends, camera activity, and storage insights
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Granularity */}
          <div className="flex rounded-lg border border-white/[0.08] overflow-hidden text-sm">
            {(["hour", "day"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-3 py-1.5 ${
                  granularity === g
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {g === "hour" ? "Hourly" : "Daily"}
              </button>
            ))}
          </div>

          {/* Date preset */}
          <div className="relative">
            <button
              onClick={() => setShowPresetMenu((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03]
                         px-3 py-1.5 text-sm text-gray-300 hover:text-white"
            >
              {PRESETS.find((p) => p.value === preset)?.label}
              <ChevronDown size={14} />
            </button>
            {showPresetMenu && (
              <div
                className="absolute right-0 top-full mt-1 z-50 min-w-[130px] rounded-lg border
                           border-white/[0.08] bg-gray-900 py-1 shadow-xl"
              >
                {PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => { setPreset(p.value); setShowPresetMenu(false); }}
                    className={`block w-full px-4 py-2 text-left text-sm
                      ${preset === p.value ? "text-blue-400" : "text-gray-300 hover:text-white hover:bg-white/5"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          label="Total Events"
          value={totalEvents.toLocaleString()}
          sub={`${preset} window`}
          color="blue"
        />
        <StatCard
          icon={Camera}
          label="Active Cameras"
          value={cameras.data.length > 0 ? String(cameras.data.length) : "—"}
          sub="with events"
          color="purple"
        />
        <StatCard
          icon={HardDrive}
          label="Storage Used"
          value={recordings.data ? fmtBytes(recordings.data.totalSizeBytes) : "—"}
          sub={recordings.data ? `${recordings.data.totalRecordings} recordings` : undefined}
          color="green"
        />
        <StatCard
          icon={Clock}
          label="Recording Time"
          value={recordings.data ? fmtDuration(recordings.data.totalDurationSec) : "—"}
          sub="total duration"
          color="orange"
        />
      </div>

      {/* Event timeline */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-blue-400" />
          <h2 className="text-sm font-medium text-white">Event Timeline</h2>
          <span className="ml-auto text-xs text-gray-500 capitalize">{granularity}ly breakdown</span>
        </div>
        {timeseries.loading ? (
          <div className="h-40 flex items-center justify-center text-gray-500 text-sm">
            Loading…
          </div>
        ) : (
          <TimelineChart data={timeseries.data} granularity={granularity} />
        )}
      </div>

      {/* Middle row: breakdown + top cameras */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Event breakdown */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-purple-400" />
            <h2 className="text-sm font-medium text-white">Event Breakdown</h2>
          </div>
          {breakdown.loading ? (
            <div className="h-40 flex items-center justify-center text-gray-500 text-sm">
              Loading…
            </div>
          ) : (
            <DonutChart data={breakdown.data} />
          )}
        </div>

        {/* Top cameras */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Camera size={16} className="text-green-400" />
            <h2 className="text-sm font-medium text-white">Top Cameras</h2>
            <span className="ml-auto text-xs text-gray-500">by event count</span>
          </div>
          {cameras.loading ? (
            <div className="h-40 flex items-center justify-center text-gray-500 text-sm">
              Loading…
            </div>
          ) : (
            <CameraActivityChart data={cameras.data} />
          )}
        </div>
      </div>

      {/* Activity heatmap */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={16} className="text-amber-400" />
          <h2 className="text-sm font-medium text-white">Activity Heatmap</h2>
          <span className="ml-auto text-xs text-gray-500">events by hour × day of week</span>
        </div>
        {heatmap.loading ? (
          <div className="h-32 flex items-center justify-center text-gray-500 text-sm">
            Loading…
          </div>
        ) : (
          <HeatmapChart data={heatmap.data} />
        )}
      </div>

      {/* Storage trend */}
      {recordings.data && recordings.data.dailyStorageBytes.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="flex items-center gap-2 mb-4">
            <HardDrive size={16} className="text-emerald-400" />
            <h2 className="text-sm font-medium text-white">Daily Storage Growth</h2>
          </div>
          <TimelineChart
            data={recordings.data.dailyStorageBytes.map((d) => ({
              bucket: d.date + "T00:00:00Z",
              count: d.bytes,
            }))}
            granularity="day"
          />
          {/* Trigger legend */}
          {Object.keys(recordings.data.byTrigger).length > 0 && (
            <div className="flex flex-wrap gap-3 mt-4">
              {Object.entries(recordings.data.byTrigger).map(([trigger, count]) => (
                <span key={trigger}
                  className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  {trigger}: {count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
