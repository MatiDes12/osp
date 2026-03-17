"use client";

import { useState, useMemo, useCallback } from "react";
import { useCameras } from "@/hooks/use-cameras";
import { CameraGrid } from "@/components/camera/CameraGrid";
import { AddCameraDialog } from "@/components/camera/AddCameraDialog";

export default function CamerasPage() {
  const { cameras, loading, error, refetch, addCamera } = useCameras();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

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

  return (
    <div>
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
        <div className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 p-4 text-sm text-[var(--color-error)]">
          <p className="font-medium mb-1">Failed to load cameras</p>
          <p className="text-xs opacity-80">{error}</p>
          <button
            onClick={refetch}
            className="mt-2 text-xs underline hover:no-underline"
          >
            Try again
          </button>
        </div>
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
