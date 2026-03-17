"use client";

import { useState } from "react";
import { Camera as CameraIcon, Plus } from "lucide-react";
import type { Camera } from "@osp/shared";
import { CameraCard, CameraCardSkeleton } from "./CameraCard";

type GridLayout = 1 | 4 | 9 | 16;

interface CameraGridProps {
  readonly cameras: readonly Camera[];
  readonly loading?: boolean;
  readonly onAddCamera?: () => void;
}

const GRID_COLUMNS: Record<GridLayout, string> = {
  1: "grid-cols-1",
  4: "grid-cols-1 md:grid-cols-2",
  9: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  16: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
};

const LAYOUT_OPTIONS: readonly { readonly value: GridLayout; readonly label: string }[] = [
  { value: 1, label: "1x1" },
  { value: 4, label: "2x2" },
  { value: 9, label: "3x3" },
  { value: 16, label: "4x4" },
];

export function CameraGrid({ cameras, loading = false, onAddCamera }: CameraGridProps) {
  const [layout, setLayout] = useState<GridLayout>(4);

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-end gap-1 mb-3">
          {LAYOUT_OPTIONS.map((opt) => (
            <div
              key={opt.value}
              className="h-7 w-10 rounded bg-zinc-800 animate-pulse"
            />
          ))}
        </div>
        <div className={`grid gap-2 ${GRID_COLUMNS[layout]}`}>
          {Array.from({ length: layout }).map((_, i) => (
            <CameraCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (cameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 border border-dashed border-zinc-800 rounded-lg">
        <CameraIcon className="h-8 w-8 text-zinc-600 mb-3" />
        <p className="text-sm font-medium text-zinc-400 mb-1">
          No cameras connected
        </p>
        <p className="text-xs text-zinc-500 mb-4">
          Add your first camera to start monitoring
        </p>
        {onAddCamera && (
          <button
            type="button"
            onClick={onAddCamera}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Camera
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Layout toggle */}
      <div className="flex items-center justify-end gap-1 mb-3">
        {LAYOUT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLayout(opt.value)}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
              layout === opt.value
                ? "bg-blue-500 text-white"
                : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200 hover:border-zinc-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Camera grid */}
      <div className={`grid gap-2 ${GRID_COLUMNS[layout]}`}>
        {cameras.map((camera) => (
          <CameraCard key={camera.id} camera={camera} />
        ))}
      </div>
    </div>
  );
}
