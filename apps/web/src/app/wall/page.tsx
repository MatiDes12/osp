"use client";

/**
 * /wall — Standalone fullscreen camera wall
 *
 * No sidebar, no topbar. Open this in a dedicated browser window / second
 * monitor for an uncluttered surveillance command-center view.
 *
 * URL params (all optional, used for bookmarking):
 *   ?layout=2x2     — starting layout (1x1 | 2x2 | 3x3 | 4x4 | 2x3 | 3x4 | 1+5 | 1+7)
 *   ?rotate=15      — enable auto-rotate every N seconds
 *   ?filter=online  — show online cameras only
 *
 * Keyboard shortcuts:
 *   1-8     → switch layout
 *   F       → toggle browser fullscreen
 *   M       → mute / unmute all
 *   L       → show / hide camera labels
 *   R       → toggle auto-rotate
 *   ← / →   → previous / next page
 *   Esc     → exit focused camera
 *   ?       → show / hide keyboard legend
 */

import { Suspense, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { LiveViewPlayer } from "@/components/camera/LiveViewPlayer";
import { useCameras } from "@/hooks/use-cameras";
import type { Camera } from "@osp/shared";
import {
  Maximize2,
  Shrink,
  Volume2,
  VolumeX,
  Circle,
  Clock,
  ArrowLeft,
  X,
  ChevronLeft,
  ChevronRight,
  Timer,
  MonitorPlay,
  HelpCircle,
} from "lucide-react";

// ─── Layout definitions ────────────────────────────────────────────────────

type GridLayout = "1x1" | "2x2" | "3x3" | "4x4" | "2x3" | "3x4" | "1+5" | "1+7";

const LAYOUTS: {
  readonly id: GridLayout;
  readonly label: string;
  readonly maxCells: number;
  readonly shortcut: string;
}[] = [
  { id: "1x1", label: "1×1",  maxCells: 1,  shortcut: "1" },
  { id: "2x2", label: "2×2",  maxCells: 4,  shortcut: "2" },
  { id: "3x3", label: "3×3",  maxCells: 9,  shortcut: "3" },
  { id: "4x4", label: "4×4",  maxCells: 16, shortcut: "4" },
  { id: "2x3", label: "2×3",  maxCells: 6,  shortcut: "5" },
  { id: "3x4", label: "3×4",  maxCells: 12, shortcut: "6" },
  { id: "1+5", label: "1+5",  maxCells: 6,  shortcut: "7" },
  { id: "1+7", label: "1+7",  maxCells: 8,  shortcut: "8" },
];

const ROTATE_OPTIONS = [5, 10, 15, 30, 60] as const;
const HUD_HIDE_DELAY_MS = 3_500;

// ─── Clock ─────────────────────────────────────────────────────────────────

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
  return <span className="tabular-nums font-mono text-sm text-zinc-200">{time}</span>;
}

// ─── Camera cell ────────────────────────────────────────────────────────────

function CameraCell({
  camera,
  showLabel,
  onDoubleClick,
}: {
  readonly camera: Camera;
  readonly showLabel: boolean;
  readonly onDoubleClick: () => void;
}) {
  return (
    <div
      className="relative h-full w-full bg-black overflow-hidden cursor-pointer"
      onDoubleClick={onDoubleClick}
    >
      <LiveViewPlayer cameraId={camera.id} cameraName={camera.name} className="w-full h-full" />
      {showLabel && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 pointer-events-none">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                camera.status === "online" ? "bg-green-400" : "bg-red-400"
              }`}
            />
            <span className="text-[11px] font-medium text-zinc-100 truncate">{camera.name}</span>
            {camera.location?.label && (
              <span className="text-[9px] text-zinc-500 ml-auto truncate max-w-[80px]">
                {camera.location.label}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Keyboard legend ────────────────────────────────────────────────────────

function KeyboardLegend({ onClose }: { readonly onClose: () => void }) {
  const shortcuts = [
    ["1 – 8", "Switch layout"],
    ["F", "Toggle browser fullscreen"],
    ["M", "Mute / unmute all"],
    ["L", "Show / hide labels"],
    ["R", "Toggle auto-rotate"],
    ["← / →", "Previous / next page"],
    ["Esc", "Exit focused camera"],
    ["?", "Show / hide this legend"],
  ];
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-72 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-200">Keyboard Shortcuts</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {shortcuts.map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between">
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] font-mono text-zinc-300">
                {key}
              </kbd>
              <span className="text-xs text-zinc-500">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Camera grid renderer ───────────────────────────────────────────────────

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

  // Asymmetric layouts use flex
  if (layout === "1+5" || layout === "1+7") {
    const stripCount = layout === "1+5" ? 5 : 7;
    const main = cameras[0];
    const strip = cameras.slice(1, stripCount + 1);
    return (
      <div className="h-full w-full flex gap-0.5">
        <div className={`min-w-0 ${layout === "1+5" ? "flex-[2]" : "flex-[3]"}`}>
          {main && (
            <CameraCell camera={main} showLabel={showLabels} onDoubleClick={() => onDoubleClick(0)} />
          )}
        </div>
        <div className="flex-1 flex flex-col gap-0.5 min-w-0">
          {strip.map((cam, i) => (
            <div key={cam.id} className="flex-1 min-h-0">
              <CameraCell camera={cam} showLabel={showLabels} onDoubleClick={() => onDoubleClick(i + 1)} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Symmetric grid layouts
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
    <div className={`h-full w-full grid ${gridClass[layout]} gap-0.5`}>
      {cameras.map((cam, i) => (
        <CameraCell
          key={cam.id}
          camera={cam}
          showLabel={showLabels}
          onDoubleClick={() => onDoubleClick(i)}
        />
      ))}
    </div>
  );
}

// ─── Wall content (needs Suspense for useSearchParams) ────────────────────

function WallContent() {
  const router = useRouter();
  const params = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const pageStartRef = useRef(Date.now());
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { cameras, loading } = useCameras();

  // ── State ──────────────────────────────────────────────────────────────
  const [layout, setLayout] = useState<GridLayout>(
    (params.get("layout") as GridLayout | null) ?? "2x2",
  );
  const [filterOnline, setFilterOnline] = useState(params.get("filter") === "online");
  const [globalMuted, setGlobalMuted] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [pageOffset, setPageOffset] = useState(0);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [autoRotate, setAutoRotate] = useState(!!params.get("rotate"));
  const [rotateSec, setRotateSec] = useState(Number(params.get("rotate") || 15));
  const [rotateProgress, setRotateProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [showLegend, setShowLegend] = useState(false);

  // ── Derived ─────────────────────────────────────────────────────────────
  const filteredCameras = useMemo(
    () => (filterOnline ? cameras.filter((c) => c.status === "online") : [...cameras]),
    [cameras, filterOnline],
  );

  const onlineCameras = useMemo(
    () => cameras.filter((c) => c.status === "online"),
    [cameras],
  );

  const layoutConfig = useMemo(() => LAYOUTS.find((l) => l.id === layout)!, [layout]);
  const maxVisible = layoutConfig.maxCells;
  const totalPages = Math.max(1, Math.ceil(filteredCameras.length / maxVisible));

  const visibleCameras = useMemo(() => {
    const start = pageOffset * maxVisible;
    return filteredCameras.slice(start, start + maxVisible);
  }, [filteredCameras, pageOffset, maxVisible]);

  const focusedCamera = focusedIdx !== null ? (visibleCameras[focusedIdx] ?? null) : null;

  // Clamp page when cameras change
  useEffect(() => {
    if (pageOffset >= totalPages) setPageOffset(Math.max(0, totalPages - 1));
  }, [totalPages, pageOffset]);

  // ── Fullscreen ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current.requestFullscreen().catch(() => {});
  }, []);

  // ── HUD auto-hide ───────────────────────────────────────────────────────
  const bumpHud = useCallback(() => {
    setHudVisible(true);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => setHudVisible(false), HUD_HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    bumpHud();
    return () => {
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, [bumpHud]);

  // ── Auto-rotate progress bar ────────────────────────────────────────────
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

  // ── Auto-rotate page advance ────────────────────────────────────────────
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

  // Reset progress bar on page change
  useEffect(() => {
    pageStartRef.current = Date.now();
    setRotateProgress(0);
  }, [pageOffset]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      bumpHud();

      switch (e.key) {
        case "Escape":
          setFocusedIdx(null);
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "m":
        case "M":
          setGlobalMuted((v) => !v);
          break;
        case "l":
        case "L":
          setShowLabels((v) => !v);
          break;
        case "r":
        case "R":
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
        case "?":
          setShowLegend((v) => !v);
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
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [totalPages, toggleFullscreen, bumpHud]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen bg-black overflow-hidden select-none"
      onMouseMove={bumpHud}
      onTouchStart={bumpHud}
    >
      {/* ── Camera grid ─────────────────────────────────── */}
      <div className="absolute inset-0">
        {cameras.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <MonitorPlay className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">No cameras available</p>
              <p className="text-xs text-zinc-600 mt-1">Add cameras from the dashboard first</p>
            </div>
          </div>
        ) : focusedCamera ? (
          <div className="h-full w-full">
            <LiveViewPlayer
              cameraId={focusedCamera.id}
              cameraName={focusedCamera.name}
              className="w-full h-full"
            />
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

      {/* ── Top HUD ─────────────────────────────────────── */}
      <div
        className={`absolute inset-x-0 top-0 z-20 pointer-events-none transition-opacity duration-500 ${
          hudVisible ? "opacity-100 pointer-events-auto" : "opacity-0"
        }`}
      >
        <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          {/* Back to dashboard */}
          <button
            onClick={() => router.push("/monitor")}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </button>

          <div className="h-3 w-px bg-zinc-700 shrink-0" />

          {/* Online count */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Circle className="h-2 w-2 fill-green-500 text-green-500" />
            <span className="text-[11px] text-zinc-400 font-mono tabular-nums">
              {onlineCameras.length}/{cameras.length}
            </span>
          </div>

          <div className="flex-1" />

          {/* Layout selector */}
          <div className="flex items-center gap-0.5">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  setLayout(l.id);
                  setFocusedIdx(null);
                  setPageOffset(0);
                }}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-colors cursor-pointer ${
                  layout === l.id
                    ? "bg-blue-500/30 text-blue-300 font-medium"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                }`}
                title={`Layout ${l.label} (${l.shortcut})`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="h-3 w-px bg-zinc-700 shrink-0" />

          {/* Auto-rotate */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setAutoRotate((v) => !v)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                autoRotate
                  ? "bg-amber-500/20 text-amber-400"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              }`}
              title="Toggle auto-rotate (R)"
            >
              <Timer className="h-3 w-3" />
              {autoRotate ? `${rotateSec}s` : "Rotate"}
            </button>
            {autoRotate && (
              <select
                value={rotateSec}
                onChange={(e) => setRotateSec(Number(e.target.value))}
                className="bg-zinc-800/70 text-[10px] text-zinc-300 border border-zinc-700 rounded px-1 py-0.5 outline-none cursor-pointer"
              >
                {ROTATE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}s</option>
                ))}
              </select>
            )}
          </div>

          <div className="h-3 w-px bg-zinc-700 shrink-0" />

          {/* Filter online */}
          <button
            onClick={() => setFilterOnline((v) => !v)}
            className={`px-2 py-0.5 text-[10px] rounded transition-colors cursor-pointer ${
              filterOnline
                ? "bg-green-500/20 text-green-400"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            }`}
            title="Show online only"
          >
            Online
          </button>

          {/* Labels */}
          <button
            onClick={() => setShowLabels((v) => !v)}
            className={`px-2 py-0.5 text-[10px] rounded transition-colors cursor-pointer ${
              showLabels ? "text-zinc-300" : "text-zinc-600"
            }`}
            title="Toggle labels (L)"
          >
            Labels
          </button>

          {/* Mute */}
          <button
            onClick={() => setGlobalMuted((v) => !v)}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            title={globalMuted ? "Unmute (M)" : "Mute (M)"}
          >
            {globalMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Shrink className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          {/* Help */}
          <button
            onClick={() => setShowLegend((v) => !v)}
            className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
            title="Keyboard shortcuts (?)"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>

          <div className="h-3 w-px bg-zinc-700 shrink-0" />

          {/* Clock */}
          <Clock className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
          <LiveClock />
        </div>
      </div>

      {/* ── Bottom HUD ──────────────────────────────────── */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 transition-opacity duration-500 ${
          hudVisible || (autoRotate && totalPages > 1) ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Focused dismiss */}
        {focusedCamera && hudVisible && (
          <div className="flex justify-center pb-3 pointer-events-auto">
            <button
              onClick={() => setFocusedIdx(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-sm text-xs text-zinc-300 hover:text-white cursor-pointer transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Back to grid (Esc)
            </button>
          </div>
        )}

        {/* Page navigation */}
        {totalPages > 1 && !focusedCamera && (
          <div
            className={`flex items-center justify-center gap-3 px-3 py-2 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-300 pointer-events-auto ${
              hudVisible ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <button
              onClick={() => setPageOffset((p) => Math.max(0, p - 1))}
              disabled={pageOffset <= 0}
              className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-20 cursor-pointer transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPageOffset(i)}
                  className={`rounded-full transition-all cursor-pointer ${
                    i === pageOffset
                      ? "h-2 w-5 bg-blue-500"
                      : "h-1.5 w-1.5 bg-zinc-600 hover:bg-zinc-400"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={() => setPageOffset((p) => Math.min(totalPages - 1, p + 1))}
              disabled={pageOffset >= totalPages - 1}
              className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-20 cursor-pointer transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="text-[10px] text-zinc-600 font-mono tabular-nums">
              {pageOffset + 1} / {totalPages}
            </span>
          </div>
        )}

        {/* Auto-rotate progress bar */}
        {autoRotate && totalPages > 1 && (
          <div className="h-0.5 w-full bg-zinc-900">
            <div
              className="h-full bg-blue-500 transition-none"
              style={{ width: `${rotateProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* ── Keyboard legend overlay ──────────────────────── */}
      {showLegend && <KeyboardLegend onClose={() => setShowLegend(false)} />}
    </div>
  );
}

// ─── Page export ────────────────────────────────────────────────────────────

export default function WallPage() {
  return (
    <AuthGuard>
      <Suspense
        fallback={
          <div className="flex h-screen w-screen items-center justify-center bg-black">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
          </div>
        }
      >
        <WallContent />
      </Suspense>
    </AuthGuard>
  );
}
