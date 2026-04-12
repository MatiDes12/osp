"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Activity, Video, Camera, Calendar, X, Clock, StopCircle, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useMonitoringStore, type RecordingSchedule } from "@/stores/monitoring";
import { createPortal } from "react-dom";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("osp_access_token") : null;
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

/** Returns "YYYY-MM-DDTHH:MM" local time — required for datetime-local inputs */
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Current datetime rounded to the minute, for use as min= on datetime-local */
function nowDatetimeLocal(): string {
  return toDatetimeLocal(new Date().toISOString());
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "ending soon";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${s}s left`;
  return `${s}s left`;
}

function scheduleStatus(s: RecordingSchedule): "past" | "active" | "upcoming" {
  const now = Date.now();
  const start = new Date(s.start).getTime();
  const end = new Date(s.end).getTime();
  if (now >= end) return "past";
  if (now >= start) return "active";
  return "upcoming";
}

// ── Simple toggle ─────────────────────────────────────────────────────────────

interface ToggleProps {
  label: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  busy: boolean;
  color: string;
  onToggle: () => void;
}

function MonitoringToggle({ label, description, icon, enabled, busy, color, onToggle }: ToggleProps) {
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
      {enabled && <div className={`absolute inset-0 rounded-xl opacity-20 blur-sm ${color} -z-10`} />}
      <div className="relative flex-shrink-0">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${enabled ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-400"}`}>
          {busy ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
        </div>
        {enabled && !busy && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
        )}
      </div>
      <div className="flex flex-col items-start text-left">
        <span className={`text-xs font-semibold leading-tight ${enabled ? "text-white" : "text-zinc-300"}`}>{label}</span>
        <span className={`text-[10px] leading-tight ${enabled ? "text-white/70" : "text-zinc-500"}`}>{description}</span>
      </div>
      <div className={`ml-auto flex-shrink-0 h-5 w-9 rounded-full transition-all duration-300 ${enabled ? "bg-white/30" : "bg-zinc-700"}`}>
        <div className={`h-4 w-4 rounded-full shadow-sm transition-all duration-300 mt-0.5 ${enabled ? "translate-x-4 bg-white" : "translate-x-0.5 bg-zinc-400"}`} />
      </div>
    </button>
  );
}

// ── Schedule list panel ───────────────────────────────────────────────────────

function ScheduleListPanel({ onClose }: { onClose: () => void }) {
  const { recordingSchedules, removeRecordingSchedule, clearPastSchedules } = useMonitoringStore();

  const sorted = [...recordingSchedules].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  const hasPast = sorted.some((s) => scheduleStatus(s) === "past");

  return (
    <div className="mt-2 w-full rounded-xl border border-zinc-700/60 bg-zinc-900/90 backdrop-blur-sm shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-700/40">
        <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" /> Recording Schedules
        </span>
        <div className="flex items-center gap-2">
          {hasPast && (
            <button
              onClick={clearPastSchedules}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              Clear past
            </button>
          )}
          <button onClick={onClose} className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <div className="px-4 py-5 text-center text-xs text-zinc-500">
          No schedules. Click &ldquo;Record / Schedule…&rdquo; to add one.
        </div>
      ) : (
        <div className="divide-y divide-zinc-800/60 max-h-64 overflow-y-auto">
          {sorted.map((s) => {
            const status = scheduleStatus(s);
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/40 transition-colors">
                {/* Status dot */}
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    status === "active" ? "bg-red-400 animate-pulse" :
                    status === "upcoming" ? "bg-amber-400" : "bg-zinc-600"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                      status === "active" ? "text-red-400" :
                      status === "upcoming" ? "text-amber-400" : "text-zinc-500"
                    }`}>
                      {status === "active" ? "Recording" : status === "upcoming" ? "Upcoming" : "Done"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-tight truncate">
                    {fmtDatetime(s.start)} → {fmtDatetime(s.end)}
                  </p>
                </div>
                <button
                  onClick={() => removeRecordingSchedule(s.id)}
                  className="flex-shrink-0 p-1 rounded hover:bg-zinc-700 text-zinc-600 hover:text-red-400 transition-colors cursor-pointer"
                  title="Remove schedule"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Schedule Recording button + dialog ────────────────────────────────────────

function ScheduleRecordingButton({ onShowList }: { onShowList: () => void }) {
  const {
    recordingEnabled,
    recordingSchedules,
    recordingBusy,
    setRecording,
    addRecordingSchedule,
    removeRecordingSchedule,
    setRecordingBusy,
  } = useMonitoringStore();

  const [open, setOpen] = useState(false);
  const [countdown, setCountdown] = useState("");
  const [minVal, setMinVal] = useState(nowDatetimeLocal);

  // Default: now → 1 hour from now
  const [startVal, setStartVal] = useState(() => nowDatetimeLocal());
  const [endVal, setEndVal] = useState(() => toDatetimeLocal(new Date(Date.now() + 3_600_000).toISOString()));

  // Refresh min every 30s so it stays accurate while dialog is open
  useEffect(() => {
    const id = setInterval(() => setMinVal(nowDatetimeLocal()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Active schedule = the one currently in range
  const activeSchedule = recordingSchedules.find((s) => scheduleStatus(s) === "active") ?? null;

  // Countdown ticker while recording is active
  useEffect(() => {
    if (!recordingEnabled || !activeSchedule) { setCountdown(""); return; }
    const tick = () => {
      const ms = new Date(activeSchedule.end).getTime() - Date.now();
      setCountdown(formatCountdown(ms));
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [recordingEnabled, activeSchedule]);

  // Schedule watcher: auto-start / auto-stop based on ALL schedules
  useEffect(() => {
    if (recordingSchedules.length === 0) return;

    const check = async () => {
      const now = Date.now();
      const shouldBeOn = recordingSchedules.some(
        (s) => now >= new Date(s.start).getTime() && now < new Date(s.end).getTime(),
      );
      const allEnded = recordingSchedules.every(
        (s) => now >= new Date(s.end).getTime(),
      );
      const isOn = useMonitoringStore.getState().recordingEnabled;

      if (shouldBeOn && !isOn) {
        setRecordingBusy(true);
        try {
          await fetch(`${API_URL}/api/v1/recordings/start-all`, { method: "POST", headers: getAuthHeaders() });
        } catch { /* local recording doesn't need the gateway */ }
        setRecording(true);
        setRecordingBusy(false);
      } else if (!shouldBeOn && isOn && allEnded) {
        setRecordingBusy(true);
        try {
          await fetch(`${API_URL}/api/v1/recordings/stop-all`, { method: "POST", headers: getAuthHeaders() });
        } catch { /* non-critical */ }
        setRecording(false);
        setRecordingBusy(false);
      }
    };

    void check();
    const id = setInterval(() => void check(), 10_000);
    return () => clearInterval(id);
  }, [recordingSchedules, setRecording, setRecordingBusy]);

  const handleSchedule = useCallback(async () => {
    const startDate = new Date(startVal);
    const endDate = new Date(endVal);
    if (endDate <= startDate) return;
    if (startDate < new Date()) {
      // Shouldn't happen if min= is set, but guard anyway
      return;
    }

    const schedule: RecordingSchedule = {
      id: new Date().toISOString(),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };

    setOpen(false);
    addRecordingSchedule(schedule);

    // Start immediately if start is within 30s of now
    const startsIn = startDate.getTime() - Date.now();
    if (startsIn <= 30_000) {
      setRecordingBusy(true);
      try {
        await fetch(`${API_URL}/api/v1/recordings/start-all`, { method: "POST", headers: getAuthHeaders() });
      } catch { /* local recording doesn't need the gateway */ }
      setRecording(true);
      setRecordingBusy(false);
    }
  }, [startVal, endVal, addRecordingSchedule, setRecording, setRecordingBusy]);

  const handleStop = useCallback(async () => {
    setRecordingBusy(true);
    try {
      await fetch(`${API_URL}/api/v1/recordings/stop-all`, { method: "POST", headers: getAuthHeaders() });
    } catch { /* non-critical */ }
    setRecording(false);
    // Remove only the active schedule
    if (activeSchedule) removeRecordingSchedule(activeSchedule.id);
    setRecordingBusy(false);
  }, [activeSchedule, removeRecordingSchedule, setRecording, setRecordingBusy]);

  const isActive = recordingEnabled && !!activeSchedule;
  const upcomingCount = recordingSchedules.filter((s) => scheduleStatus(s) === "upcoming").length;

  // ── Dialog ──────────────────────────────────────────────────────────────────
  const dialog = open
    ? createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 9999 }}
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4"
            style={{ zIndex: 10000 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <Video className="w-3.5 h-3.5 text-red-400" />
                </div>
                <span className="text-sm font-semibold text-zinc-100">Schedule Recording</span>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-500 mb-4">
              Set a future start and end time. Recording will automatically start and stop for all connected cameras.
            </p>

            {/* Start */}
            <label className="block mb-3">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium flex items-center gap-1 mb-1">
                <Clock className="w-3 h-3" /> Start
              </span>
              <input
                type="datetime-local"
                value={startVal}
                min={minVal}
                onChange={(e) => {
                  setStartVal(e.target.value);
                  // Push end forward if it's no longer after start
                  if (e.target.value >= endVal) {
                    setEndVal(toDatetimeLocal(
                      new Date(new Date(e.target.value).getTime() + 3_600_000).toISOString(),
                    ));
                  }
                }}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-red-500/50"
              />
            </label>

            {/* End */}
            <label className="block mb-4">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium flex items-center gap-1 mb-1">
                <Clock className="w-3 h-3" /> End
              </span>
              <input
                type="datetime-local"
                value={endVal}
                min={startVal || minVal}
                onChange={(e) => setEndVal(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-red-500/50"
              />
            </label>

            {new Date(endVal) <= new Date(startVal) && (
              <p className="text-[10px] text-red-400 mb-3">End time must be after start time.</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 px-3 py-2 rounded-lg text-sm text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSchedule}
                disabled={new Date(endVal) <= new Date(startVal) || recordingBusy}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {new Date(startVal).getTime() - Date.now() <= 30_000 ? "Start Now" : "Schedule"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  // ── Active recording card ────────────────────────────────────────────────────
  if (isActive) {
    return (
      <>
        <div className="relative flex items-center gap-3 px-4 py-3 rounded-xl border border-transparent bg-gradient-to-br from-red-600/80 to-red-500/60 shadow-lg shadow-black/20 min-w-[200px]">
          <div className="relative flex-shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white">
              {recordingBusy
                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                : <Video className="h-4 w-4" />}
            </div>
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
          </div>
          <div className="flex flex-col items-start text-left flex-1 min-w-0">
            <span className="text-xs font-semibold text-white leading-tight">Recording</span>
            <span className="text-[10px] text-white/70 leading-tight truncate">
              {countdown || `until ${fmtDatetime(activeSchedule.end)}`}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onShowList}
              className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="View schedules"
            >
              <Calendar className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleStop}
              disabled={recordingBusy}
              className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer disabled:opacity-40"
              title="Stop recording"
            >
              <StopCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
        {dialog}
      </>
    );
  }

  // ── Idle / scheduled button ──────────────────────────────────────────────────
  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            const n = new Date();
            setStartVal(toDatetimeLocal(n.toISOString()));
            setEndVal(toDatetimeLocal(new Date(n.getTime() + 3_600_000).toISOString()));
            setMinVal(nowDatetimeLocal());
            setOpen(true);
          }}
          disabled={recordingBusy}
          className="relative flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-700/50 bg-zinc-900/60 hover:border-zinc-600/60 hover:bg-zinc-800/60 transition-all duration-300 cursor-pointer select-none min-w-[160px] disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400 flex-shrink-0">
            {recordingBusy
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              : <Video className="h-4 w-4" />}
          </div>
          <div className="flex flex-col items-start text-left">
            <span className="text-xs font-semibold text-zinc-300 leading-tight">Record</span>
            <span className="text-[10px] text-zinc-500 leading-tight">Schedule…</span>
          </div>
          {upcomingCount > 0 && (
            <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/80 text-[9px] font-bold text-white flex-shrink-0">
              {upcomingCount}
            </span>
          )}
        </button>
        <button
          onClick={onShowList}
          className="flex h-9 w-7 items-center justify-center rounded-lg border border-zinc-700/50 bg-zinc-900/60 hover:bg-zinc-800/60 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer flex-shrink-0"
          title="View all schedules"
        >
          <Calendar className="h-3.5 w-3.5" />
        </button>
      </div>
      {dialog}
    </>
  );
}

// ── Main MonitoringBar ────────────────────────────────────────────────────────

export function MonitoringBar() {
  const {
    motionEnabled,
    snapshotsEnabled,
    motionBusy,
    snapshotsBusy,
    setMotion,
    setSnapshots,
    setRecording,
    setMotionBusy,
    setSnapshotsBusy,
  } = useMonitoringStore();

  const [showSchedules, setShowSchedules] = useState(false);

  const hasSynced = useRef(false);
  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;

    async function syncFromServer() {
      try {
        const res = await fetch(`${API_URL}/api/v1/config/keys`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const json = await res.json();
        if (!json.success || !Array.isArray(json.data?.keys)) return;
        const keys: string[] = json.data.keys;

        const toFetch = ["MOTION_DETECTION_ENABLED", "SNAPSHOTS_ENABLED"].filter((k) => keys.includes(k));
        await Promise.all(
          toFetch.map(async (key) => {
            const r = await fetch(`${API_URL}/api/v1/config/keys/${key}`, { headers: getAuthHeaders() });
            if (!r.ok) return;
            const d = await r.json();
            if (!d.success) return;
            const val = d.data?.value;
            if (key === "MOTION_DETECTION_ENABLED" && val !== null) setMotion(val !== "false");
            if (key === "SNAPSHOTS_ENABLED" && val !== null) setSnapshots(val !== "false");
          }),
        );

        try {
          const recRes = await fetch(`${API_URL}/api/v1/recordings?status=recording&limit=1`, { headers: getAuthHeaders() });
          if (recRes.ok) {
            const recJson = await recRes.json();
            if (recJson.success) {
              setRecording(Array.isArray(recJson.data) && recJson.data.length > 0);
            }
          }
        } catch { /* non-critical */ }
      } catch { /* keep local state */ }
    }

    syncFromServer();
  }, [setMotion, setSnapshots, setRecording]);

  async function handleMotion() {
    if (motionBusy) return;
    const next = !motionEnabled;
    setMotion(next);
    setMotionBusy(true);
    try {
      await setConfigKey("MOTION_DETECTION_ENABLED", next ? "true" : "false");
    } catch {
      setMotion(!next);
    } finally {
      setMotionBusy(false);
    }
  }

  async function handleSnapshots() {
    if (snapshotsBusy) return;
    const next = !snapshotsEnabled;
    setSnapshots(next);
    setSnapshotsBusy(true);
    try {
      await setConfigKey("SNAPSHOTS_ENABLED", next ? "true" : "false");
    } catch {
      setSnapshots(!next);
    } finally {
      setSnapshotsBusy(false);
    }
  }

  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-3 items-center">
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

        <ScheduleRecordingButton onShowList={() => setShowSchedules((v) => !v)} />

        <MonitoringToggle
          label="Snapshots"
          description={snapshotsEnabled ? "Capturing" : "Paused"}
          icon={<Camera className="h-4 w-4" />}
          enabled={snapshotsEnabled}
          busy={snapshotsBusy}
          color="from-blue-600/80 to-blue-500/60"
          onToggle={handleSnapshots}
        />

        {showSchedules && (
          <button
            onClick={() => setShowSchedules(false)}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer ml-auto"
          >
            <ChevronUp className="w-3 h-3" /> Hide
          </button>
        )}
        {!showSchedules && (
          <button
            onClick={() => setShowSchedules(true)}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer ml-auto sm:hidden"
          >
            <ChevronDown className="w-3 h-3" /> Schedules
          </button>
        )}
      </div>

      {showSchedules && (
        <ScheduleListPanel onClose={() => setShowSchedules(false)} />
      )}
    </div>
  );
}
