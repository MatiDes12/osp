"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { CameraZone } from "@osp/shared";

interface Point {
  readonly x: number;
  readonly y: number;
}

interface ZoneDrawerProps {
  readonly zones: readonly CameraZone[];
  readonly cameraId: string;
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly isDrawing: boolean;
  readonly onZoneCreated: (polygon: readonly Point[]) => void;
  readonly onZoneDeleted: (zoneId: string) => void;
  readonly onDrawingCancelled: () => void;
}

const VERTEX_RADIUS = 6;
const CLOSE_THRESHOLD = 15;

function getPolygonCentroid(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  const sumX = points.reduce((acc, p) => acc + p.x, 0);
  const sumY = points.reduce((acc, p) => acc + p.y, 0);
  return { x: sumX / points.length, y: sumY / points.length };
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isPointInPolygon(
  point: Point,
  polygon: readonly Point[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const xi = pi.x;
    const yi = pi.y;
    const xj = pj.x;
    const yj = pj.y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function ZoneDrawer({
  zones,
  cameraId,
  videoWidth,
  videoHeight,
  isDrawing,
  onZoneCreated,
  onZoneDeleted,
  onDrawingCancelled,
}: ZoneDrawerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentPoints, setCurrentPoints] = useState<readonly Point[]>([]);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  // Convert pixel coordinates to normalized 0-1
  const toNormalized = useCallback(
    (px: number, py: number): Point => ({
      x: px / videoWidth,
      y: py / videoHeight,
    }),
    [videoWidth, videoHeight],
  );

  // Convert normalized 0-1 to pixel coordinates
  const toPixel = useCallback(
    (p: Point): { px: number; py: number } => ({
      px: p.x * videoWidth,
      py: p.y * videoHeight,
    }),
    [videoWidth, videoHeight],
  );

  // Reset drawing state when drawing mode is toggled off
  useEffect(() => {
    if (!isDrawing) {
      setCurrentPoints([]);
      setMousePos(null);
    }
  }, [isDrawing]);

  // Handle ESC to cancel drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isDrawing) {
        setCurrentPoints([]);
        setMousePos(null);
        onDrawingCancelled();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawing, onDrawingCancelled]);

  const handleCanvasClick = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing) {
        // In display mode, check if clicked inside a zone
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const norm = toNormalized(px, py);

        const clickedZone = zones.find((z) =>
          isPointInPolygon(norm, z.polygonCoordinates),
        );
        setSelectedZoneId(clickedZone?.id ?? null);
        return;
      }

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const normalized = toNormalized(px, py);

      // Check if clicking near first point to close polygon
      if (currentPoints.length >= 3) {
        const first = toPixel(currentPoints[0]!);
        const dist = Math.hypot(px - first.px, py - first.py);
        if (dist < CLOSE_THRESHOLD) {
          onZoneCreated(currentPoints);
          setCurrentPoints([]);
          setMousePos(null);
          return;
        }
      }

      setCurrentPoints((prev) => [...prev, normalized]);
    },
    [isDrawing, currentPoints, toNormalized, toPixel, zones, onZoneCreated],
  );

  const handleDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (!isDrawing || currentPoints.length < 3) return;
      onZoneCreated(currentPoints);
      setCurrentPoints([]);
      setMousePos(null);
    },
    [isDrawing, currentPoints, onZoneCreated],
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (isDrawing) {
        setMousePos(toNormalized(px, py));
      } else {
        // Check hover on zones
        const norm = toNormalized(px, py);
        const hovered = zones.find((z) =>
          isPointInPolygon(norm, z.polygonCoordinates),
        );
        setHoveredZoneId(hovered?.id ?? null);
      }
    },
    [isDrawing, zones, toNormalized],
  );

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, videoWidth, videoHeight);

    // Draw existing zones
    for (const zone of zones) {
      const points = zone.polygonCoordinates;
      if (points.length < 3) continue;

      const isHovered = hoveredZoneId === zone.id;
      const isSelected = selectedZoneId === zone.id;
      const fillAlpha = isHovered || isSelected ? 0.35 : 0.2;
      const strokeAlpha = isHovered || isSelected ? 0.9 : 0.6;

      ctx.beginPath();
      const first = toPixel(points[0]!);
      ctx.moveTo(first.px, first.py);
      for (let i = 1; i < points.length; i++) {
        const p = toPixel(points[i]!);
        ctx.lineTo(p.px, p.py);
      }
      ctx.closePath();

      ctx.fillStyle = hexToRgba(zone.colorHex, fillAlpha);
      ctx.fill();

      ctx.strokeStyle = hexToRgba(zone.colorHex, strokeAlpha);
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.stroke();

      // Zone name label at centroid
      const centroid = getPolygonCentroid(points);
      const cp = toPixel(centroid);
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const textMetrics = ctx.measureText(zone.name);
      const padding = 4;
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(
        cp.px - textMetrics.width / 2 - padding,
        cp.py - 7 - padding,
        textMetrics.width + padding * 2,
        14 + padding * 2,
      );

      ctx.fillStyle = "#ffffff";
      ctx.fillText(zone.name, cp.px, cp.py);
    }

    // Draw current polygon being drawn
    if (isDrawing && currentPoints.length > 0) {
      ctx.beginPath();
      const first = toPixel(currentPoints[0]!);
      ctx.moveTo(first.px, first.py);
      for (let i = 1; i < currentPoints.length; i++) {
        const p = toPixel(currentPoints[i]!);
        ctx.lineTo(p.px, p.py);
      }

      // Line to mouse position
      if (mousePos) {
        const mp = toPixel(mousePos);
        ctx.lineTo(mp.px, mp.py);
      }

      ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Semi-transparent fill preview
      if (currentPoints.length >= 3) {
        ctx.beginPath();
        const f = toPixel(currentPoints[0]!);
        ctx.moveTo(f.px, f.py);
        for (let i = 1; i < currentPoints.length; i++) {
          const p = toPixel(currentPoints[i]!);
          ctx.lineTo(p.px, p.py);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
        ctx.fill();
      }

      // Draw vertices
      for (const pt of currentPoints) {
        const p = toPixel(pt);
        ctx.beginPath();
        ctx.arc(p.px, p.py, VERTEX_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Highlight first vertex when close enough to close
      if (mousePos && currentPoints.length >= 3) {
        const firstPx = toPixel(currentPoints[0]!);
        const mousePx = toPixel(mousePos);
        const dist = Math.hypot(
          mousePx.px - firstPx.px,
          mousePx.py - firstPx.py,
        );
        if (dist < CLOSE_THRESHOLD) {
          ctx.beginPath();
          ctx.arc(firstPx.px, firstPx.py, VERTEX_RADIUS + 3, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(59, 130, 246, 0.6)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
  }, [
    zones,
    currentPoints,
    mousePos,
    hoveredZoneId,
    selectedZoneId,
    isDrawing,
    videoWidth,
    videoHeight,
    toPixel,
  ]);

  return (
    <div className="absolute inset-0 z-10">
      <canvas
        ref={canvasRef}
        width={videoWidth}
        height={videoHeight}
        className="w-full h-full"
        style={{ cursor: isDrawing ? "crosshair" : "default" }}
        onClick={handleCanvasClick}
        onDoubleClick={handleDoubleClick}
        onMouseMove={handleMouseMove}
      />

      {/* Selected zone controls */}
      {selectedZoneId && !isDrawing && (() => {
        const zone = zones.find((z) => z.id === selectedZoneId);
        if (!zone) return null;
        const centroid = getPolygonCentroid(zone.polygonCoordinates);
        const cp = {
          px: centroid.x * videoWidth,
          py: centroid.y * videoHeight,
        };
        return (
          <div
            className="absolute z-20 flex items-center gap-2 px-2 py-1 rounded-md bg-zinc-900/90 border border-zinc-700 shadow-lg"
            style={{
              left: `${(cp.px / videoWidth) * 100}%`,
              top: `${(cp.py / videoHeight) * 100 + 4}%`,
              transform: "translate(-50%, 0)",
            }}
          >
            <span className="text-xs text-zinc-200 font-medium">
              {zone.name}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onZoneDeleted(zone.id);
                setSelectedZoneId(null);
              }}
              className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer"
            >
              Delete
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedZoneId(null);
              }}
              className="px-1.5 py-0.5 text-[10px] rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        );
      })()}

      {/* Drawing instructions */}
      {isDrawing && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-md bg-blue-500/90 text-white text-xs font-medium shadow-lg">
          {currentPoints.length === 0
            ? "Click to place first vertex"
            : currentPoints.length < 3
              ? `Click to add vertices (${currentPoints.length}/3 min)`
              : "Click near first point or double-click to close polygon. ESC to cancel."}
        </div>
      )}
    </div>
  );
}
