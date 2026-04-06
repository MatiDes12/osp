"use client";

import { useEffect, useRef } from "react";
import { Activity, Video, Camera } from "lucide-react";
import { useMonitoringStore } from "@/stores/monitoring";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("osp_access_token")
      : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function setConfigKey(key: string, value: string) {
  const res = await fetch(`${API_URL}/api/v1/config/keys/${key}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ value, scope: "tenant" }),
  });
  if (!res.ok) throw new Error(`Config update failed: ${res.status}`);
}

interface ToggleProps {
  label: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  busy: boolean;
  color: string;
  onToggle: () => void;
}

function MonitoringToggle({
  label,
  description,
  icon,
  enabled,
  busy,
  color,
  onToggle,
}: ToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      className={`group relative flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 cursor-pointer select-none min-w-[160px] ${
        enabled
          ? `border-transparent bg-gradient-to-br ${color} shadow-lg shadow-black/20`
          : "border-zinc-700/50 bg-zinc-900/60 hover:border-zinc-600/60 hover:bg-zinc-800/60"
      } ${busy ? "opacity-70 cursor-not-allowed" : ""}`}
    >
      {/* Active glow ring */}
      {enabled && (
        <div
          className={`absolute inset-0 rounded-xl opacity-20 blur-sm ${color} -z-10`}
        />
      )}

      {/* Icon + pulse dot */}
      <div className="relative flex-shrink-0">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
            enabled ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {busy ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            icon
          )}
        </div>
        {/* Pulse dot when active */}
        {enabled && !busy && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
        )}
      </div>

      {/* Text */}
      <div className="flex flex-col items-start text-left">
        <span
          className={`text-xs font-semibold leading-tight ${
            enabled ? "text-white" : "text-zinc-300"
          }`}
        >
          {label}
        </span>
        <span
          className={`text-[10px] leading-tight ${
            enabled ? "text-white/70" : "text-zinc-500"
          }`}
        >
          {description}
        </span>
      </div>

      {/* Toggle pill */}
      <div
        className={`ml-auto flex-shrink-0 h-5 w-9 rounded-full transition-all duration-300 ${
          enabled ? "bg-white/30" : "bg-zinc-700"
        }`}
      >
        <div
          className={`h-4 w-4 rounded-full shadow-sm transition-all duration-300 mt-0.5 ${
            enabled
              ? "translate-x-4 bg-white"
              : "translate-x-0.5 bg-zinc-400"
          }`}
        />
      </div>
    </button>
  );
}

export function MonitoringBar() {
  const {
    motionEnabled,
    recordingEnabled,
    snapshotsEnabled,
    motionBusy,
    recordingBusy,
    snapshotsBusy,
    setMotion,
    setRecording,
    setSnapshots,
    setMotionBusy,
    setRecordingBusy,
    setSnapshotsBusy,
  } = useMonitoringStore();

  // Sync state from config on mount (fire-and-forget, don't block UI)
  const hasSynced = useRef(false);
  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;

    async function syncFromServer() {
      try {
        const res = await fetch(`${API_URL}/api/v1/config/keys`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!json.success || !Array.isArray(json.data?.keys)) return;
        const keys: string[] = json.data.keys;

        // Fetch values for monitoring keys that exist
        const toFetch = ["MOTION_DETECTION_ENABLED", "SNAPSHOTS_ENABLED"].filter(
          (k) => keys.includes(k),
        );

        await Promise.all(
          toFetch.map(async (key) => {
            const r = await fetch(`${API_URL}/api/v1/config/keys/${key}`, {
              headers: getAuthHeaders(),
            });
            if (!r.ok) return;
            const d = await r.json();
            if (!d.success) return;
            const val = d.data?.value;
            if (key === "MOTION_DETECTION_ENABLED" && val !== null) {
              setMotion(val !== "false");
            }
            if (key === "SNAPSHOTS_ENABLED" && val !== null) {
              setSnapshots(val !== "false");
            }
          }),
        );
      } catch {
        // Non-critical — keep local state
      }
    }

    syncFromServer();
  }, [setMotion, setSnapshots]);

  async function handleMotion() {
    if (motionBusy) return;
    const next = !motionEnabled;
    setMotion(next); // optimistic
    setMotionBusy(true);
    try {
      await setConfigKey("MOTION_DETECTION_ENABLED", next ? "true" : "false");
    } catch {
      setMotion(!next); // revert
    } finally {
      setMotionBusy(false);
    }
  }

  async function handleRecording() {
    if (recordingBusy) return;
    const next = !recordingEnabled;
    setRecordingBusy(true);
    try {
      if (next) {
        // Start recording on all online cameras
        await fetch(`${API_URL}/api/v1/recordings/start-all`, {
          method: "POST",
          headers: getAuthHeaders(),
        });
      } else {
        await fetch(`${API_URL}/api/v1/recordings/stop-all`, {
          method: "POST",
          headers: getAuthHeaders(),
        });
      }
      setRecording(next);
    } catch {
      // Keep optimistic state — non-critical
      setRecording(next);
    } finally {
      setRecordingBusy(false);
    }
  }

  async function handleSnapshots() {
    if (snapshotsBusy) return;
    const next = !snapshotsEnabled;
    setSnapshots(next); // optimistic
    setSnapshotsBusy(true);
    try {
      await setConfigKey("SNAPSHOTS_ENABLED", next ? "true" : "false");
    } catch {
      setSnapshots(!next); // revert
    } finally {
      setSnapshotsBusy(false);
    }
  }

  return (
    <div className="mb-6 flex flex-wrap gap-3 items-center">
      {/* Label */}
      <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest self-center mr-1 hidden sm:block">
        Monitoring
      </span>

      <MonitoringToggle
        label="Motion Detection"
        description={motionEnabled ? "Active" : "Paused"}
        icon={<Activity className="h-4 w-4" />}
        enabled={motionEnabled}
        busy={motionBusy}
        color="from-emerald-600/80 to-emerald-500/60"
        onToggle={handleMotion}
      />

      <MonitoringToggle
        label="Recording"
        description={recordingEnabled ? "All cameras" : "Off"}
        icon={<Video className="h-4 w-4" />}
        enabled={recordingEnabled}
        busy={recordingBusy}
        color="from-red-600/80 to-red-500/60"
        onToggle={handleRecording}
      />

      <MonitoringToggle
        label="Snapshots"
        description={snapshotsEnabled ? "Capturing" : "Paused"}
        icon={<Camera className="h-4 w-4" />}
        enabled={snapshotsEnabled}
        busy={snapshotsBusy}
        color="from-blue-600/80 to-blue-500/60"
        onToggle={handleSnapshots}
      />
    </div>
  );
}
