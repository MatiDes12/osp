"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useCameras } from "@/hooks/use-cameras";
import { LiveViewPlayer } from "@/components/camera/LiveViewPlayer";
import { PageError } from "@/components/PageError";
import {
  Expand,
  Shrink,
  Grid2x2,
  Grid3x3,
  LayoutGrid,
  MonitorPlay,
  Volume2,
  VolumeX,
  Circle,
  Clock,
  AlertTriangle,
  X,
  ChevronDown,
  Maximize2,
  Timer,
  ExternalLink,
} from "lucide-react";
import type { Camera } from "@osp/shared";

// ─── Layout presets ─────────────────────────────────────────────────────────

type GridLayout = "1x1" | "2x2" | "3x3" | "4x4" | "2x3" | "3x4" | "1+5" | "1+7";

const LAYOUTS: {
  readonly id: GridLayout;
  readonly label: string;
  readonly icon: typeof Grid2x2;
  readonly maxCells: number;
  readonly shortcut: string;
}[] = [
  { id: "1x1", label: "Single", icon: Expand, maxCells: 1, shortcut: "1" },
  { id: "2x2", label: "2×2", icon: Grid2x2, maxCells: 4, shortcut: "2" },
  { id: "3x3", label: "3×3", icon: Grid3x3, maxCells: 9, shortcut: "3" },
  { id: "4x4", label: "4×4", icon: LayoutGrid, maxCells: 16, shortcut: "4" },
  { id: "2x3", label: "2×3", icon: LayoutGrid, maxCells: 6, shortcut: "5" },
  { id: "3x4", label: "3×4", icon: LayoutGrid, maxCells: 12, shortcut: "6" },
  { id: "1+5", label: "1+5", icon: MonitorPlay, maxCells: 6, shortcut: "7" },
  { id: "1+7", label: "1+7", icon: MonitorPlay, maxCells: 8, shortcut: "8" },
];

const ROTATE_OPTIONS = [5, 10, 15, 30, 60] as const;

// ─── Fullscreen hook ─────────────────────────────────────────────────────────

function useFullscreen(ref: React.RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggle = useCallback(() => {
    if (!ref.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else ref.current.requestFullscreen().catch(() => {});
  }, [ref]);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  return { isFullscreen, toggle };
}

// ─── Clock ───────────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="tabular-nums font-mono text-sm text-zinc-300">{time}</span>
  );
}

// ─── Camera cell ─────────────────────────────────────────────────────────────

function CameraCell({
  camera,
  isFocused,
  onFocus,
  onDoubleClick,
  showLabel,
}: {
  readonly camera: Camera;
  readonly isFocused: boolean;
  readonly onFocus: () => void;
  readonly onDoubleClick: () => void;
  readonly showLabel: boolean;
}) {
  return (
    <div
      className={`relative bg-black rounded overflow-hidden cursor-pointer transition-all duration-150 h-full ${
        isFocused
          ? "ring-2 ring-blue-500"
          : "ring-0 hover:ring-1 hover:ring-zinc-600"
      }`}
      onClick={onFocus}
      onDoubleClick={onDoubleClick}
    >
      <LiveViewPlayer
        cameraId={camera.id}
        cameraName={camera.name}
        className="w-full h-full"
      />
      {showLabel && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 pointer-events-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                {camera.status === "online" && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                    camera.status === "online" ? "bg-green-500" : "bg-red-500"
                  }`}
                />
              </span>
              <span className="text-[11px] font-medium text-zinc-100 truncate max-w-[150px]">
                {camera.name}
              </span>
            </div>
            {camera.location?.label && (
              <span className="text-[9px] text-zinc-500 truncate max-w-[100px]">
                {camera.location.label}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Camera grid renderer ────────────────────────────────────────────────────

function CameraGrid({
  layout,
  cameras,
  showLabels,
  onDoubleClick,
}: {
  readonly layout: GridLayout;
  readonly cameras: readonly Camera[];
  readonly showLabels: boolean;
  readonly onDoubleClick: (idx: number) => void;
}) {
  if (cameras.length === 0) return null;

  // Asymmetric layouts use flex sidebar strip
  if (layout === "1+5" || layout === "1+7") {
    const stripCount = layout === "1+5" ? 5 : 7;
    const main = cameras[0];
    const strip = cameras.slice(1, stripCount + 1);
    return (
      <div className="h-full w-full flex gap-1">
        <div
          className={`min-w-0 ${layout === "1+5" ? "flex-[2]" : "flex-[3]"}`}
        >
          {main && (
            <CameraCell
              camera={main}
              isFocused={false}
              onFocus={() => {}}
              onDoubleClick={() => onDoubleClick(0)}
              showLabel={showLabels}
            />
          )}
        </div>
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          {strip.map((cam, i) => (
            <div key={cam.id} className="flex-1 min-h-0">
              <CameraCell
                camera={cam}
                isFocused={false}
                onFocus={() => {}}
                onDoubleClick={() => onDoubleClick(i + 1)}
                showLabel={showLabels}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const gridClass: Record<GridLayout, string> = {
    "1x1": "grid-cols-1",
    "2x2": "grid-cols-2 grid-rows-2",
    "3x3": "grid-cols-3 grid-rows-3",
    "4x4": "grid-cols-4 grid-rows-4",
    "2x3": "grid-cols-3 grid-rows-2",
    "3x4": "grid-cols-4 grid-rows-3",
    "1+5": "",
    "1+7": "",
  };

  return (
    <div className={`h-full grid ${gridClass[layout]} gap-1`}>
      {cameras.map((cam, i) => (
        <CameraCell
          key={cam.id}
          camera={cam}
          isFocused={false}
          onFocus={() => {}}
          onDoubleClick={() => onDoubleClick(i)}
          showLabel={showLabels}
        />
      ))}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function MonitorPage() {
  const { cameras, loading, error, refetch } = useCameras();
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle: toggleFullscreen } =
    useFullscreen(containerRef);
  const pageStartRef = useRef(Date.now());

  const [layout, setLayout] = useState<GridLayout>("2x2");
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [globalMuted, setGlobalMuted] = useState(true);
  const [pageOffset, setPageOffset] = useState(0);
  const [showLabels, setShowLabels] = useState(true);
  const [filterOnline, setFilterOnline] = useState(false);
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [rotateSec, setRotateSec] = useState(15);
  const [rotateProgress, setRotateProgress] = useState(0);

  const filteredCameras = useMemo(
    () =>
      filterOnline
        ? cameras.filter((c) => c.status === "online")
        : [...cameras],
    [cameras, filterOnline],
  );
  const onlineCameras = useMemo(
    () => cameras.filter((c) => c.status === "online"),
    [cameras],
  );

  const layoutConfig = useMemo(
    () => LAYOUTS.find((l) => l.id === layout)!,
    [layout],
  );
  const maxVisible = layoutConfig.maxCells;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredCameras.length / maxVisible),
  );

  const visibleCameras = useMemo(() => {
    const start = pageOffset * maxVisible;
    return filteredCameras.slice(start, start + maxVisible);
  }, [filteredCameras, pageOffset, maxVisible]);

  const focusedCamera =
    focusedIdx !== null ? (visibleCameras[focusedIdx] ?? null) : null;

  useEffect(() => {
    if (pageOffset > 0 && pageOffset >= totalPages)
      setPageOffset(Math.max(0, totalPages - 1));
  }, [totalPages, pageOffset]);

  // Auto-rotate progress
  useEffect(() => {
    if (!autoRotate || totalPages <= 1) {
      setRotateProgress(0);
      return;
    }
    const intervalMs = rotateSec * 1000;
    const id = setInterval(() => {
      const elapsed = Date.now() - pageStartRef.current;
      setRotateProgress(Math.min(100, (elapsed / intervalMs) * 100));
    }, 80);
    return () => clearInterval(id);
  }, [autoRotate, rotateSec, totalPages]);

  // Auto-rotate page advance
  useEffect(() => {
    if (!autoRotate || totalPages <= 1) return;
    const id = setInterval(() => {
      setPageOffset((p) => {
        pageStartRef.current = Date.now();
        return (p + 1) % totalPages;
      });
    }, rotateSec * 1000);
    return () => clearInterval(id);
  }, [autoRotate, rotateSec, totalPages]);

  useEffect(() => {
    pageStartRef.current = Date.now();
    setRotateProgress(0);
  }, [pageOffset]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      switch (e.key) {
        case "Escape":
          setFocusedIdx(null);
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "m":
          setGlobalMuted((v) => !v);
          break;
        case "l":
          setShowLabels((v) => !v);
          break;
        case "r":
          setAutoRotate((v) => !v);
          break;
        case "ArrowRight":
        case "n":
          setPageOffset((p) => Math.min(p + 1, totalPages - 1));
          break;
        case "ArrowLeft":
        case "p":
          setPageOffset((p) => Math.max(p - 1, 0));
          break;
        default:
          LAYOUTS.forEach((l) => {
            if (e.key === l.shortcut) {
              setLayout(l.id);
              setFocusedIdx(null);
              setPageOffset(0);
            }
          });
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [totalPages, toggleFullscreen]);

  // Build "Open Wall" URL with current settings
  const wallUrl = useMemo(() => {
    const p = new URLSearchParams({ layout });
    if (autoRotate) p.set("rotate", String(rotateSec));
    if (filterOnline) p.set("filter", "online");
    return `/wall?${p.toString()}`;
  }, [layout, autoRotate, rotateSec, filterOnline]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-5rem)]">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto mb-3 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
          <p className="text-sm text-zinc-500">Loading cameras...</p>
        </div>
      </div>
    );
  }

  if (error) return <PageError message={error} onRetry={refetch} />;

  if (cameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-5rem)]">
        <MonitorPlay className="h-10 w-10 text-zinc-600 mb-3" />
        <p className="text-sm text-zinc-400">No cameras to monitor</p>
        <p className="text-xs text-zinc-600 mt-1">
          Add cameras first, then come back here
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col ${isFullscreen ? "h-screen bg-black" : "h-[calc(100vh-5rem)]"}`}
    >
      {/* ── Control bar ─────────────────────────────── */}
      <div
        className={`flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 shrink-0 ${
          isFullscreen ? "bg-zinc-950" : "bg-zinc-950/80"
        }`}
      >
        {/* Title + status */}
        <MonitorPlay className="h-4 w-4 text-blue-400 shrink-0" />
        <span className="text-sm font-semibold text-zinc-200 shrink-0">
          Surveillance Monitor
        </span>
        <div className="flex items-center gap-1.5 ml-1">
          <Circle className="h-2 w-2 fill-green-500 text-green-500 shrink-0" />
          <span className="text-[11px] text-zinc-400 tabular-nums font-mono">
            {onlineCameras.length}/{cameras.length} online
          </span>
        </div>

        <div className="flex-1" />

        {/* Clock */}
        <Clock className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
        <LiveClock />

        <div className="mx-1 h-4 w-px bg-zinc-800 shrink-0" />

        {/* Auto-rotate */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setAutoRotate((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors cursor-pointer ${
              autoRotate
                ? "bg-amber-500/20 text-amber-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
            title="Auto-rotate pages (R)"
          >
            <Timer className="h-3 w-3" />
            {autoRotate ? `${rotateSec}s` : "Rotate"}
          </button>
          {autoRotate && (
            <select
              value={rotateSec}
              onChange={(e) => setRotateSec(Number(e.target.value))}
              className="bg-zinc-800 text-[10px] text-zinc-300 border border-zinc-700 rounded px-1 py-0.5 outline-none cursor-pointer"
            >
              {ROTATE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}s
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="mx-1 h-4 w-px bg-zinc-800 shrink-0" />

        {/* Filter online only */}
        <button
          onClick={() => setFilterOnline((f) => !f)}
          className={`px-2 py-1 text-[10px] font-medium rounded transition-colors cursor-pointer ${
            filterOnline
              ? "bg-green-500/20 text-green-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          title="Show online cameras only"
        >
          Online Only
        </button>

        {/* Labels toggle */}
        <button
          onClick={() => setShowLabels((l) => !l)}
          className={`px-2 py-1 text-[10px] font-medium rounded transition-colors cursor-pointer ${
            showLabels
              ? "bg-blue-500/15 text-blue-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          title="Toggle camera labels (L)"
        >
          Labels
        </button>

        <div className="mx-1 h-4 w-px bg-zinc-800 shrink-0" />

        {/* Layout selector */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowLayoutPicker((p) => !p)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 rounded border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
          >
            {(() => {
              const Icon = layoutConfig.icon;
              return <Icon className="h-3.5 w-3.5" />;
            })()}
            {layoutConfig.label}
            <ChevronDown className="h-3 w-3" />
          </button>
          {showLayoutPicker && (
            <div className="absolute top-full right-0 mt-1 z-40 w-40 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
              {LAYOUTS.map((l) => {
                const Icon = l.icon;
                return (
                  <button
                    key={l.id}
                    onClick={() => {
                      setLayout(l.id);
                      setShowLayoutPicker(false);
                      setFocusedIdx(null);
                      setPageOffset(0);
                    }}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                      layout === l.id
                        ? "text-blue-400 bg-blue-500/10"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {l.label}
                    <span className="ml-auto text-zinc-600 font-mono">
                      {l.shortcut}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mx-1 h-4 w-px bg-zinc-800 shrink-0" />

        {/* Mute all */}
        <button
          onClick={() => setGlobalMuted((m) => !m)}
          className={`p-1.5 rounded transition-colors cursor-pointer shrink-0 ${
            globalMuted ? "text-zinc-500" : "text-blue-400"
          }`}
          title={`${globalMuted ? "Unmute" : "Mute"} all (M)`}
        >
          {globalMuted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer shrink-0"
          title="Fullscreen (F)"
        >
          {isFullscreen ? (
            <Shrink className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </button>

        {/* Open dedicated wall */}
        <a
          href={wallUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 p-1.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer shrink-0"
          title="Open in dedicated camera wall (new window)"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* ── Camera grid ──────────────────────────────── */}
      <div className="flex-1 min-h-0 p-1">
        {focusedCamera ? (
          <div className="relative h-full">
            <LiveViewPlayer
              cameraId={focusedCamera.id}
              cameraName={focusedCamera.name}
              className="w-full h-full rounded"
            />
            <button
              onClick={() => setFocusedIdx(null)}
              className="absolute top-3 right-3 p-2 rounded-lg bg-black/60 text-zinc-300 hover:text-white transition-colors cursor-pointer backdrop-blur-sm"
              title="Back to grid (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="absolute bottom-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm">
              <Circle className="h-2 w-2 fill-green-500 text-green-500" />
              <span className="text-sm font-medium text-zinc-100">
                {focusedCamera.name}
              </span>
              {focusedCamera.location?.label && (
                <span className="text-xs text-zinc-500">
                  {focusedCamera.location.label}
                </span>
              )}
            </div>
          </div>
        ) : (
          <CameraGrid
            layout={layout}
            cameras={visibleCameras}
            showLabels={showLabels}
            onDoubleClick={(i) => setFocusedIdx(i)}
          />
        )}
      </div>

      {/* ── Page indicator ───────────────────────────── */}
      {totalPages > 1 && !focusedCamera && (
        <div className="shrink-0">
          <div className="flex items-center justify-center gap-3 px-3 py-1.5 border-t border-zinc-800">
            <button
              onClick={() => setPageOffset((p) => Math.max(0, p - 1))}
              disabled={pageOffset <= 0}
              className="px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 cursor-pointer"
            >
              Prev
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPageOffset(i)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    i === pageOffset
                      ? "w-4 bg-blue-500"
                      : "w-1.5 bg-zinc-700 hover:bg-zinc-500"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={() =>
                setPageOffset((p) => Math.min(totalPages - 1, p + 1))
              }
              disabled={pageOffset >= totalPages - 1}
              className="px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 cursor-pointer"
            >
              Next
            </button>
            <span className="text-[10px] text-zinc-600 ml-2 font-mono tabular-nums">
              Page {pageOffset + 1}/{totalPages} · {filteredCameras.length}{" "}
              cameras
            </span>
          </div>

          {/* Auto-rotate progress bar */}
          {autoRotate && (
            <div className="h-0.5 w-full bg-zinc-900">
              <div
                className="h-full bg-amber-500 transition-none"
                style={{ width: `${rotateProgress}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
