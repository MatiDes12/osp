"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useCameras } from "@/hooks/use-cameras";
import { useLocations } from "@/hooks/use-locations";
import { useTags } from "@/hooks/use-tags";
import type { CameraTag } from "@/hooks/use-tags";
import { CameraGrid } from "@/components/camera/CameraGrid";
import { BulkActionBar } from "@/components/camera/BulkActionBar";
import { AddCameraDialog } from "@/components/camera/AddCameraDialog";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/StatCard";
import { PageError } from "@/components/PageError";
import { Camera, Wifi, Bell, Circle, MapPin, Tag, Check } from "lucide-react";

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
  const { locations, loading: locationsLoading } = useLocations();
  const { tags, loading: tagsLoading } = useTags();
  const [search, setSearch] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // Selection state
  const [selectedCameraIds, setSelectedCameraIds] = useState<Set<string>>(new Set());

  // Camera tag assignments (camera_id -> tag[])
  const [cameraTagsMap, setCameraTagsMap] = useState<Map<string, CameraTag[]>>(new Map());

  // Check if onboarding is complete on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const complete = localStorage.getItem("osp_onboarding_complete");
      if (complete) {
        setOnboardingDismissed(true);
      }
    }
  }, []);

  const showOnboarding =
    !loading && !onboardingDismissed && cameras.length === 0;

  // Fetch camera tag assignments
  useEffect(() => {
    if (cameras.length === 0 || tags.length === 0) return;

    let cancelled = false;

    async function fetchAssignments() {
      try {
        const tagLookup = new Map(tags.map((t) => [t.id, t]));
        const tagMap = new Map<string, CameraTag[]>();

        for (const cam of cameras) {
          try {
            const res = await fetch(`${API_URL}/api/v1/cameras/${cam.id}/tags`, {
              headers: getAuthHeaders(),
            });
            if (!res.ok) continue;
            const camTagJson = await res.json();
            if (camTagJson.success && Array.isArray(camTagJson.data)) {
              const camTags: CameraTag[] = [];
              for (const assignment of camTagJson.data) {
                const tagId = (assignment as Record<string, unknown>).tag_id as string;
                const tag = tagLookup.get(tagId);
                if (tag) camTags.push(tag);
              }
              if (camTags.length > 0) {
                tagMap.set(cam.id, camTags);
              }
            }
          } catch {
            // Non-critical
          }
        }

        if (!cancelled) {
          setCameraTagsMap(tagMap);
        }
      } catch {
        // Non-critical
      }
    }

    fetchAssignments();
    return () => { cancelled = true; };
  }, [cameras, tags]);

  const handleToggleTagFilter = useCallback((tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }, []);

  const filteredCameras = useMemo(() => {
    let result = cameras;
    if (selectedLocationId !== "all") {
      if (selectedLocationId === "unassigned") {
        result = result.filter((c) => !c.locationId);
      } else {
        result = result.filter((c) => c.locationId === selectedLocationId);
      }
    }
    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(query));
    }
    // Tag filter (AND logic: camera must have ALL selected tags)
    if (selectedTagIds.size > 0) {
      result = result.filter((c) => {
        const camTags = cameraTagsMap.get(c.id) ?? [];
        const camTagIds = new Set(camTags.map((t) => t.id));
        for (const requiredTag of selectedTagIds) {
          if (!camTagIds.has(requiredTag)) return false;
        }
        return true;
      });
    }
    return result;
  }, [cameras, search, selectedLocationId, selectedTagIds, cameraTagsMap]);

  const handleToggleSelect = useCallback((cameraId: string) => {
    setSelectedCameraIds((prev) => {
      const next = new Set(prev);
      if (next.has(cameraId)) {
        next.delete(cameraId);
      } else {
        next.add(cameraId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedCameraIds.size === filteredCameras.length) {
      setSelectedCameraIds(new Set());
    } else {
      setSelectedCameraIds(new Set(filteredCameras.map((c) => c.id)));
    }
  }, [filteredCameras, selectedCameraIds.size]);

  const handleDeselectAll = useCallback(() => {
    setSelectedCameraIds(new Set());
  }, []);

  const handleBulkActionComplete = useCallback(() => {
    handleDeselectAll();
    refetch();
  }, [handleDeselectAll, refetch]);

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

  const allSelected = filteredCameras.length > 0 && selectedCameraIds.size === filteredCameras.length;

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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Cameras</h1>
          {/* Select All checkbox */}
          {!loading && !error && filteredCameras.length > 0 && (
            <button
              type="button"
              onClick={handleSelectAll}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                allSelected
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                  : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
              }`}
            >
              <div
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
                  allSelected
                    ? "bg-blue-500 border-blue-500"
                    : "border-zinc-500"
                }`}
              >
                {allSelected && <Check className="h-2.5 w-2.5 text-white" />}
              </div>
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          )}
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="px-4 py-2 text-sm rounded-md bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors"
        >
          Add Camera
        </button>
      </div>

      {/* Search + Location filter + Tag filter */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cameras by name..."
          className="w-full max-w-sm rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[var(--color-muted)]" />
          <select
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          >
            <option value="all">All Locations</option>
            <option value="unassigned">Unassigned</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tag filter */}
        {tags.length > 0 && (
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-[var(--color-muted)]" />
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => {
                const isActive = selectedTagIds.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleToggleTagFilter(tag.id)}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                      isActive
                        ? "text-white border-transparent"
                        : "text-zinc-400 border-zinc-700 hover:text-zinc-200 hover:border-zinc-600"
                    }`}
                    style={
                      isActive
                        ? { backgroundColor: tag.color, borderColor: tag.color }
                        : undefined
                    }
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
      {!loading && !error && (
        <CameraGrid
          cameras={filteredCameras}
          selectable={selectedCameraIds.size > 0}
          selectedIds={selectedCameraIds}
          onToggleSelect={handleToggleSelect}
          cameraTagsMap={cameraTagsMap}
        />
      )}

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selectedCameraIds.size}
        selectedIds={selectedCameraIds}
        locations={locations}
        onDeselectAll={handleDeselectAll}
        onActionComplete={handleBulkActionComplete}
      />

      {/* Add camera dialog */}
      <AddCameraDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleAddCamera}
      />

      {/* Onboarding wizard for first-time users */}
      {showOnboarding && (
        <OnboardingWizard
          onComplete={() => {
            setOnboardingDismissed(true);
            refetch();
          }}
          onAddCamera={handleAddCamera}
        />
      )}
    </div>
  );
}
