"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { StatusIndicator } from "@osp/ui";
import { LiveViewPlayer } from "@/components/camera/LiveViewPlayer";
import type { Camera, CameraZone, OSPEvent, ApiResponse } from "@osp/shared";

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

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never";
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export default function CameraDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const cameraId = params.id;

  const [camera, setCamera] = useState<Camera | null>(null);
  const [zones, setZones] = useState<readonly CameraZone[]>([]);
  const [events, setEvents] = useState<readonly OSPEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCamera = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cameraRes, zonesRes, eventsRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/cameras/${cameraId}`, {
          headers: getAuthHeaders(),
        }),
        fetch(`${API_URL}/api/v1/cameras/${cameraId}/zones`, {
          headers: getAuthHeaders(),
        }),
        fetch(`${API_URL}/api/v1/events?cameraId=${cameraId}&limit=10`, {
          headers: getAuthHeaders(),
        }),
      ]);

      const cameraJson: ApiResponse<Camera> = await cameraRes.json();
      if (!cameraJson.success || !cameraJson.data) {
        setError(cameraJson.error?.message ?? "Camera not found");
        return;
      }
      setCamera(cameraJson.data);

      const zonesJson: ApiResponse<CameraZone[]> = await zonesRes.json();
      if (zonesJson.success && zonesJson.data) {
        setZones(zonesJson.data);
      }

      const eventsJson: ApiResponse<OSPEvent[]> = await eventsRes.json();
      if (eventsJson.success && eventsJson.data) {
        setEvents(eventsJson.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [cameraId]);

  useEffect(() => {
    fetchCamera();
  }, [fetchCamera]);

  const handleDelete = useCallback(async () => {
    if (!confirm("Are you sure you want to delete this camera?")) return;
    setDeleting(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/cameras/${cameraId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const json: ApiResponse<void> = await response.json();
      if (json.success) {
        router.push("/cameras");
      } else {
        alert(json.error?.message ?? "Failed to delete camera");
      }
    } catch {
      alert("Network error while deleting camera");
    } finally {
      setDeleting(false);
    }
  }, [cameraId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--color-muted)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]" />
        <span className="ml-3 text-sm">Loading camera...</span>
      </div>
    );
  }

  if (error || !camera) {
    return (
      <div className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 p-4 text-sm text-[var(--color-error)]">
        <p className="font-medium mb-1">Error loading camera</p>
        <p className="text-xs opacity-80">{error ?? "Camera not found"}</p>
        <button
          onClick={() => router.push("/cameras")}
          className="mt-2 text-xs underline hover:no-underline"
        >
          Back to cameras
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/cameras")}
            className="text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold">{camera.name}</h1>
          <StatusIndicator status={camera.status} size="md" label />
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 text-sm rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors">
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 text-sm rounded-md border border-[var(--color-error)]/30 text-[var(--color-error)] hover:bg-[var(--color-error)]/10 transition-colors disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live view */}
        <div className="lg:col-span-2">
          <LiveViewPlayer
            cameraId={camera.id}
            cameraName={camera.name}
          />
        </div>

        {/* Camera info panel */}
        <div className="space-y-6">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <h2 className="text-sm font-semibold mb-3">Camera Info</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">Protocol</dt>
                <dd className="font-medium uppercase">{camera.protocol}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">Status</dt>
                <dd><StatusIndicator status={camera.status} size="sm" label /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">Manufacturer</dt>
                <dd className="font-medium">{camera.manufacturer ?? "Unknown"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">Model</dt>
                <dd className="font-medium">{camera.model ?? "Unknown"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">Firmware</dt>
                <dd className="font-medium">{camera.firmwareVersion ?? "N/A"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">Location</dt>
                <dd className="font-medium">{camera.location?.label ?? "Not set"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">Last Seen</dt>
                <dd className="font-medium">{formatRelativeTime(camera.lastSeenAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">Recording</dt>
                <dd className="font-medium capitalize">{camera.config.recordingMode}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">PTZ</dt>
                <dd className="font-medium">{camera.ptzCapable ? "Yes" : "No"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">Audio</dt>
                <dd className="font-medium">{camera.audioCapable ? "Yes" : "No"}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Zones */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Zones ({zones.length})</h2>
          <button className="px-3 py-1 text-xs rounded-md bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors">
            Add Zone
          </button>
        </div>
        {zones.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)] py-4 text-center">
            No detection zones configured. Add a zone to define areas of interest.
          </p>
        ) : (
          <div className="space-y-2">
            {zones.map((zone) => (
              <div
                key={zone.id}
                className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: zone.colorHex }}
                  />
                  <span className="text-sm font-medium">{zone.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                  <span>Sensitivity: {zone.sensitivity}/10</span>
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      zone.alertEnabled
                        ? "bg-[var(--color-success)]/10 text-[var(--color-success)]"
                        : "bg-gray-500/10 text-gray-500"
                    }`}
                  >
                    {zone.alertEnabled ? "Active" : "Disabled"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Events */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <h2 className="text-sm font-semibold mb-3">Recent Events</h2>
        {events.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)] py-4 text-center">
            No recent events for this camera.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-border)]">
                  <th className="pb-2 pr-4">Time</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Severity</th>
                  <th className="pb-2">Zone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="py-2 pr-4 text-[var(--color-muted)]">
                      {formatRelativeTime(event.detectedAt)}
                    </td>
                    <td className="py-2 pr-4 capitalize">{event.type.replace("_", " ")}</td>
                    <td className="py-2 pr-4">
                      <SeverityBadge severity={event.severity} />
                    </td>
                    <td className="py-2 text-[var(--color-muted)]">
                      {event.zoneName ?? "All"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { readonly severity: string }) {
  const colors: Record<string, string> = {
    low: "bg-blue-500/10 text-blue-400",
    medium: "bg-yellow-500/10 text-yellow-400",
    high: "bg-orange-500/10 text-orange-400",
    critical: "bg-red-500/10 text-red-400",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${colors[severity] ?? "bg-gray-500/10 text-gray-400"}`}>
      {severity}
    </span>
  );
}
