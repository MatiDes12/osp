"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Square,
  Minus,
  DoorOpen,
  Camera,
  Trash2,
  Undo2,
  Redo2,
  Download,
  ZoomIn,
  ZoomOut,
  Move,
  MousePointer2,
  RotateCcw,
  Type,
  Copy,
  RotateCw,
  Grid3x3,
  Magnet,
  Ruler,
  Armchair,
  TreePine,
  Box,
  Cuboid,
  Eye,
  X,
  ArrowUpDown,
  CircleDot,
} from "lucide-react";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

type Tool =
  | "select"
  | "room"
  | "wall"
  | "door"
  | "window"
  | "camera"
  | "label"
  | "furniture"
  | "measure"
  | "pan";

type ViewMode = "2d" | "iso" | "3d";

interface Point {
  x: number;
  y: number;
}

export interface FloorObject {
  id: string;
  type: "room" | "wall" | "door" | "window" | "camera" | "label" | "furniture";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label?: string;
  color?: string;
  cameraId?: string;    // linked real camera ID
  cameraStatus?: string;
  furnitureType?: string;
  wallHeight?: number;  // for 3D
  locked?: boolean;
}

interface FloorPlanEditorProps {
  readonly locationId: string;
  readonly locationName: string;
  readonly objects: readonly FloorObject[];
  readonly onSave: (objects: readonly FloorObject[]) => void;
  readonly cameras?: readonly { id: string; name: string; status: string }[];
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const GRID_SIZE = 20;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;

const ROOM_COLORS = [
  "#3B82F6", "#22C55E", "#F59E0B", "#A855F7",
  "#06B6D4", "#EF4444", "#EC4899", "#F97316",
  "#6366F1", "#14B8A6",
];

const FURNITURE_TYPES = [
  { id: "desk", label: "Desk", w: 60, h: 30 },
  { id: "table", label: "Table", w: 50, h: 50 },
  { id: "sofa", label: "Sofa", w: 80, h: 30 },
  { id: "bed", label: "Bed", w: 60, h: 80 },
  { id: "shelf", label: "Shelf", w: 60, h: 15 },
  { id: "counter", label: "Counter", w: 80, h: 20 },
  { id: "rack", label: "Rack", w: 40, h: 15 },
  { id: "plant", label: "Plant", w: 15, h: 15 },
];

let _uid = Date.now();
function uid(): string { return String(_uid++); }

const TOOLS: { id: Tool; icon: typeof Square; label: string; key: string; group: number }[] = [
  { id: "select",    icon: MousePointer2, label: "Select",    key: "V", group: 0 },
  { id: "pan",       icon: Move,          label: "Pan",       key: "H", group: 0 },
  { id: "room",      icon: Square,        label: "Room",      key: "R", group: 1 },
  { id: "wall",      icon: Minus,         label: "Wall",      key: "W", group: 1 },
  { id: "door",      icon: DoorOpen,      label: "Door",      key: "D", group: 1 },
  { id: "window",    icon: ArrowUpDown,   label: "Window",    key: "N", group: 1 },
  { id: "camera",    icon: Camera,        label: "Camera",    key: "C", group: 2 },
  { id: "furniture", icon: Armchair,       label: "Furniture", key: "F", group: 2 },
  { id: "label",     icon: Type,          label: "Label",     key: "T", group: 2 },
  { id: "measure",   icon: Ruler,         label: "Measure",   key: "M", group: 3 },
];

// ---------------------------------------------------------------------------
//  Snap helper
// ---------------------------------------------------------------------------

function snap(value: number, enabled: boolean): number {
  return enabled ? Math.round(value / GRID_SIZE) * GRID_SIZE : Math.round(value);
}

// ---------------------------------------------------------------------------
//  ISO transform
// ---------------------------------------------------------------------------

function toIso(x: number, y: number, z: number): Point {
  return {
    x: (x - y) * 0.866,
    y: (x + y) * 0.5 - z,
  };
}

// ---------------------------------------------------------------------------
//  Drawing functions
// ---------------------------------------------------------------------------

function drawGrid2D(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  zoom: number, ox: number, oy: number,
  showGrid: boolean,
) {
  if (!showGrid) return;
  ctx.strokeStyle = "#1C1C1E";
  ctx.lineWidth = 0.5;
  const step = GRID_SIZE * zoom;
  const sx = ox % step;
  const sy = oy % step;
  for (let x = sx; x < w; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = sy; y < h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

function drawObj2D(
  ctx: CanvasRenderingContext2D,
  obj: FloorObject,
  zoom: number, ox: number, oy: number,
  selected: boolean, hovered: boolean,
) {
  const sx = obj.x * zoom + ox;
  const sy = obj.y * zoom + oy;
  const sw = obj.w * zoom;
  const sh = obj.h * zoom;

  ctx.save();

  // Apply rotation
  if (obj.rotation) {
    const cx = sx + sw / 2;
    const cy = sy + sh / 2;
    ctx.translate(cx, cy);
    ctx.rotate((obj.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  switch (obj.type) {
    case "room": {
      const col = obj.color ?? "#3B82F6";
      ctx.fillStyle = col + "15";
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeRect(sx, sy, sw, sh);
      if (obj.label) {
        ctx.fillStyle = "#A1A1AA";
        ctx.font = `${Math.max(10, 12 * zoom)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(obj.label, sx + sw / 2, sy + sh / 2);
      }
      // Dimensions
      if (selected) {
        ctx.fillStyle = "#52525B";
        ctx.font = `${Math.max(8, 9 * zoom)}px JetBrains Mono, monospace`;
        ctx.textAlign = "center";
        ctx.fillText(`${obj.w}x${obj.h}`, sx + sw / 2, sy + sh + 12 * zoom);
      }
      break;
    }
    case "wall": {
      ctx.strokeStyle = "#71717A";
      ctx.lineWidth = Math.max(4, 6 * zoom);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + sw, sy + sh);
      ctx.stroke();
      break;
    }
    case "door": {
      const dw = Math.max(Math.abs(sw), GRID_SIZE * 2 * zoom);
      ctx.strokeStyle = "#F59E0B";
      ctx.lineWidth = 3 * zoom;
      ctx.setLineDash([4 * zoom, 4 * zoom]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + dw, sy);
      ctx.stroke();
      ctx.setLineDash([]);
      // Arc
      ctx.strokeStyle = "#F59E0B30";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, dw, 0, -Math.PI / 2, true);
      ctx.stroke();
      break;
    }
    case "window": {
      const ww = Math.max(Math.abs(sw), GRID_SIZE * 2 * zoom);
      ctx.strokeStyle = "#06B6D4";
      ctx.lineWidth = 3 * zoom;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + ww, sy);
      ctx.stroke();
      // Double line
      ctx.strokeStyle = "#06B6D450";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 3 * zoom);
      ctx.lineTo(sx + ww, sy - 3 * zoom);
      ctx.moveTo(sx, sy + 3 * zoom);
      ctx.lineTo(sx + ww, sy + 3 * zoom);
      ctx.stroke();
      break;
    }
    case "camera": {
      const r = 12 * zoom;
      const isOnline = obj.cameraStatus === "online";
      const baseColor = isOnline ? "#22C55E" : obj.cameraId ? "#EF4444" : "#3B82F6";

      // FOV cone
      const fovLen = 50 * zoom;
      const fovAngle = Math.PI / 4;
      const rot = ((obj.rotation ?? 0) * Math.PI) / 180;
      ctx.fillStyle = baseColor + "18";
      ctx.strokeStyle = baseColor + "40";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(rot - fovAngle) * fovLen, sy + Math.sin(rot - fovAngle) * fovLen);
      ctx.lineTo(sx + Math.cos(rot + fovAngle) * fovLen, sy + Math.sin(rot + fovAngle) * fovLen);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Camera dot
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();

      // Camera icon inside
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `${Math.max(8, 10 * zoom)}px Inter, system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("C", sx, sy + 1);

      // Status ring
      if (obj.cameraId) {
        ctx.strokeStyle = isOnline ? "#22C55E" : "#EF4444";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 3 * zoom, 0, Math.PI * 2);
        ctx.stroke();

        // Pulse for online
        if (isOnline) {
          ctx.strokeStyle = "#22C55E40";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(sx, sy, r + 8 * zoom, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Label
      if (obj.label) {
        ctx.fillStyle = "#E4E4E7";
        ctx.font = `${Math.max(9, 10 * zoom)}px Inter, system-ui`;
        ctx.textAlign = "center";
        ctx.fillText(obj.label, sx, sy + r + 14 * zoom);
      }
      break;
    }
    case "furniture": {
      ctx.fillStyle = "#3F3F46";
      ctx.strokeStyle = "#52525B";
      ctx.lineWidth = 1;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeRect(sx, sy, sw, sh);
      if (obj.furnitureType || obj.label) {
        ctx.fillStyle = "#71717A";
        ctx.font = `${Math.max(8, 9 * zoom)}px Inter, system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(obj.label ?? obj.furnitureType ?? "", sx + sw / 2, sy + sh / 2);
      }
      break;
    }
    case "label": {
      ctx.fillStyle = "#A1A1AA";
      ctx.font = `bold ${Math.max(11, 13 * zoom)}px Inter, system-ui`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(obj.label ?? "Text", sx, sy);
      break;
    }
  }

  // Selection / hover highlight
  if (selected || hovered) {
    ctx.strokeStyle = selected ? "#3B82F6" : "#3B82F650";
    ctx.lineWidth = selected ? 2 : 1;
    ctx.setLineDash(selected ? [5, 3] : [3, 3]);
    const pad = 5;
    if (obj.type === "camera") {
      const r = 12 * zoom + pad;
      ctx.strokeRect(sx - r, sy - r, r * 2, r * 2);
    } else {
      ctx.strokeRect(sx - pad, sy - pad, sw + pad * 2, sh + pad * 2);
    }
    ctx.setLineDash([]);

    // Resize handles (selected only, for rooms/furniture)
    if (selected && (obj.type === "room" || obj.type === "furniture")) {
      const hs = 5;
      ctx.fillStyle = "#3B82F6";
      // corners
      ctx.fillRect(sx - hs, sy - hs, hs * 2, hs * 2);
      ctx.fillRect(sx + sw - hs, sy - hs, hs * 2, hs * 2);
      ctx.fillRect(sx - hs, sy + sh - hs, hs * 2, hs * 2);
      ctx.fillRect(sx + sw - hs, sy + sh - hs, hs * 2, hs * 2);
    }
  }

  // Lock indicator
  if (obj.locked) {
    ctx.fillStyle = "#F59E0B";
    ctx.font = "10px Inter";
    ctx.textAlign = "left";
    ctx.fillText("L", sx + 2, sy + 10);
  }

  ctx.restore();
}

function drawMeasureLine(
  ctx: CanvasRenderingContext2D,
  start: Point, end: Point,
  zoom: number, ox: number, oy: number,
) {
  const sx = start.x * zoom + ox;
  const sy = start.y * zoom + oy;
  const ex = end.x * zoom + ox;
  const ey = end.y * zoom + oy;

  ctx.strokeStyle = "#F59E0B";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);

  // Distance label
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
  const midX = (sx + ex) / 2;
  const midY = (sy + ey) / 2;

  ctx.fillStyle = "#18181B";
  ctx.fillRect(midX - 20, midY - 10, 40, 20);
  ctx.fillStyle = "#F59E0B";
  ctx.font = "11px JetBrains Mono, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${dist}`, midX, midY);
}

// Simple isometric rendering
function drawObjIso(
  ctx: CanvasRenderingContext2D,
  obj: FloorObject,
  zoom: number, ox: number, oy: number,
  selected: boolean,
) {
  if (obj.type === "label" || obj.type === "camera") {
    // Labels and cameras render as 2D overlays in iso mode
    drawObj2D(ctx, obj, zoom, ox, oy, selected, false);
    return;
  }

  const height = (obj.wallHeight ?? (obj.type === "room" ? 40 : obj.type === "wall" ? 50 : 15)) * zoom;

  // Floor face
  const fl = toIso(obj.x * zoom, obj.y * zoom, 0);
  const fr = toIso((obj.x + obj.w) * zoom, obj.y * zoom, 0);
  const br = toIso((obj.x + obj.w) * zoom, (obj.y + obj.h) * zoom, 0);
  const bl = toIso(obj.x * zoom, (obj.y + obj.h) * zoom, 0);

  // Top face
  const ftl = toIso(obj.x * zoom, obj.y * zoom, height);
  const ftr = toIso((obj.x + obj.w) * zoom, obj.y * zoom, height);
  const fbr = toIso((obj.x + obj.w) * zoom, (obj.y + obj.h) * zoom, height);
  const fbl = toIso(obj.x * zoom, (obj.y + obj.h) * zoom, height);

  const col = obj.color ?? "#3B82F6";

  ctx.save();
  ctx.translate(ox, oy);

  // Floor
  ctx.fillStyle = col + "20";
  ctx.strokeStyle = col + "60";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fl.x, fl.y); ctx.lineTo(fr.x, fr.y);
  ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  if (obj.type !== "furniture") {
    // Right wall
    ctx.fillStyle = col + "30";
    ctx.beginPath();
    ctx.moveTo(fr.x, fr.y); ctx.lineTo(br.x, br.y);
    ctx.lineTo(fbr.x, fbr.y); ctx.lineTo(ftr.x, ftr.y);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Left wall
    ctx.fillStyle = col + "25";
    ctx.beginPath();
    ctx.moveTo(bl.x, bl.y); ctx.lineTo(br.x, br.y);
    ctx.lineTo(fbr.x, fbr.y); ctx.lineTo(fbl.x, fbl.y);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Top face
    ctx.fillStyle = col + "10";
    ctx.beginPath();
    ctx.moveTo(ftl.x, ftl.y); ctx.lineTo(ftr.x, ftr.y);
    ctx.lineTo(fbr.x, fbr.y); ctx.lineTo(fbl.x, fbl.y);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  // Label
  if (obj.label) {
    const center = toIso((obj.x + obj.w / 2) * zoom, (obj.y + obj.h / 2) * zoom, height + 10);
    ctx.fillStyle = "#E4E4E7";
    ctx.font = `${Math.max(9, 10 * zoom)}px Inter, system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(obj.label, center.x, center.y);
  }

  if (selected) {
    ctx.strokeStyle = "#3B82F6";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(ftl.x, ftl.y); ctx.lineTo(ftr.x, ftr.y);
    ctx.lineTo(fbr.x, fbr.y); ctx.lineTo(fbl.x, fbl.y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
//  Camera Live Preview Popup
// ---------------------------------------------------------------------------

function CameraPopup({
  obj,
  zoom,
  ox,
  oy,
  camera,
  onClose,
  onNavigate,
}: {
  obj: FloorObject;
  zoom: number;
  ox: number;
  oy: number;
  camera: { id: string; name: string; status: string } | undefined;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const sx = obj.x * zoom + ox;
  const sy = obj.y * zoom + oy;
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

  return (
    <div
      className="absolute z-30 w-72 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/50 overflow-hidden"
      style={{ left: sx + 20, top: sy - 120 }}
    >
      {/* Live preview */}
      <div className="relative aspect-video bg-black">
        {camera && camera.status === "online" ? (
          <img
            src={`${API_URL}/api/v1/cameras/${camera.id}/snapshot`}
            alt={camera.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
            {camera ? "Camera Offline" : "Not Linked"}
          </div>
        )}
        <button
          onClick={onClose}
          className="absolute top-1.5 right-1.5 p-1 rounded bg-black/60 text-zinc-300 hover:text-white transition-colors cursor-pointer"
        >
          <X className="h-3 w-3" />
        </button>
        {camera?.status === "online" && (
          <div className="absolute top-2 left-2 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[9px] font-bold text-green-400 uppercase">Live</span>
          </div>
        )}
      </div>
      {/* Info */}
      <div className="p-2.5">
        <p className="text-xs font-medium text-zinc-200 truncate">
          {camera?.name ?? obj.label ?? "Unlinked Camera"}
        </p>
        <p className="text-[10px] text-zinc-500 mt-0.5">
          Position: ({Math.round(obj.x)}, {Math.round(obj.y)}) / Rotation: {obj.rotation ?? 0} deg
        </p>
        {camera && (
          <button
            onClick={() => onNavigate(camera.id)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors cursor-pointer"
          >
            <Eye className="h-3 w-3" />
            Open Full Live View
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Main Component
// ---------------------------------------------------------------------------

export function FloorPlanEditor({
  locationName,
  objects: initialObjects,
  onSave,
  cameras,
}: FloorPlanEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<Tool>("select");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [objects, setObjects] = useState<FloorObject[]>([...initialObjects] as FloorObject[]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 60, y: 60 });
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [roomColor, setRoomColor] = useState(ROOM_COLORS[0]!);
  const [dirty, setDirty] = useState(false);
  const [popupCameraId, setPopupCameraId] = useState<string | null>(null);

  // Label dialog
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const [pendingLabelPos, setPendingLabelPos] = useState<Point | null>(null);

  // Furniture picker
  const [furniturePicker, setFurniturePicker] = useState(false);

  // Measure tool
  const [measureStart, setMeasureStart] = useState<Point | null>(null);
  const [measureEnd, setMeasureEnd] = useState<Point | null>(null);

  // Undo/redo
  const [history, setHistory] = useState<FloorObject[][]>([[...initialObjects] as FloorObject[]]);
  const [histIdx, setHistIdx] = useState(0);

  // Drag refs
  const drawingRef = useRef(false);
  const drawStartRef = useRef<Point>({ x: 0, y: 0 });
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const dragIdRef = useRef<string | null>(null);
  const dragOffRef = useRef<Point>({ x: 0, y: 0 });

  const selectedObj = useMemo(() => objects.find((o) => o.id === selectedId), [objects, selectedId]);
  const popupObj = useMemo(() => objects.find((o) => o.id === popupCameraId), [objects, popupCameraId]);
  const linkedCamera = useMemo(
    () => (popupObj?.cameraId ? cameras?.find((c) => c.id === popupObj.cameraId) : undefined),
    [popupObj, cameras],
  );

  // ── History ────────────────────────────────────────────────────────
  const commit = useCallback((objs: FloorObject[]) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, histIdx + 1);
      return [...trimmed, [...objs]];
    });
    setHistIdx((i) => i + 1);
    setObjects(objs);
    setDirty(true);
  }, [histIdx]);

  const undo = useCallback(() => {
    if (histIdx <= 0) return;
    const ni = histIdx - 1;
    setHistIdx(ni);
    setObjects([...history[ni]!]);
    setDirty(true);
  }, [history, histIdx]);

  const redo = useCallback(() => {
    if (histIdx >= history.length - 1) return;
    const ni = histIdx + 1;
    setHistIdx(ni);
    setObjects([...history[ni]!]);
    setDirty(true);
  }, [history, histIdx]);

  // ── Coordinate transforms ──────────────────────────────────────────
  const toWorld = useCallback(
    (cx: number, cy: number): Point => ({
      x: (cx - offset.x) / zoom,
      y: (cy - offset.y) / zoom,
    }),
    [zoom, offset],
  );

  const hitTest = useCallback(
    (wx: number, wy: number): FloorObject | null => {
      for (let i = objects.length - 1; i >= 0; i--) {
        const o = objects[i]!;
        if (o.type === "camera") {
          if ((wx - o.x) ** 2 + (wy - o.y) ** 2 < 18 ** 2) return o;
        } else if (o.type === "label") {
          if (wx >= o.x && wx <= o.x + 120 && wy >= o.y && wy <= o.y + 25) return o;
        } else {
          const x1 = Math.min(o.x, o.x + o.w), x2 = Math.max(o.x, o.x + o.w);
          const y1 = Math.min(o.y, o.y + o.h), y2 = Math.max(o.y, o.y + o.h);
          if (wx >= x1 && wx <= x2 && wy >= y1 && wy <= y2) return o;
        }
      }
      return null;
    },
    [objects],
  );

  // ── Mouse down ─────────────────────────────────────────────────────
  const onDown = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const w = toWorld(cx, cy);
      const s: Point = { x: snap(w.x, snapEnabled), y: snap(w.y, snapEnabled) };

      if (tool === "pan" || (e.button === 1) || (e.button === 0 && e.altKey)) {
        drawingRef.current = true;
        panStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        return;
      }

      if (tool === "select") {
        const hit = hitTest(w.x, w.y);
        if (hit) {
          if (hit.locked) {
            setSelectedId(hit.id);
            return;
          }
          setSelectedId(hit.id);
          dragIdRef.current = hit.id;
          dragOffRef.current = { x: w.x - hit.x, y: w.y - hit.y };
          drawingRef.current = true;

          // Double-click on camera opens popup
          if (hit.type === "camera" && e.detail === 2) {
            setPopupCameraId(hit.id);
          }
        } else {
          setSelectedId(null);
          setPopupCameraId(null);
        }
        return;
      }

      if (tool === "camera") {
        const cam: FloorObject = {
          id: uid(), type: "camera",
          x: s.x, y: s.y, w: 0, h: 0, rotation: 0,
          label: "New Camera",
        };
        commit([...objects, cam]);
        setSelectedId(cam.id);
        return;
      }

      if (tool === "label") {
        setPendingLabelPos(s);
        setLabelInput("");
        setLabelDialogOpen(true);
        return;
      }

      if (tool === "measure") {
        if (!measureStart) {
          setMeasureStart(s);
          setMeasureEnd(s);
        } else {
          setMeasureStart(null);
          setMeasureEnd(null);
        }
        return;
      }

      if (tool === "furniture") {
        setFurniturePicker(true);
        setPendingLabelPos(s);
        return;
      }

      // Drawing tools: room, wall, door, window
      drawingRef.current = true;
      drawStartRef.current = s;
    },
    [tool, offset, toWorld, hitTest, objects, snapEnabled, commit, measureStart],
  );

  // ── Mouse move ─────────────────────────────────────────────────────
  const onMove = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);

      // Hover detection
      const hit = hitTest(w.x, w.y);
      setHoveredId(hit?.id ?? null);

      // Measure tool tracking
      if (tool === "measure" && measureStart) {
        setMeasureEnd({ x: snap(w.x, snapEnabled), y: snap(w.y, snapEnabled) });
      }

      if (!drawingRef.current) return;

      if (tool === "pan" || e.altKey) {
        setOffset({
          x: e.clientX - panStartRef.current.x,
          y: e.clientY - panStartRef.current.y,
        });
        return;
      }

      if (tool === "select" && dragIdRef.current) {
        const s: Point = {
          x: snap(w.x - dragOffRef.current.x, snapEnabled),
          y: snap(w.y - dragOffRef.current.y, snapEnabled),
        };
        setObjects((prev) =>
          prev.map((o) => (o.id === dragIdRef.current ? { ...o, x: s.x, y: s.y } : o)),
        );
      }
    },
    [tool, toWorld, hitTest, snapEnabled, measureStart],
  );

  // ── Mouse up ───────────────────────────────────────────────────────
  const onUp = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;

      if (tool === "pan" || tool === "select") {
        if (dragIdRef.current) {
          commit([...objects]);
          dragIdRef.current = null;
        }
        return;
      }

      const rect = canvasRef.current!.getBoundingClientRect();
      const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const s: Point = { x: snap(w.x, snapEnabled), y: snap(w.y, snapEnabled) };
      const start = drawStartRef.current;
      const dw = s.x - start.x;
      const dh = s.y - start.y;

      if (Math.abs(dw) < 5 && Math.abs(dh) < 5 && tool !== "door" && tool !== "window") return;

      let obj: FloorObject;

      switch (tool) {
        case "room":
          obj = {
            id: uid(), type: "room",
            x: Math.min(start.x, s.x), y: Math.min(start.y, s.y),
            w: Math.abs(dw), h: Math.abs(dh),
            rotation: 0, color: roomColor, label: "Room",
          };
          break;
        case "wall":
          obj = { id: uid(), type: "wall", x: start.x, y: start.y, w: dw, h: dh, rotation: 0 };
          break;
        case "door":
          obj = {
            id: uid(), type: "door",
            x: start.x, y: start.y,
            w: Math.max(Math.abs(dw), GRID_SIZE * 2), h: 0, rotation: 0,
          };
          break;
        case "window":
          obj = {
            id: uid(), type: "window",
            x: start.x, y: start.y,
            w: Math.max(Math.abs(dw), GRID_SIZE * 2), h: 0, rotation: 0,
          };
          break;
        default:
          return;
      }

      commit([...objects, obj]);
      setSelectedId(obj.id);
    },
    [tool, objects, roomColor, toWorld, snapEnabled, commit],
  );

  // ── Wheel zoom ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const d = e.deltaY > 0 ? -0.08 : 0.08;
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + d)));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // ── Keyboard ───────────────────────────────────────────────────────
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();

      for (const t of TOOLS) {
        if (k === t.key.toLowerCase()) { setTool(t.id); return; }
      }

      if (k === "delete" || k === "backspace") {
        if (selectedId && !selectedObj?.locked) {
          commit(objects.filter((o) => o.id !== selectedId));
          setSelectedId(null);
        }
      } else if ((e.metaKey || e.ctrlKey) && k === "z" && e.shiftKey) {
        e.preventDefault(); redo();
      } else if ((e.metaKey || e.ctrlKey) && k === "z") {
        e.preventDefault(); undo();
      } else if ((e.metaKey || e.ctrlKey) && k === "d") {
        // Duplicate
        e.preventDefault();
        if (selectedObj) {
          const dup: FloorObject = { ...selectedObj, id: uid(), x: selectedObj.x + 20, y: selectedObj.y + 20 };
          commit([...objects, dup]);
          setSelectedId(dup.id);
        }
      } else if (k === "[" || k === "]") {
        // Rotate selected
        if (selectedObj && !selectedObj.locked) {
          const delta = k === "]" ? 15 : -15;
          const updated = objects.map((o) =>
            o.id === selectedId ? { ...o, rotation: (o.rotation + delta + 360) % 360 } : o,
          );
          commit(updated);
        }
      } else if (k === "g") {
        setShowGrid((v) => !v);
      } else if (k === "s" && !e.metaKey && !e.ctrlKey) {
        setSnapEnabled((v) => !v);
      } else if (k === "escape") {
        setSelectedId(null);
        setPopupCameraId(null);
        setLabelDialogOpen(false);
        setFurniturePicker(false);
        setMeasureStart(null);
        setMeasureEnd(null);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, selectedObj, objects, commit, undo, redo]);

  // ── Render ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    function render() {
      const dpr = window.devicePixelRatio || 1;
      const r = container!.getBoundingClientRect();
      canvas!.width = r.width * dpr;
      canvas!.height = r.height * dpr;
      canvas!.style.width = `${r.width}px`;
      canvas!.style.height = `${r.height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx!.fillStyle = "#09090B";
      ctx!.fillRect(0, 0, r.width, r.height);

      if (viewMode === "2d") {
        drawGrid2D(ctx!, r.width, r.height, zoom, offset.x, offset.y, showGrid);
        for (const obj of objects) {
          drawObj2D(ctx!, obj, zoom, offset.x, offset.y, obj.id === selectedId, obj.id === hoveredId);
        }
      } else {
        // Iso / 3D view
        for (const obj of objects) {
          drawObjIso(ctx!, obj, zoom, offset.x, offset.y, obj.id === selectedId);
        }
      }

      // Measure line
      if (measureStart && measureEnd) {
        drawMeasureLine(ctx!, measureStart, measureEnd, zoom, offset.x, offset.y);
      }

      raf = requestAnimationFrame(render);
    }
    render();
    return () => cancelAnimationFrame(raf);
  }, [objects, zoom, offset, selectedId, hoveredId, showGrid, viewMode, measureStart, measureEnd]);

  // ── Object property updates ────────────────────────────────────────
  const updateObj = useCallback(
    (id: string, patch: Partial<FloorObject>) => {
      setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
      setDirty(true);
    },
    [],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId || selectedObj?.locked) return;
    commit(objects.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, selectedObj, objects, commit]);

  const duplicateSelected = useCallback(() => {
    if (!selectedObj) return;
    const dup: FloorObject = { ...selectedObj, id: uid(), x: selectedObj.x + 20, y: selectedObj.y + 20 };
    commit([...objects, dup]);
    setSelectedId(dup.id);
  }, [selectedObj, objects, commit]);

  // ── Cursor ─────────────────────────────────────────────────────────
  const cursor =
    tool === "pan" ? "cursor-grab"
    : tool === "select" ? (hoveredId ? "cursor-move" : "cursor-default")
    : tool === "measure" ? "cursor-crosshair"
    : "cursor-crosshair";

  // ── Group tools by group number for dividers ───────────────────────
  const toolGroups = useMemo(() => {
    const groups: { id: Tool; icon: typeof Square; label: string; key: string }[][] = [];
    let lastGroup = -1;
    for (const t of TOOLS) {
      if (t.group !== lastGroup) {
        groups.push([]);
        lastGroup = t.group;
      }
      groups[groups.length - 1]!.push(t);
    }
    return groups;
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-zinc-800 bg-zinc-950 flex-wrap">
        {/* View mode toggle */}
        <div className="flex items-center border border-zinc-800 rounded-md mr-2">
          {(["2d", "iso", "3d"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                viewMode === m
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-zinc-500 hover:text-zinc-300"
              } ${m === "2d" ? "rounded-l-md" : m === "3d" ? "rounded-r-md" : ""}`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Tool groups with dividers */}
        {toolGroups.map((group, gi) => (
          <div key={gi} className="flex items-center">
            {gi > 0 && <div className="mx-1 h-5 w-px bg-zinc-800" />}
            {group.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setTool(t.id);
                    if (t.id === "furniture") setFurniturePicker(true);
                  }}
                  title={`${t.label} (${t.key})`}
                  className={`p-1.5 rounded transition-colors cursor-pointer ${
                    tool === t.id ? "bg-blue-500/20 text-blue-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        ))}

        <div className="mx-1 h-5 w-px bg-zinc-800" />

        {/* Room colors */}
        {tool === "room" && (
          <div className="flex items-center gap-0.5 mr-1">
            {ROOM_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setRoomColor(c)}
                className={`h-4 w-4 rounded-full border-2 cursor-pointer transition-transform ${
                  roomColor === c ? "border-white scale-125" : "border-transparent hover:scale-110"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}

        {/* Toggles */}
        <button
          onClick={() => setSnapEnabled((v) => !v)}
          title={`Snap to Grid (S) — ${snapEnabled ? "ON" : "OFF"}`}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            snapEnabled ? "text-blue-400 bg-blue-500/10" : "text-zinc-600"
          }`}
        >
          <Magnet className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setShowGrid((v) => !v)}
          title={`Show Grid (G) — ${showGrid ? "ON" : "OFF"}`}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            showGrid ? "text-blue-400 bg-blue-500/10" : "text-zinc-600"
          }`}
        >
          <Grid3x3 className="h-3.5 w-3.5" />
        </button>

        <div className="mx-1 h-5 w-px bg-zinc-800" />

        {/* Zoom */}
        <button onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.2))} className="p-1.5 text-zinc-500 hover:text-zinc-300 cursor-pointer"><ZoomIn className="h-3.5 w-3.5" /></button>
        <span className="text-[10px] text-zinc-500 tabular-nums w-8 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.2))} className="p-1.5 text-zinc-500 hover:text-zinc-300 cursor-pointer"><ZoomOut className="h-3.5 w-3.5" /></button>

        <div className="mx-1 h-5 w-px bg-zinc-800" />

        {/* Undo/Redo */}
        <button onClick={undo} disabled={histIdx <= 0} className="p-1.5 text-zinc-500 hover:text-zinc-300 cursor-pointer disabled:opacity-30" title="Undo (Cmd+Z)"><Undo2 className="h-3.5 w-3.5" /></button>
        <button onClick={redo} disabled={histIdx >= history.length - 1} className="p-1.5 text-zinc-500 hover:text-zinc-300 cursor-pointer disabled:opacity-30" title="Redo (Cmd+Shift+Z)"><Redo2 className="h-3.5 w-3.5" /></button>

        {/* Selected actions */}
        {selectedObj && (
          <>
            <div className="mx-1 h-5 w-px bg-zinc-800" />
            <button onClick={() => updateObj(selectedId!, { rotation: (selectedObj.rotation + 15) % 360 })} className="p-1.5 text-zinc-500 hover:text-zinc-300 cursor-pointer" title="Rotate (])"><RotateCw className="h-3.5 w-3.5" /></button>
            <button onClick={duplicateSelected} className="p-1.5 text-zinc-500 hover:text-zinc-300 cursor-pointer" title="Duplicate (Cmd+D)"><Copy className="h-3.5 w-3.5" /></button>
            <button onClick={deleteSelected} className="p-1.5 text-red-500 hover:text-red-400 cursor-pointer" title="Delete (Del)"><Trash2 className="h-3.5 w-3.5" /></button>
          </>
        )}

        <div className="flex-1" />

        {/* Clear */}
        <button onClick={() => { commit([]); setSelectedId(null); }} className="p-1.5 text-zinc-600 hover:text-zinc-400 cursor-pointer" title="Clear All"><RotateCcw className="h-3.5 w-3.5" /></button>
        <button onClick={() => { const canvas = canvasRef.current; if(!canvas) return; const a = document.createElement("a"); a.download = `${locationName}-floorplan.png`; a.href = canvas.toDataURL(); a.click(); }} className="p-1.5 text-zinc-500 hover:text-zinc-300 cursor-pointer" title="Export PNG"><Download className="h-3.5 w-3.5" /></button>

        {/* Save */}
        <button
          onClick={() => { onSave(objects); setDirty(false); }}
          disabled={!dirty}
          className="ml-2 px-3 py-1 text-[11px] font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors cursor-pointer disabled:opacity-40"
        >
          Save Layout
        </button>
      </div>

      {/* ── Canvas + Side panel ─────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        <div ref={containerRef} className="flex-1 relative overflow-hidden">
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 ${cursor}`}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={() => { drawingRef.current = false; dragIdRef.current = null; setHoveredId(null); }}
          />

          {/* Camera popup */}
          {popupObj && popupObj.type === "camera" && (
            <CameraPopup
              obj={popupObj}
              zoom={zoom} ox={offset.x} oy={offset.y}
              camera={linkedCamera}
              onClose={() => setPopupCameraId(null)}
              onNavigate={(id) => { window.location.href = `/cameras/${id}`; }}
            />
          )}

          {/* Empty hint */}
          {objects.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <Square className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">Select Room (R) and drag to draw</p>
                <p className="text-xs text-zinc-600 mt-1">Place cameras (C), add furniture (F), measure (M)</p>
                <p className="text-xs text-zinc-700 mt-1">Alt+drag to pan, scroll to zoom, [ ] to rotate</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Properties panel ──────────────────────────────────── */}
        {selectedObj && (
          <div className="w-52 shrink-0 border-l border-zinc-800 bg-zinc-950 p-3 space-y-3 overflow-y-auto">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Properties</h4>

            <div>
              <span className="text-[10px] text-zinc-600">Type</span>
              <p className="text-xs text-zinc-300 capitalize">{selectedObj.type}</p>
            </div>

            <div>
              <span className="text-[10px] text-zinc-600">Label</span>
              <input
                value={selectedObj.label ?? ""}
                onChange={(e) => updateObj(selectedId!, { label: e.target.value })}
                className="w-full mt-0.5 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div><span className="text-zinc-600">X</span><p className="text-zinc-400 font-mono">{Math.round(selectedObj.x)}</p></div>
              <div><span className="text-zinc-600">Y</span><p className="text-zinc-400 font-mono">{Math.round(selectedObj.y)}</p></div>
              {selectedObj.w !== 0 && <div><span className="text-zinc-600">W</span><p className="text-zinc-400 font-mono">{Math.abs(Math.round(selectedObj.w))}</p></div>}
              {selectedObj.h !== 0 && <div><span className="text-zinc-600">H</span><p className="text-zinc-400 font-mono">{Math.abs(Math.round(selectedObj.h))}</p></div>}
            </div>

            <div>
              <span className="text-[10px] text-zinc-600">Rotation</span>
              <div className="flex items-center gap-1 mt-0.5">
                <input
                  type="range" min="0" max="360" step="5"
                  value={selectedObj.rotation}
                  onChange={(e) => updateObj(selectedId!, { rotation: Number(e.target.value) })}
                  className="flex-1 h-1 accent-blue-500"
                />
                <span className="text-[10px] text-zinc-400 font-mono w-8 text-right">{selectedObj.rotation}</span>
              </div>
            </div>

            {/* Camera link */}
            {selectedObj.type === "camera" && cameras && (
              <div>
                <span className="text-[10px] text-zinc-600">Link Camera</span>
                <select
                  value={selectedObj.cameraId ?? ""}
                  onChange={(e) => {
                    const cam = cameras.find((c) => c.id === e.target.value);
                    updateObj(selectedId!, {
                      cameraId: e.target.value || undefined,
                      cameraStatus: cam?.status,
                      label: cam?.name ?? selectedObj.label,
                    });
                  }}
                  className="w-full mt-0.5 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Not linked</option>
                  {cameras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.status})
                    </option>
                  ))}
                </select>
                {selectedObj.cameraId && (
                  <button
                    onClick={() => setPopupCameraId(selectedId)}
                    className="w-full mt-1.5 flex items-center justify-center gap-1 px-2 py-1 text-[10px] rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors cursor-pointer"
                  >
                    <Eye className="h-3 w-3" />
                    Preview Live Feed
                  </button>
                )}
              </div>
            )}

            {/* Room color */}
            {selectedObj.type === "room" && (
              <div>
                <span className="text-[10px] text-zinc-600">Color</span>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {ROOM_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateObj(selectedId!, { color: c })}
                      className={`h-4 w-4 rounded-full border-2 cursor-pointer ${
                        selectedObj.color === c ? "border-white" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Lock toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedObj.locked ?? false}
                onChange={(e) => updateObj(selectedId!, { locked: e.target.checked })}
                className="accent-blue-500"
              />
              <span className="text-[10px] text-zinc-400">Lock position</span>
            </label>

            <button
              onClick={deleteSelected}
              disabled={selectedObj.locked}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-30"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* ── Label dialog ────────────────────────────────────────── */}
      {labelDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setLabelDialogOpen(false)} role="button" tabIndex={-1} aria-label="Close" />
          <div className="relative z-50 w-72 rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-lg">
            <h4 className="text-sm font-semibold text-zinc-100 mb-3">Add Label</h4>
            <input
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && labelInput.trim()) {
                  const obj: FloorObject = { id: uid(), type: "label", x: pendingLabelPos!.x, y: pendingLabelPos!.y, w: 0, h: 0, rotation: 0, label: labelInput.trim() };
                  commit([...objects, obj]);
                  setLabelDialogOpen(false);
                }
              }}
              placeholder="e.g. Living Room, Entrance..."
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setLabelDialogOpen(false)} className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-400 cursor-pointer">Cancel</button>
              <button
                onClick={() => {
                  if (!labelInput.trim()) return;
                  const obj: FloorObject = { id: uid(), type: "label", x: pendingLabelPos!.x, y: pendingLabelPos!.y, w: 0, h: 0, rotation: 0, label: labelInput.trim() };
                  commit([...objects, obj]);
                  setLabelDialogOpen(false);
                }}
                disabled={!labelInput.trim()}
                className="px-3 py-1.5 text-xs font-medium rounded bg-blue-500 text-white cursor-pointer disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Furniture picker ────────────────────────────────────── */}
      {furniturePicker && pendingLabelPos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setFurniturePicker(false)} role="button" tabIndex={-1} aria-label="Close" />
          <div className="relative z-50 w-80 rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-lg">
            <h4 className="text-sm font-semibold text-zinc-100 mb-3">Place Furniture</h4>
            <div className="grid grid-cols-4 gap-2">
              {FURNITURE_TYPES.map((ft) => (
                <button
                  key={ft.id}
                  onClick={() => {
                    const obj: FloorObject = {
                      id: uid(), type: "furniture",
                      x: pendingLabelPos.x, y: pendingLabelPos.y,
                      w: ft.w, h: ft.h, rotation: 0,
                      furnitureType: ft.id, label: ft.label,
                    };
                    commit([...objects, obj]);
                    setFurniturePicker(false);
                    setSelectedId(obj.id);
                    setTool("select");
                  }}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                >
                  <Armchair className="h-5 w-5 text-zinc-400" />
                  <span className="text-[10px] text-zinc-400">{ft.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
