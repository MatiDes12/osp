"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Database,
  Radio,
  Wifi,
  Video,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Camera,
  AlertTriangle,
  Disc,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const REFRESH_INTERVAL_MS = 30_000;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ServiceStatus {
  readonly status: "up" | "down" | "not_configured";
  readonly latency_ms: number;
  readonly error?: string;
  readonly streams?: number;
  readonly connections?: number;
}

interface HealthDetailed {
  readonly status: "healthy" | "degraded";
  readonly uptime_seconds: number;
  readonly services: {
    readonly supabase: ServiceStatus;
    readonly redis: ServiceStatus;
    readonly go2rtc: ServiceStatus;
    readonly websocket: ServiceStatus;
  };
  readonly stats: {
    readonly cameras_total: number;
    readonly cameras_online: number;
    readonly events_last_hour: number;
    readonly active_recordings: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { readonly status: "up" | "down" | "not_configured" }) {
  if (status === "up") {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-400">
        <CheckCircle2 className="h-4 w-4" />
        Operational
      </span>
    );
  }
  if (status === "not_configured") {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-500">
        <AlertTriangle className="h-4 w-4" />
        Not Configured
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium text-red-400">
      <XCircle className="h-4 w-4" />
      Down
    </span>
  );
}

function ServiceCard({
  name,
  icon: Icon,
  service,
}: {
  readonly name: string;
  readonly icon: typeof Database;
  readonly service: ServiceStatus;
}) {
  const up = service.status === "up";
  const notConfigured = service.status === "not_configured";

  return (
    <div
      className={`rounded-xl border p-5 transition-colors ${
        up
          ? "border-zinc-800 bg-zinc-900/60"
          : notConfigured
            ? "border-zinc-700 bg-zinc-900/40"
            : "border-red-800/50 bg-red-950/20"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              up
                ? "bg-emerald-500/10"
                : notConfigured
                  ? "bg-zinc-700/30"
                  : "bg-red-500/10"
            }`}
          >
            <Icon
              className={`h-5 w-5 ${
                up
                  ? "text-emerald-400"
                  : notConfigured
                    ? "text-zinc-500"
                    : "text-red-400"
              }`}
            />
          </div>
          <span className="font-medium text-zinc-100">{name}</span>
        </div>
        <StatusBadge status={service.status} />
      </div>

      <div className="space-y-1 text-sm text-zinc-400">
        <p>
          Latency:{" "}
          <span className="text-zinc-200">{service.latency_ms}ms</span>
        </p>
        {service.streams !== undefined && (
          <p>
            Streams:{" "}
            <span className="text-zinc-200">{service.streams}</span>
          </p>
        )}
        {service.connections !== undefined && (
          <p>
            Connections:{" "}
            <span className="text-zinc-200">{service.connections}</span>
          </p>
        )}
        {service.error && (
          <p className="text-red-400">Error: {service.error}</p>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  readonly label: string;
  readonly value: number | string;
  readonly icon: typeof Camera;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-2 flex items-center gap-2 text-zinc-400">
        <Icon className="h-4 w-4" />
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold text-zinc-50">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function HealthPage() {
  const [health, setHealth] = useState<HealthDetailed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/health/detailed`);
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as HealthDetailed;
      setHealth(data);
      setError(null);
      setLastFetch(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  if (loading && !health) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">System Health</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Real-time status of all OSP services
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastFetch && (
            <span className="text-xs text-zinc-500">
              Updated {lastFetch.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={fetchHealth}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Failed to fetch health data: {error}
        </div>
      )}

      {health && (
        <>
          {/* Overall status + uptime */}
          <div className="flex items-center gap-6 rounded-xl border border-zinc-800 bg-zinc-900/60 px-6 py-4">
            <div className="flex items-center gap-2">
              <div
                className={`h-3 w-3 rounded-full ${
                  health.status === "healthy"
                    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                }`}
              />
              <span className="text-lg font-semibold text-zinc-100">
                {health.status === "healthy"
                  ? "All Systems Operational"
                  : "Degraded Performance"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-zinc-400">
              <Clock className="h-4 w-4" />
              Uptime: {formatUptime(health.uptime_seconds)}
            </div>
          </div>

          {/* Service cards */}
          <div>
            <h2 className="mb-4 text-lg font-semibold text-zinc-100">
              Services
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ServiceCard
                name="Supabase"
                icon={Database}
                service={health.services.supabase}
              />
              <ServiceCard
                name="Redis"
                icon={Radio}
                service={health.services.redis}
              />
              <ServiceCard
                name="go2rtc"
                icon={Video}
                service={health.services.go2rtc}
              />
              <ServiceCard
                name="WebSocket"
                icon={Wifi}
                service={health.services.websocket}
              />
            </div>
          </div>

          {/* Stats */}
          <div>
            <h2 className="mb-4 text-lg font-semibold text-zinc-100">
              Platform Stats
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Cameras"
                value={`${health.stats.cameras_online}/${health.stats.cameras_total}`}
                icon={Camera}
              />
              <StatCard
                label="Events (1h)"
                value={health.stats.events_last_hour}
                icon={Activity}
              />
              <StatCard
                label="Active Recordings"
                value={health.stats.active_recordings}
                icon={Disc}
              />
              <StatCard
                label="WS Connections"
                value={health.services.websocket.connections ?? 0}
                icon={Wifi}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
