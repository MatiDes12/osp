"use client";

import { useCallback } from "react";
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Home,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

type PTZDirection = "up" | "down" | "left" | "right" | "home";
type PTZZoom = "in" | "out";

interface PTZControlsProps {
  readonly onMove?: (direction: PTZDirection) => void;
  readonly onZoom?: (zoom: PTZZoom) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

function DirectionButton({
  direction,
  icon: Icon,
  onMove,
  disabled,
  label,
}: {
  readonly direction: PTZDirection;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly onMove?: (direction: PTZDirection) => void;
  readonly disabled?: boolean;
  readonly label: string;
}) {
  const handleClick = useCallback(() => {
    onMove?.(direction);
  }, [direction, onMove]);

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      aria-label={label}
      className="w-11 h-11 flex items-center justify-center rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-50 transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

export function PTZControls({
  onMove,
  onZoom,
  disabled = false,
  className,
}: PTZControlsProps) {
  const handleZoomIn = useCallback(() => onZoom?.("in"), [onZoom]);
  const handleZoomOut = useCallback(() => onZoom?.("out"), [onZoom]);

  return (
    <div
      className={`bg-zinc-900/80 backdrop-blur-sm rounded-xl p-3 border border-zinc-700 ${className ?? ""}`}
    >
      {/* D-pad */}
      <div className="grid grid-cols-3 gap-1 w-fit mx-auto">
        {/* Row 1: up */}
        <div />
        <DirectionButton
          direction="up"
          icon={ArrowUp}
          onMove={onMove}
          disabled={disabled}
          label="Pan up"
        />
        <div />

        {/* Row 2: left, home, right */}
        <DirectionButton
          direction="left"
          icon={ArrowLeft}
          onMove={onMove}
          disabled={disabled}
          label="Pan left"
        />
        <DirectionButton
          direction="home"
          icon={Home}
          onMove={onMove}
          disabled={disabled}
          label="Return to home position"
        />
        <DirectionButton
          direction="right"
          icon={ArrowRight}
          onMove={onMove}
          disabled={disabled}
          label="Pan right"
        />

        {/* Row 3: down */}
        <div />
        <DirectionButton
          direction="down"
          icon={ArrowDown}
          onMove={onMove}
          disabled={disabled}
          label="Pan down"
        />
        <div />
      </div>

      {/* Zoom row */}
      <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-zinc-700/50">
        <button
          onClick={handleZoomOut}
          disabled={disabled}
          aria-label="Zoom out"
          className="w-11 h-11 flex items-center justify-center rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-50 transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="flex-1 h-1 rounded-full bg-zinc-700 max-w-[60px]">
          <div className="h-full w-1/2 rounded-full bg-zinc-500" />
        </div>
        <button
          onClick={handleZoomIn}
          disabled={disabled}
          aria-label="Zoom in"
          className="w-11 h-11 flex items-center justify-center rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-50 transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
