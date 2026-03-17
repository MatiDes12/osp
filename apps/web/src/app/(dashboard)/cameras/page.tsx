"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useCameras } from "@/hooks/use-cameras";
import { CameraGrid } from "@/components/camera/CameraGrid";
import { AddCameraDialog } from "@/components/camera/AddCameraDialog";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/StatCard";
import { PageError } from "@/components/PageError";
import { Camera, Wifi, Bell, Circle } from "lucide-react";

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

interface DashboardStats {
  readonly totalCameras: number;
  readonly onlineCameras: number;
  readonly eventsToday: number;
  readonly activeRecordings: number;
}

export default function CamerasPage() {
  const { cameras, loading, error, refetch, addCamera } = useCameras();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const filteredCameras = useMemo(() => {
    if (!search.trim()) return cameras;
    const query = search.toLowerCase();
    return cameras.filter((c) => c.name.toLowerCase().includes(query));
  }, [cameras, search]);

  const handleAddCamera = useCallback(
    async (data: {
      name: string;
      protocol: "rtsp" | "onvif";
      connectionUri: string;
      location?: { label?: string };
    }) => {
      await addCamera(data);
    },
    [addCamera],
  );

  // Fetch dashboard stats
  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      setStatsLoading(true);
      try {
        const [eventSummaryRes, recordingsRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/events/summary`, {
            headers: getAuthHeaders(),
          }).catch(() => null),
          fetch(`${API_URL}/api/v1/recordings?status=recording&limit=1`, {
            headers: getAuthHeaders(),
          }).catch(() => null),
        ]);

        let eventsToday = 0;
        let activeRecordings = 0;

        if (eventSummaryRes) {
          try {
            const json = await eventSummaryRes.json();
            if (json.success && json.data) {
              eventsToday = json.data.total ?? 0;
            }
          } catch {
            // Non-critical
          }
        }

        if (recordingsRes) {
          try {
            const json = await recordingsRes.json();
            if (json.success && json.meta) {
              activeRecordings = json.meta.total ?? 0;
            } else if (json.success && json.data) {
              activeRecordings = Array.isArray(json.data)
                ? json.data.length
                : 0;
            }
          } catch {
            // Non-critical
          }
        }

        if (!cancelled) {
          setStats({
            totalCameras: cameras.length,
            onlineCameras: cameras.filter((c) => c.status === "online").length,
            eventsToday,
            activeRecordings,
          });
        }
      } catch {
        // Stats are non-critical; fall back to camera-only stats
        if (!cancelled) {
          setStats({
            totalCameras: cameras.length,
            onlineCameras: cameras.filter((c) => c.status === "online").length,
            eventsToday: 0,
            activeRecordings: 0,
          });
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
        }
      }
    }

    if (!loading && cameras.length >= 0) {
      fetchStats();
    }

    return () => {
      cancelled = true;
    };
  }, [cameras, loading]);

  return (
    <div>
      {/* Stats overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statsLoading || loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Total Cameras"
              value={stats?.totalCameras ?? cameras.length}
              icon={Camera}
            />
            <StatCard
              label="Online"
              value={`${stats?.onlineCameras ?? 0}/${stats?.totalCameras ?? cameras.length}`}
              icon={Wifi}
              color="text-green-400"
            />
            <StatCard
              label="Events Today"
              value={stats?.eventsToday ?? 0}
              icon={Bell}
            />
            <StatCard
              label="Active Recordings"
              value={stats?.activeRecordings ?? 0}
              icon={Circle}
              color="text-red-400"
            />
          </>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Cameras</h1>
        <button
          onClick={() => setDialogOpen(true)}
          className="px-4 py-2 text-sm rounded-md bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors"
        >
          Add Camera
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cameras by name..."
          className="w-full max-w-sm rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-[var(--color-muted)]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]" />
          <span className="ml-3 text-sm">Loading cameras...</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <PageError message={error} onRetry={refetch} />
      )}

      {/* Camera grid */}
      {!loading && !error && <CameraGrid cameras={filteredCameras} />}

      {/* Add camera dialog */}
      <AddCameraDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleAddCamera}
      />
    </div>
  );
}
