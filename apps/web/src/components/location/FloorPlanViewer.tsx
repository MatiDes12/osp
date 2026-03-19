"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import type { FloorPlanObject } from "@osp/shared";

interface FloorPlanViewerProps {
  locationId: string;
  locationName: string;
  floorPlan: FloorPlanObject[];
  cameraId?: string;
  className?: string;
}

export function FloorPlanViewer({
  locationId,
  locationName,
  floorPlan,
  cameraId,
  className,
}: FloorPlanViewerProps) {
  const hasPlan = floorPlan.length > 0;
  const cameraObj = cameraId
    ? floorPlan.find((o) => o.type === "camera" && o.cameraId === cameraId)
    : null;

  return (
    <Link
      href={`/locations/${locationId}`}
      className={`group block rounded-lg border border-zinc-800 bg-zinc-900 p-3 hover:border-zinc-700 transition-colors cursor-pointer ${className ?? ""}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-400">{locationName}</span>
        </div>
        <span className="text-[10px] text-blue-400 group-hover:underline">View Map →</span>
      </div>

      {hasPlan ? (
        <div className="relative w-full h-24 rounded bg-zinc-950 overflow-hidden">
          {/* Mini floor plan SVG preview */}
          <svg
            viewBox="0 0 200 120"
            className="w-full h-full"
            aria-hidden="true"
          >
            {floorPlan.map((obj) => {
              if (obj.type === "room") {
                return (
                  <rect
                    key={obj.id}
                    x={obj.x * 200}
                    y={obj.y * 120}
                    width={obj.w * 200}
                    height={obj.h * 120}
                    fill={obj.color ?? "#27272a"}
                    stroke="#3f3f46"
                    strokeWidth={0.5}
                    rx={1}
                  />
                );
              }
              if (obj.type === "wall") {
                return (
                  <rect
                    key={obj.id}
                    x={obj.x * 200}
                    y={obj.y * 120}
                    width={obj.w * 200}
                    height={obj.h * 120}
                    fill="#52525b"
                  />
                );
              }
              if (obj.type === "camera") {
                const isHighlighted = obj.cameraId === cameraId;
                return (
                  <circle
                    key={obj.id}
                    cx={obj.x * 200 + obj.w * 100}
                    cy={obj.y * 120 + obj.h * 60}
                    r={isHighlighted ? 5 : 3}
                    fill={isHighlighted ? "#3b82f6" : "#22c55e"}
                    stroke={isHighlighted ? "#60a5fa" : "none"}
                    strokeWidth={1.5}
                  />
                );
              }
              return null;
            })}
          </svg>

          {/* Camera position indicator */}
          {cameraObj && (
            <div className="absolute bottom-1 right-1">
              <span className="text-[9px] text-blue-400 font-medium">● Your camera</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-16 rounded bg-zinc-950 border border-dashed border-zinc-800">
          <span className="text-xs text-zinc-600">No floor plan yet</span>
        </div>
      )}
    </Link>
  );
}
