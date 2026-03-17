"use client";

import { useState, useEffect, useCallback } from "react";
import { CameraGrid } from "@/components/camera/CameraGrid";
import { LiveEventFeed } from "@/components/events/LiveEventFeed";
import type { Camera, EventSummary, ApiResponse } from "@osp/shared";

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
  readonly camerasOnline: number;
  readonly eventsToday: number;
  readonly unacknowledgedAlerts: number;
}

function StatCard({
  label,
  value,
  color,
}: {
  readonly label: string;
  readonly value: number;
  readonly color: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [cameras, setCameras] = useState<readonly Camera[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalCameras: 0,
    camerasOnline: 0,
    eventsToday: 0,
    unacknowledgedAlerts: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [camerasRes, summaryRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/cameras`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/v1/events/summary`, {
          headers: getAuthHeaders(),
        }),
      ]);

      const camerasJson: ApiResponse<Camera[]> = await camerasRes.json();
      const cameraList =
        camerasJson.success && camerasJson.data ? camerasJson.data : [];
      setCameras(cameraList);

      const onlineCount = cameraList.filter(
        (c) => c.status === "online",
      ).length;

      let eventsToday = 0;
      let unacknowledged = 0;

      if (summaryRes.ok) {
        const summaryJson: ApiResponse<EventSummary> =
          await summaryRes.json();
        if (summaryJson.success && summaryJson.data) {
          eventsToday = summaryJson.data.total;
          unacknowledged = summaryJson.data.unacknowledged;
        }
      }

      setStats({
        totalCameras: cameraList.length,
        camerasOnline: onlineCount,
        eventsToday,
        unacknowledgedAlerts: unacknowledged,
      });
    } catch {
      // Stats will remain at defaults on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Cameras"
          value={stats.totalCameras}
          color="text-[var(--color-fg)]"
        />
        <StatCard
          label="Cameras Online"
          value={stats.camerasOnline}
          color="text-[var(--color-success)]"
        />
        <StatCard
          label="Events Today"
          value={stats.eventsToday}
          color="text-[var(--color-primary)]"
        />
        <StatCard
          label="Unacknowledged Alerts"
          value={stats.unacknowledgedAlerts}
          color={
            stats.unacknowledgedAlerts > 0
              ? "text-[var(--color-error)]"
              : "text-[var(--color-fg)]"
          }
        />
      </div>

      {/* Main content: camera grid + live event feed */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Camera grid */}
        <div className="xl:col-span-3">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-[var(--color-muted)]">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]" />
              <span className="ml-3 text-sm">Loading cameras...</span>
            </div>
          ) : (
            <CameraGrid cameras={cameras} />
          )}
        </div>

        {/* Live event feed sidebar */}
        <div className="xl:col-span-1">
          <LiveEventFeed maxEvents={50} />
        </div>
      </div>
    </div>
  );
}
