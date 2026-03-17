"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Square,
  Circle,
  Minus,
  DoorOpen,
  Camera,
  Trash2,
  Undo2,
  Download,
  ZoomIn,
  ZoomOut,
  Move,
  MousePointer2,
  RotateCcw,
  Type,
} from "lucide-react";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

type Tool =
  | "select"
  | "room"
  | "wall"
  | "door"
  | "camera"
  | "label"
  | "pan";

interface Point {
  readonly x: number;
  readonly y: number;
}

interface FloorObject {
  readonly id: string;
  readonly type: "room" | "wall" | "door" | "camera" | "label";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rotation?: number;
  readonly label?: string;
  readonly color?: string;
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
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;

const ROOM_COLORS = [
  "#3B82F6", // blue
  "#22C55E", // green
  "#F59E0B", // amber
  "#A855F7", // purple
  "#06B6D4", // cyan
  "#EF4444", // red
  "#EC4899", // pink
  "#F97316", // orange
];

let nextId = Date.now();
function uid(): string {
  return String(nextId++);
}

const TOOL_CONFIG: {
  id: Tool;
  icon: typeof Square;
  label: string;
  shortcut: string;
}[] = [
  { id: "select", icon: MousePointer2, label: "Select", shortcut: "V" },
  { id: "room", icon: Square, label: "Room", shortcut: "R" },
  { id: "wall", icon: Minus, label: "Wall", shortcut: "W" },
  { id: "door", icon: DoorOpen, label: "Door", shortcut: "D" },
  { id: "camera", icon: Camera, label: "Camera", shortcut: "C" },
  { id: "label", icon: Type, label: "Label", shortcut: "T" },
  { id: "pan", icon: Move, label: "Pan", shortcut: "H" },
];

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  ctx.strokeStyle = "#27272A";
  ctx.lineWidth = 0.5;

  const step = GRID_SIZE * zoom;
  const startX = offsetX % step;
  const startY = offsetY % step;

  for (let x = startX; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = startY; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  obj: FloorObject,
  zoom: number,
  offsetX: number,
  offsetY: number,
  selected: boolean,
) {
  const x = obj.x * zoom + offsetX;
  const y = obj.y * zoom + offsetY;
  const w = obj.w * zoom;
  const h = obj.h * zoom;

  ctx.save();

  switch (obj.type) {
    case "room": {
      ctx.fillStyle = (obj.color ?? "#3B82F6") + "18";
      ctx.strokeStyle = obj.color ?? "#3B82F6";
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);

      // Room label
      if (obj.label) {
        ctx.fillStyle = "#A1A1AA";
        ctx.font = `${Math.max(11, 13 * zoom)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(obj.label, x + w / 2, y + h / 2);
      }
      break;
    }
    case "wall": {
      ctx.strokeStyle = "#71717A";
      ctx.lineWidth = 4 * zoom;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.stroke();
      break;
    }
    case "door": {
      ctx.strokeStyle = "#F59E0B";
      ctx.lineWidth = 3 * zoom;
      ctx.setLineDash([4 * zoom, 4 * zoom]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Door arc
      ctx.strokeStyle = "#F59E0B40";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, w, 0, -Math.PI / 2, true);
      ctx.stroke();
      break;
    }
    case "camera": {
      const r = 10 * zoom;
      ctx.fillStyle = "#3B82F6";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      // Camera icon (simple triangle for FOV)
      ctx.fillStyle = "#3B82F640";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 30 * zoom, y - 20 * zoom);
      ctx.lineTo(x + 30 * zoom, y + 20 * zoom);
      ctx.closePath();
      ctx.fill();

      // Camera label
      if (obj.label) {
        ctx.fillStyle = "#E4E4E7";
        ctx.font = `${Math.max(9, 11 * zoom)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(obj.label, x, y + r + 12 * zoom);
      }
      break;
    }
    case "label": {
      ctx.fillStyle = "#A1A1AA";
      ctx.font = `${Math.max(12, 14 * zoom)}px Inter, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(obj.label ?? "Text", x, y);
      break;
    }
  }

  // Selection highlight
  if (selected) {
    ctx.strokeStyle = "#3B82F6";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    const pad = 4;
    if (obj.type === "camera") {
      const r = 10 * zoom + pad;
      ctx.strokeRect(x - r, y - r, r * 2, r * 2);
    } else {
      ctx.strokeRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
    }
    ctx.setLineDash([]);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
//  Component
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
  const [objects, setObjects] = useState<readonly FloorObject[]>(initialObjects);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 40, y: 40 });
  const [history, setHistory] = useState<readonly (readonly FloorObject[])[]>([initialObjects]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [roomColor, setRoomColor] = useState(ROOM_COLORS[0]!);
  const [labelInput, setLabelInput] = useState("");
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [pendingLabelPos, setPendingLabelPos] = useState<Point | null>(null);
  const [dirty, setDirty] = useState(false);

  // Drawing state refs (avoid re-renders during drag)
  const drawingRef = useRef(false);
  const drawStartRef = useRef<Point>({ x: 0, y: 0 });
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const dragObjRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });

  // ── Push to undo history ───────────────────────────────────────────
  const pushHistory = useCallback(
    (newObjects: readonly FloorObject[]) => {
      const trimmed = history.slice(0, historyIndex + 1);
      const updated = [...trimmed, newObjects];
      setHistory(updated);
      setHistoryIndex(updated.length - 1);
      setObjects(newObjects);
      setDirty(true);
    },
    [history, historyIndex],
  );

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setObjects(history[newIndex]!);
      setDirty(true);
    }
  }, [history, historyIndex]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();

      if (key === "v") setTool("select");
      else if (key === "r") setTool("room");
      else if (key === "w") setTool("wall");
      else if (key === "d") setTool("door");
      else if (key === "c") setTool("camera");
      else if (key === "t") setTool("label");
      else if (key === "h") setTool("pan");
      else if (key === "delete" || key === "backspace") {
        if (selectedId) {
          setObjects((prev) => {
            const updated = prev.filter((o) => o.id !== selectedId);
            pushHistory(updated);
            return updated;
          });
          setSelectedId(null);
        }
      } else if ((e.metaKey || e.ctrlKey) && key === "z") {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedId, pushHistory, undo]);

  // ── Canvas to world coordinates ────────────────────────────────────
  const canvasToWorld = useCallback(
    (cx: number, cy: number): Point => ({
      x: (cx - offset.x) / zoom,
      y: (cy - offset.y) / zoom,
    }),
    [zoom, offset],
  );

  // ── Hit test ───────────────────────────────────────────────────────
  const hitTest = useCallback(
    (wx: number, wy: number): FloorObject | null => {
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i]!;
        if (obj.type === "camera") {
          const dx = wx - obj.x;
          const dy = wy - obj.y;
          if (dx * dx + dy * dy < 15 * 15) return obj;
        } else if (obj.type === "label") {
          if (wx >= obj.x && wx <= obj.x + 100 && wy >= obj.y && wy <= obj.y + 20) return obj;
        } else {
          const minX = Math.min(obj.x, obj.x + obj.w);
          const maxX = Math.max(obj.x, obj.x + obj.w);
          const minY = Math.min(obj.y, obj.y + obj.h);
          const maxY = Math.max(obj.y, obj.y + obj.h);
          if (wx >= minX && wx <= maxX && wy >= minY && wy <= maxY) return obj;
        }
      }
      return null;
    },
    [objects],
  );

  // ── Mouse handlers ─────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const world = canvasToWorld(cx, cy);
      const snapped: Point = { x: snapToGrid(world.x), y: snapToGrid(world.y) };

      if (tool === "pan") {
        drawingRef.current = true;
        panStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        return;
      }

      if (tool === "select") {
        const hit = hitTest(world.x, world.y);
        if (hit) {
          setSelectedId(hit.id);
          dragObjRef.current = hit.id;
          dragOffsetRef.current = { x: world.x - hit.x, y: world.y - hit.y };
          drawingRef.current = true;
        } else {
          setSelectedId(null);
        }
        return;
      }

      if (tool === "camera") {
        const cam: FloorObject = {
          id: uid(),
          type: "camera",
          x: snapped.x,
          y: snapped.y,
          w: 0,
          h: 0,
          label: cameras?.[0]?.name ?? "Camera",
        };
        pushHistory([...objects, cam]);
        setSelectedId(cam.id);
        return;
      }

      if (tool === "label") {
        setPendingLabelPos(snapped);
        setLabelInput("");
        setShowLabelDialog(true);
        return;
      }

      // Room, wall, door — start drag drawing
      drawingRef.current = true;
      drawStartRef.current = snapped;
    },
    [tool, offset, canvasToWorld, hitTest, objects, cameras, pushHistory],
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;

      if (tool === "pan") {
        setOffset({
          x: e.clientX - panStartRef.current.x,
          y: e.clientY - panStartRef.current.y,
        });
        return;
      }

      if (tool === "select" && dragObjRef.current) {
        const rect = canvasRef.current!.getBoundingClientRect();
        const world = canvasToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const snapped: Point = {
          x: snapToGrid(world.x - dragOffsetRef.current.x),
          y: snapToGrid(world.y - dragOffsetRef.current.y),
        };
        setObjects((prev) =>
          prev.map((o) =>
            o.id === dragObjRef.current ? { ...o, x: snapped.x, y: snapped.y } : o,
          ),
        );
        return;
      }

      // Live preview handled in render (via drawStartRef position vs current mouse)
    },
    [tool, canvasToWorld],
  );

  const handleMouseUp = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;

      if (tool === "pan" || tool === "select") {
        if (dragObjRef.current) {
          pushHistory([...objects]);
          dragObjRef.current = null;
        }
        return;
      }

      const rect = canvasRef.current!.getBoundingClientRect();
      const world = canvasToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const snapped: Point = { x: snapToGrid(world.x), y: snapToGrid(world.y) };
      const start = drawStartRef.current;

      const w = snapped.x - start.x;
      const h = snapped.y - start.y;

      // Minimum size check
      if (Math.abs(w) < GRID_SIZE && Math.abs(h) < GRID_SIZE && tool !== "door") return;

      let newObj: FloorObject;

      if (tool === "room") {
        newObj = {
          id: uid(),
          type: "room",
          x: Math.min(start.x, snapped.x),
          y: Math.min(start.y, snapped.y),
          w: Math.abs(w),
          h: Math.abs(h),
          color: roomColor,
          label: "Room",
        };
      } else if (tool === "wall") {
        newObj = {
          id: uid(),
          type: "wall",
          x: start.x,
          y: start.y,
          w: w,
          h: h,
        };
      } else if (tool === "door") {
        newObj = {
          id: uid(),
          type: "door",
          x: start.x,
          y: start.y,
          w: Math.max(Math.abs(w), GRID_SIZE * 2),
          h: 0,
        };
      } else {
        return;
      }

      pushHistory([...objects, newObj]);
      setSelectedId(newObj.id);
    },
    [tool, objects, roomColor, canvasToWorld, pushHistory],
  );

  // ── Zoom via scroll ────────────────────────────────────────────────
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((prev) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta)));
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Render loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    function render() {
      const dpr = window.devicePixelRatio || 1;
      const rect = container!.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      ctx!.fillStyle = "#09090B";
      ctx!.fillRect(0, 0, w, h);

      // Grid
      drawGrid(ctx!, w, h, zoom, offset.x, offset.y);

      // Objects
      for (const obj of objects) {
        drawObject(ctx!, obj, zoom, offset.x, offset.y, obj.id === selectedId);
      }

      animId = requestAnimationFrame(render);
    }

    render();
    return () => cancelAnimationFrame(animId);
  }, [objects, zoom, offset, selectedId]);

  // ── Label dialog submit ────────────────────────────────────────────
  const submitLabel = useCallback(() => {
    if (!pendingLabelPos || !labelInput.trim()) return;
    const newLabel: FloorObject = {
      id: uid(),
      type: "label",
      x: pendingLabelPos.x,
      y: pendingLabelPos.y,
      w: 0,
      h: 0,
      label: labelInput.trim(),
    };
    pushHistory([...objects, newLabel]);
    setShowLabelDialog(false);
    setPendingLabelPos(null);
  }, [pendingLabelPos, labelInput, objects, pushHistory]);

  // ── Edit selected object label ─────────────────────────────────────
  const selectedObj = objects.find((o) => o.id === selectedId);

  const updateSelectedLabel = useCallback(
    (newLabel: string) => {
      if (!selectedId) return;
      const updated = objects.map((o) =>
        o.id === selectedId ? { ...o, label: newLabel } : o,
      );
      setObjects(updated);
      setDirty(true);
    },
    [selectedId, objects],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    const updated = objects.filter((o) => o.id !== selectedId);
    pushHistory(updated);
    setSelectedId(null);
  }, [selectedId, objects, pushHistory]);

  // ── Export as PNG ──────────────────────────────────────────────────
  const exportPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${locationName.replace(/\s+/g, "-").toLowerCase()}-floorplan.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [locationName]);

  // ── Cursor style ──────────────────────────────────────────────────
  const cursorClass =
    tool === "pan"
      ? "cursor-grab"
      : tool === "select"
        ? "cursor-default"
        : "cursor-crosshair";

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-zinc-800 bg-zinc-950">
        {/* Tools */}
        {TOOL_CONFIG.map((t) => {
          const Icon = t.icon;
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={`${t.label} (${t.shortcut})`}
              className={`p-2 rounded-md text-sm transition-colors cursor-pointer ${
                active
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}

        <div className="mx-1 h-5 w-px bg-zinc-800" />

        {/* Room color picker (when room tool active) */}
        {tool === "room" && (
          <div className="flex items-center gap-1">
            {ROOM_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setRoomColor(c)}
                className={`h-5 w-5 rounded-full border-2 transition-all cursor-pointer ${
                  roomColor === c ? "border-white scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Room color ${c}`}
              />
            ))}
            <div className="mx-1 h-5 w-px bg-zinc-800" />
          </div>
        )}

        {/* Zoom controls */}
        <button
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.2))}
          className="p-2 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <span className="text-xs text-zinc-500 tabular-nums w-10 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.2))}
          className="p-2 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>

        <div className="mx-1 h-5 w-px bg-zinc-800" />

        {/* Undo */}
        <button
          onClick={undo}
          disabled={historyIndex <= 0}
          className="p-2 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-30"
          title="Undo (Cmd+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </button>

        {/* Reset */}
        <button
          onClick={() => {
            pushHistory([]);
            setSelectedId(null);
          }}
          className="p-2 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Clear All"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        {/* Export */}
        <button
          onClick={exportPNG}
          className="p-2 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Export PNG"
        >
          <Download className="h-4 w-4" />
        </button>

        <div className="flex-1" />

        {/* Delete selected */}
        {selectedId && (
          <button
            onClick={deleteSelected}
            className="p-2 rounded-md text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            title="Delete Selected (Del)"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}

        {/* Save */}
        <button
          onClick={() => {
            onSave(objects);
            setDirty(false);
          }}
          disabled={!dirty}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors cursor-pointer disabled:opacity-40"
        >
          Save Layout
        </button>
      </div>

      {/* Canvas + Properties panel */}
      <div className="flex flex-1 min-h-0">
        {/* Canvas */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden">
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 ${cursorClass}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              drawingRef.current = false;
              dragObjRef.current = null;
            }}
          />

          {/* Hint overlay */}
          {objects.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <Square className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">
                  Select the Room tool (R) and drag to draw your floor plan
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  Then place cameras (C) where they are installed
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Properties panel */}
        {selectedObj && (
          <div className="w-56 shrink-0 border-l border-zinc-800 bg-zinc-950 p-3 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Properties
            </h4>

            <div>
              <label className="block text-[10px] font-medium text-zinc-500 mb-1">
                Type
              </label>
              <span className="text-xs text-zinc-300 capitalize">
                {selectedObj.type}
              </span>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-zinc-500 mb-1">
                Label
              </label>
              <input
                type="text"
                value={selectedObj.label ?? ""}
                onChange={(e) => updateSelectedLabel(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 mb-1">
                  X
                </label>
                <span className="text-xs text-zinc-400 font-mono">
                  {selectedObj.x}
                </span>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 mb-1">
                  Y
                </label>
                <span className="text-xs text-zinc-400 font-mono">
                  {selectedObj.y}
                </span>
              </div>
            </div>

            {(selectedObj.type === "room" || selectedObj.type === "wall") && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">
                    Width
                  </label>
                  <span className="text-xs text-zinc-400 font-mono">
                    {Math.abs(selectedObj.w)}
                  </span>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">
                    Height
                  </label>
                  <span className="text-xs text-zinc-400 font-mono">
                    {Math.abs(selectedObj.h)}
                  </span>
                </div>
              </div>
            )}

            {selectedObj.type === "camera" && cameras && cameras.length > 0 && (
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 mb-1">
                  Linked Camera
                </label>
                <select
                  value={selectedObj.label ?? ""}
                  onChange={(e) => updateSelectedLabel(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Unlinked</option>
                  {cameras.map((cam) => (
                    <option key={cam.id} value={cam.name}>
                      {cam.name} ({cam.status})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={deleteSelected}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Label input dialog */}
      {showLabelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowLabelDialog(false)}
            role="button"
            tabIndex={-1}
            aria-label="Close"
          />
          <div className="relative z-50 w-72 rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-lg">
            <h4 className="text-sm font-semibold text-zinc-100 mb-3">Add Label</h4>
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitLabel();
              }}
              placeholder="e.g. Living Room, Entrance..."
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setShowLabelDialog(false)}
                className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={submitLabel}
                disabled={!labelInput.trim()}
                className="px-3 py-1.5 text-xs font-medium rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors cursor-pointer disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
