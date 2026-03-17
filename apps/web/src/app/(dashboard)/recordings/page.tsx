"use client";

import { useState, useEffect, useCallback } from "react";
import type { Recording, Camera, ApiResponse } from "@osp/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("osp_access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TRIGGER_COLORS: Record<string, string> = {
  motion: "bg-blue-500/10 text-blue-400",
  continuous: "bg-gray-500/10 text-gray-400",
  manual: "bg-purple-500/10 text-purple-400",
  rule: "bg-orange-500/10 text-orange-400",
  ai_detection: "bg-green-500/10 text-green-400",
};

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<readonly Recording[]>([]);
  const [cameras, setCameras] = useState<readonly Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cameraFilter, setCameraFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cameraFilter) params.set("cameraId", cameraFilter);
      if (dateFilter) {
        const dayStart = new Date(dateFilter);
        const dayEnd = new Date(dateFilter);
        dayEnd.setDate(dayEnd.getDate() + 1);
        params.set("from", dayStart.toISOString());
        params.set("to", dayEnd.toISOString());
      }
      params.set("limit", "50");

      const [recordingsRes, camerasRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/recordings?${params.toString()}`, {
          headers: getAuthHeaders(),
        }),
        fetch(`${API_URL}/api/v1/cameras`, {
          headers: getAuthHeaders(),
        }),
      ]);

      const recordingsJson: ApiResponse<Recording[]> = await recordingsRes.json();
      if (recordingsJson.success && recordingsJson.data) {
        setRecordings(recordingsJson.data);
      } else {
        setError(recordingsJson.error?.message ?? "Failed to load recordings");
      }

      const camerasJson: ApiResponse<Camera[]> = await camerasRes.json();
      if (camerasJson.success && camerasJson.data) {
        setCameras(camerasJson.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [cameraFilter, dateFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Recordings</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={cameraFilter}
          onChange={(e) => setCameraFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        >
          <option value="">All Cameras</option>
          {cameras.map((cam) => (
            <option key={cam.id} value={cam.id}>
              {cam.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />

        {(cameraFilter || dateFilter) && (
          <button
            onClick={() => {
              setCameraFilter("");
              setDateFilter("");
            }}
            className="px-3 py-2 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recordings list */}
        <div className="lg:col-span-2">
          {loading && (
            <div className="flex items-center justify-center py-20 text-[var(--color-muted)]">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]" />
              <span className="ml-3 text-sm">Loading recordings...</span>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 p-4 text-sm text-[var(--color-error)]">
              <p className="font-medium mb-1">Failed to load recordings</p>
              <p className="text-xs opacity-80">{error}</p>
              <button onClick={fetchData} className="mt-2 text-xs underline hover:no-underline">
                Try again
              </button>
            </div>
          )}

          {!loading && !error && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
              {recordings.length === 0 ? (
                <div className="py-12 text-center text-[var(--color-muted)]">
                  <p className="text-sm">No recordings found.</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {recordings.map((rec) => (
                    <button
                      key={rec.id}
                      onClick={() => setSelectedRecording(rec)}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors ${
                        selectedRecording?.id === rec.id ? "bg-white/[0.04]" : ""
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{rec.cameraName}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                              TRIGGER_COLORS[rec.trigger] ?? "bg-gray-500/10 text-gray-400"
                            }`}
                          >
                            {rec.trigger.replace("_", " ")}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--color-muted)]">
                          {formatTime(rec.startTime)}
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-sm">{formatDuration(rec.durationSec)}</p>
                        <p className="text-xs text-[var(--color-muted)]">
                          {formatBytes(rec.sizeBytes)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Video player placeholder */}
        <div>
          <div className="sticky top-6">
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
              <div className="aspect-video bg-black flex items-center justify-center">
                {selectedRecording ? (
                  <div className="text-center">
                    <svg
                      className="w-10 h-10 mx-auto mb-2 text-[var(--color-primary)] opacity-60"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <p className="text-xs text-[var(--color-muted)]">
                      {selectedRecording.cameraName}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">
                    Select a recording to play
                  </p>
                )}
              </div>
              {selectedRecording && (
                <div className="p-3 space-y-1 text-xs text-[var(--color-muted)]">
                  <p>
                    <span className="text-[var(--color-fg)]">Camera:</span>{" "}
                    {selectedRecording.cameraName}
                  </p>
                  <p>
                    <span className="text-[var(--color-fg)]">Start:</span>{" "}
                    {formatTime(selectedRecording.startTime)}
                  </p>
                  <p>
                    <span className="text-[var(--color-fg)]">Duration:</span>{" "}
                    {formatDuration(selectedRecording.durationSec)}
                  </p>
                  <p>
                    <span className="text-[var(--color-fg)]">Size:</span>{" "}
                    {formatBytes(selectedRecording.sizeBytes)}
                  </p>
                  <p>
                    <span className="text-[var(--color-fg)]">Format:</span>{" "}
                    {selectedRecording.format}
                  </p>
                  <p>
                    <span className="text-[var(--color-fg)]">Status:</span>{" "}
                    <span className="capitalize">{selectedRecording.status}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
