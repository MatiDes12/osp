"use client";

import { useState } from "react";
import type { Camera } from "@osp/shared";
import { CameraCard } from "./CameraCard";

type GridSize = 1 | 4 | 9 | 16;

interface CameraGridProps {
  readonly cameras: readonly Camera[];
}

const GRID_CLASSES: Record<GridSize, string> = {
  1: "grid-cols-1",
  4: "grid-cols-1 md:grid-cols-2",
  9: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  16: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
};

const GRID_OPTIONS: readonly GridSize[] = [1, 4, 9, 16];

export function CameraGrid({ cameras }: CameraGridProps) {
  const [gridSize, setGridSize] = useState<GridSize>(16);

  if (cameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[var(--color-muted)]">
        <svg
          className="w-16 h-16 mb-4 opacity-30"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <p className="text-lg font-medium mb-1">No cameras yet</p>
        <p className="text-sm">Add your first camera to get started.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Grid size toggle */}
      <div className="flex items-center gap-1 mb-4 justify-end">
        {GRID_OPTIONS.map((size) => (
          <button
            key={size}
            onClick={() => setGridSize(size)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              gridSize === size
                ? "bg-[var(--color-primary)] text-white"
                : "bg-[var(--color-card)] text-[var(--color-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)]"
            }`}
          >
            {size === 1 ? "1x1" : size === 4 ? "2x2" : size === 9 ? "3x3" : "4x4"}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className={`grid gap-4 ${GRID_CLASSES[gridSize]}`}>
        {cameras.map((camera) => (
          <CameraCard key={camera.id} camera={camera} />
        ))}
      </div>
    </div>
  );
}
