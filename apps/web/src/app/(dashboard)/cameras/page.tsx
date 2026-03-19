"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useCameras } from "@/hooks/use-cameras";
import { useLocations } from "@/hooks/use-locations";
import { useTags } from "@/hooks/use-tags";
import type { CameraTag } from "@/hooks/use-tags";
import { CameraGrid } from "@/components/camera/CameraGrid";
import { BulkActionBar } from "@/components/camera/BulkActionBar";
import { AddCameraDialog } from "@/components/camera/AddCameraDialog";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { ActivityTicker } from "@/components/dashboard/ActivityTicker";
import { PageError } from "@/components/PageError";
import { MapPin, Tag, Check } from "lucide-react";
import { CameraStatsBar } from "./camera-stats-bar";

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

export default function CamerasPage() {
  const { cameras, loading, error, refetch, addCamera } = useCameras();
  const { locations, loading: locationsLoading } = useLocations();
  const { tags, loading: tagsLoading } = useTags();
  const [search, setSearch] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // Selection state
  const [selectedCameraIds, setSelectedCameraIds] = useState<Set<string>>(new Set());

  // Active recording camera IDs for live REC indicator
  const [activeRecordingCameraIds, setActiveRecordingCameraIds] = useState<Set<string>>(new Set());

  // Camera tag assignments (camera_id -> tag[])
  const [cameraTagsMap, setCameraTagsMap] = useState<Map<string, CameraTag[]>>(new Map());

  // Stable camera IDs string for dependency tracking (avoids re-running effects
  // when cameras array reference changes but IDs stay the same)
  const cameraIds = useMemo(
    () => cameras.map((c) => c.id).sort().join(","),
    [cameras],
  );

  // Fetch active recording camera IDs (once after initial load)
  const hasFetchedRecordings = useRef(false);
  useEffect(() => {
    if (loading || hasFetchedRecordings.current) return;
    hasFetchedRecordings.current = true;
    let cancelled = false;
    async function fetchActiveRecordings() {
      try {
        const res = await fetch(`${API_URL}/api/v1/recordings?status=recording&limit=50`, {
          headers: getAuthHeaders(),
        });
        const json = await res.json();
        if (!cancelled && json.success && Array.isArray(json.data)) {
          const ids = new Set<string>();
          for (const rec of json.data) {
            const camId = (rec as Record<string, unknown>).camera_id ?? (rec as Record<string, unknown>).cameraId;
            if (camId) ids.add(camId as string);
          }
          setActiveRecordingCameraIds(ids);
        }
      } catch {
        // Non-critical
      }
    }
    fetchActiveRecordings();
    return () => { cancelled = true; };
  }, [loading]);

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

  // Fetch camera tag assignments — depends on stable camera IDs, not array reference
  useEffect(() => {
    if (!cameraIds || tags.length === 0) return;

    let cancelled = false;

    async function fetchAssignments() {
      try {
        const tagLookup = new Map(tags.map((t) => [t.id, t]));
        const tagMap = new Map<string, CameraTag[]>();
        const ids = cameraIds.split(",");

        for (const camId of ids) {
          try {
            const res = await fetch(`${API_URL}/api/v1/cameras/${camId}/tags`, {
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
                tagMap.set(camId, camTags);
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
  }, [cameraIds, tags]);

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
      protocol: string;
      connectionUri: string;
      location?: { label?: string };
    }) => {
      await addCamera(data as Parameters<typeof addCamera>[0]);
    },
    [addCamera],
  );

  const allSelected = filteredCameras.length > 0 && selectedCameraIds.size === filteredCameras.length;

  return (
    <div>
      {/* Stats overview — isolated component so WebSocket-driven updates don't re-render the grid */}
      <CameraStatsBar cameras={cameras} loading={loading} />

      {/* Activity ticker */}
      <ActivityTicker className="mb-6" />

      {/* Header */}
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold sm:text-2xl">Cameras</h1>
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
          className="w-full px-4 py-2.5 text-sm rounded-md bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors sm:w-auto sm:py-2"
        >
          Add Camera
        </button>
      </div>

      {/* Search + Location filter + Tag filter */}
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cameras by name..."
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] sm:max-w-sm sm:py-2"
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
          activeRecordingCameraIds={activeRecordingCameraIds}
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
