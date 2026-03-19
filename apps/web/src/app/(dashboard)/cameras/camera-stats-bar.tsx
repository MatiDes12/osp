"use client";

import { memo } from "react";
import type { Camera } from "@osp/shared";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/StatCard";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { Camera as CameraIcon, Wifi, Bell, Circle } from "lucide-react";

interface CameraStatsBarProps {
  readonly cameras: readonly Camera[];
  readonly loading: boolean;
}

export const CameraStatsBar = memo(function CameraStatsBar({
  cameras,
  loading,
}: CameraStatsBarProps) {
  const {
    stats: dashboardStats,
    loading: dashboardStatsLoading,
    changed,
  } = useDashboardStats();

  const totalCameras = cameras.length;
  const camerasOnline = cameras.filter((c) => c.status === "online").length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      {dashboardStatsLoading || loading ? (
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
            value={totalCameras}
            icon={CameraIcon}
            flash={changed.totalCameras}
          />
          <StatCard
            label="Online"
            value={`${camerasOnline}/${totalCameras}`}
            icon={Wifi}
            color="text-green-400"
            flash={changed.camerasOnline}
          />
          <StatCard
            label="Events Today"
            value={dashboardStats.eventsToday}
            icon={Bell}
            flash={changed.eventsToday}
          />
          <StatCard
            label="Active Recordings"
            value={dashboardStats.activeRecordings}
            icon={Circle}
            color="text-red-400"
            flash={changed.activeRecordings}
          />
        </>
      )}
    </div>
  );
});
