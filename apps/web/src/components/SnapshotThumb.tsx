"use client";

/**
 * SnapshotThumb — renders a camera snapshot thumbnail from any URL scheme.
 *
 * For `local://` paths (Tauri desktop):
 *   1. Tries `convertFileSrc` (asset:// protocol) — zero IPC, instant.
 *   2. On error, falls back to `readLocalFileAsUrl` (read_local_file IPC) — reliable.
 * For regular https:// or data: URLs, renders directly.
 * For null / missing URL, renders a styled placeholder.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Camera, ZoomIn } from "lucide-react";
import { isTauri, convertFileSrc, readLocalFileAsUrl } from "@/lib/tauri";

interface SnapshotThumbProps {
  snapshotUrl: string | null | undefined;
  alt?: string;
  className?: string;
  /** Called when the user clicks to expand. If provided, a zoom cursor/overlay is shown. */
  onClick?: () => void;
}

export function SnapshotThumb({
  snapshotUrl,
  alt = "Event snapshot",
  className = "",
  onClick,
}: SnapshotThumbProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const blobUrlRef = useRef<string | null>(null);

  // Revoke any blob URL when the component unmounts or snapshotUrl changes
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [snapshotUrl]);

  useEffect(() => {
    if (!snapshotUrl) {
      setSrc(null);
      setLoadState("idle");
      return;
    }

    if (snapshotUrl.startsWith("local://")) {
      if (!isTauri()) {
        setSrc(null);
        setLoadState("error");
        return;
      }
      const localPath = snapshotUrl.replace("local://", "");
      const assetUrl = convertFileSrc(localPath);
      if (assetUrl) {
        setSrc(assetUrl);
        setLoadState("loading");
      } else {
        setSrc(null);
        setLoadState("error");
      }
    } else {
      setSrc(snapshotUrl);
      setLoadState("loading");
    }
  }, [snapshotUrl]);

  // On asset protocol failure, fall back to blob URL via IPC
  const handleError = useCallback(async () => {
    if (!snapshotUrl?.startsWith("local://") || !isTauri()) {
      setLoadState("error");
      return;
    }
    const localPath = snapshotUrl.replace("local://", "");
    const blobUrl = await readLocalFileAsUrl(localPath, "image/jpeg");
    if (blobUrl) {
      blobUrlRef.current = blobUrl;
      setSrc(blobUrl);
      setLoadState("loading"); // img will fire onLoad
    } else {
      setLoadState("error");
    }
  }, [snapshotUrl]);

  const handleLoad = useCallback(() => {
    setLoadState("loaded");
  }, []);

  const isClickable = !!onClick;

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-zinc-800 ${className} ${
        isClickable ? "cursor-zoom-in group" : ""
      }`}
      onClick={isClickable ? onClick : undefined}
    >
      {/* Image */}
      {src && loadState !== "error" && (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-all duration-300 ${
            loadState === "loaded" ? "opacity-100" : "opacity-0"
          } ${isClickable ? "group-hover:scale-105" : ""}`}
          onLoad={handleLoad}
          onError={handleError}
          draggable={false}
        />
      )}

      {/* Skeleton shimmer while loading */}
      {loadState === "loading" && (
        <div className="absolute inset-0 bg-zinc-800 animate-pulse" />
      )}

      {/* Placeholder when no snapshot */}
      {(!src || loadState === "error") && loadState !== "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Camera className="w-4 h-4 text-zinc-600" />
        </div>
      )}

      {/* Hover zoom overlay */}
      {isClickable && loadState === "loaded" && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200 flex items-center justify-center">
          <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-90 transition-opacity duration-200 drop-shadow-lg" />
        </div>
      )}
    </div>
  );
}
