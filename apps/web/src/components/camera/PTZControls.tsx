"use client";

import { useCallback, useRef } from "react";
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
  readonly cameraId: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("osp_access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function sendPTZCommand(
  cameraId: string,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${API_URL}/api/v1/cameras/${cameraId}/ptz`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
  } catch {
    // Non-critical: PTZ commands are best-effort
  }
}

function getDirectionCommand(direction: PTZDirection): Record<string, unknown> {
  switch (direction) {
    case "up":
      return { action: "move", pan: 0, tilt: 1, speed: 0.5 };
    case "down":
      return { action: "move", pan: 0, tilt: -1, speed: 0.5 };
    case "left":
      return { action: "move", pan: -1, tilt: 0, speed: 0.5 };
    case "right":
      return { action: "move", pan: 1, tilt: 0, speed: 0.5 };
    case "home":
      return { action: "preset", presetId: "1" };
  }
}

function DirectionButton({
  direction,
  icon: Icon,
  cameraId,
  disabled,
  label,
}: {
  readonly direction: PTZDirection;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly cameraId: string;
  readonly disabled?: boolean;
  readonly label: string;
}) {
  const activeRef = useRef(false);

  const handleStart = useCallback(() => {
    if (disabled) return;
    activeRef.current = true;
    const cmd = getDirectionCommand(direction);
    sendPTZCommand(cameraId, cmd);
  }, [direction, cameraId, disabled]);

  const handleEnd = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    // Home is a one-shot command, no stop needed
    if (direction !== "home") {
      sendPTZCommand(cameraId, { action: "stop" });
    }
  }, [direction, cameraId]);

  return (
    <button
      onMouseDown={handleStart}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      disabled={disabled}
      aria-label={label}
      className="w-11 h-11 flex items-center justify-center rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-50 transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

export function PTZControls({
  cameraId,
  disabled = false,
  className,
}: PTZControlsProps) {
  const zoomActiveRef = useRef(false);

  const handleZoomStart = useCallback(
    (direction: PTZZoom) => {
      if (disabled) return;
      zoomActiveRef.current = true;
      const zoom = direction === "in" ? 1 : -1;
      sendPTZCommand(cameraId, { action: "zoom", zoom, speed: 0.5 });
    },
    [cameraId, disabled],
  );

  const handleZoomEnd = useCallback(() => {
    if (!zoomActiveRef.current) return;
    zoomActiveRef.current = false;
    sendPTZCommand(cameraId, { action: "stop" });
  }, [cameraId]);

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
          cameraId={cameraId}
          disabled={disabled}
          label="Pan up"
        />
        <div />

        {/* Row 2: left, home, right */}
        <DirectionButton
          direction="left"
          icon={ArrowLeft}
          cameraId={cameraId}
          disabled={disabled}
          label="Pan left"
        />
        <DirectionButton
          direction="home"
          icon={Home}
          cameraId={cameraId}
          disabled={disabled}
          label="Return to home position"
        />
        <DirectionButton
          direction="right"
          icon={ArrowRight}
          cameraId={cameraId}
          disabled={disabled}
          label="Pan right"
        />

        {/* Row 3: down */}
        <div />
        <DirectionButton
          direction="down"
          icon={ArrowDown}
          cameraId={cameraId}
          disabled={disabled}
          label="Pan down"
        />
        <div />
      </div>

      {/* Zoom row */}
      <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-zinc-700/50">
        <button
          onMouseDown={() => handleZoomStart("out")}
          onMouseUp={handleZoomEnd}
          onMouseLeave={handleZoomEnd}
          onTouchStart={() => handleZoomStart("out")}
          onTouchEnd={handleZoomEnd}
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
          onMouseDown={() => handleZoomStart("in")}
          onMouseUp={handleZoomEnd}
          onMouseLeave={handleZoomEnd}
          onTouchStart={() => handleZoomStart("in")}
          onTouchEnd={handleZoomEnd}
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
