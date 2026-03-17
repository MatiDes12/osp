"use client";

import { useState, useEffect, useCallback } from "react";
import { Camera, Wifi, AlertTriangle, HardDrive } from "lucide-react";
import { CameraGrid } from "@/components/camera/CameraGrid";
import { LiveEventFeed } from "@/components/events/LiveEventFeed";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/StatCard";
import { AddCameraDialog } from "@/components/camera/AddCameraDialog";
import type { Camera as CameraType, EventSummary, ApiResponse } from "@osp/shared";

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
  readonly activeAlerts: number;
  readonly storageUsedPercent: number;
  readonly recordingCount: number;
}

export default function DashboardPage() {
  const [cameras, setCameras] = useState<readonly CameraType[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalCameras: 0,
    camerasOnline: 0,
    activeAlerts: 0,
    storageUsedPercent: 0,
    recordingCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [camerasRes, summaryRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/cameras`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/v1/events/summary`, {
          headers: getAuthHeaders(),
        }),
      ]);

      const camerasJson: ApiResponse<CameraType[]> = await camerasRes.json();
      const cameraList =
        camerasJson.success && camerasJson.data ? camerasJson.data : [];
      setCameras(cameraList);

      const onlineCount = cameraList.filter(
        (c) => c.status === "online",
      ).length;

      const recordingCount = cameraList.filter(
        (c) => c.config.recordingMode !== "off",
      ).length;

      let activeAlerts = 0;

      if (summaryRes.ok) {
        const summaryJson: ApiResponse<EventSummary> =
          await summaryRes.json();
        if (summaryJson.success && summaryJson.data) {
          activeAlerts = summaryJson.data.unacknowledged;
        }
      }

      setStats({
        totalCameras: cameraList.length,
        camerasOnline: onlineCount,
        activeAlerts,
        storageUsedPercent: 68, // TODO: fetch from storage API
        recordingCount,
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

  const handleAddCamera = useCallback(
    async (data: {
      name: string;
      protocol: "rtsp" | "onvif";
      connectionUri: string;
      location?: { label?: string };
    }) => {
      const res = await fetch(`${API_URL}/api/v1/cameras`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error ?? `Failed to add camera (${res.status})`,
        );
      }
      await fetchData();
    },
    [fetchData],
  );

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Cameras"
              value={stats.totalCameras}
              icon={Camera}
              subtitle={`${stats.recordingCount} recording`}
            />
            <StatCard
              label="Online"
              value={stats.camerasOnline}
              icon={Wifi}
              color="text-green-500"
              progress={
                stats.totalCameras > 0
                  ? (stats.camerasOnline / stats.totalCameras) * 100
                  : 0
              }
              progressColor="bg-green-500"
              subtitle={`of ${stats.totalCameras} cameras`}
            />
            <StatCard
              label="Active Alerts"
              value={stats.activeAlerts}
              icon={AlertTriangle}
              color={stats.activeAlerts > 0 ? "text-red-400" : "text-zinc-50"}
            />
            <StatCard
              label="Storage Used"
              value={`${stats.storageUsedPercent}%`}
              icon={HardDrive}
              progress={stats.storageUsedPercent}
              progressColor={
                stats.storageUsedPercent > 90
                  ? "bg-red-500"
                  : stats.storageUsedPercent > 75
                    ? "bg-amber-500"
                    : "bg-blue-500"
              }
            />
          </>
        )}
      </div>

      {/* Main content: 70% camera grid + 30% live events */}
      <div className="flex flex-col xl:flex-row gap-4">
        {/* Camera grid - 70% */}
        <div className="flex-1 xl:w-[70%] min-w-0">
          <CameraGrid
            cameras={cameras}
            loading={loading}
            onAddCamera={() => setAddDialogOpen(true)}
          />
        </div>

        {/* Live event sidebar - 30% */}
        <div className="xl:w-[30%] min-w-0">
          <LiveEventFeed maxEvents={30} />
        </div>
      </div>

      {/* Add Camera Dialog */}
      <AddCameraDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSubmit={handleAddCamera}
      />
    </div>
  );
}
