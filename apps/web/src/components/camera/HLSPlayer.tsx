"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import Hls from "hls.js";

interface HLSPlayerProps {
  readonly url: string;
  readonly className?: string;
  readonly controls?: boolean;
  readonly videoRef?: RefObject<HTMLVideoElement>;
  readonly muted?: boolean;
}

type PlayerState = "loading" | "playing" | "error";

export function HLSPlayer({
  url,
  className,
  controls,
  videoRef: videoRefProp,
  muted = true,
}: HLSPlayerProps) {
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = videoRefProp ?? internalVideoRef;
  const hlsRef = useRef<Hls | null>(null);
  const [state, setState] = useState<PlayerState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setState("loading");
    setErrorMessage(null);

    // Safari supports HLS natively
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("loadedmetadata", () => {
        video.play().catch(() => {
          // Autoplay may be blocked; that's ok
        });
      });
      video.addEventListener("playing", () => setState("playing"));
      video.addEventListener("error", () => {
        setState("error");
        setErrorMessage("Failed to load HLS stream");
      });

      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }

    // Use hls.js for other browsers
    if (!Hls.isSupported()) {
      setState("error");
      setErrorMessage("HLS is not supported in this browser");
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
    });

    hlsRef.current = hls;
    hls.loadSource(url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {
        // Autoplay may be blocked
      });
    });

    hls.on(Hls.Events.FRAG_LOADED, () => {
      if (state !== "playing") {
        setState("playing");
      }
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        setState("error");
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            setErrorMessage("Network error loading HLS stream");
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            setErrorMessage("Media error in HLS stream");
            hls.recoverMediaError();
            break;
          default:
            setErrorMessage("Fatal error loading HLS stream");
            hls.destroy();
            break;
        }
      }
    });

    return () => {
      hls.destroy();
      hlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden ${className ?? ""}`}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        muted={muted}
        playsInline
        controls={controls}
      >
        <track kind="captions" />
      </video>

      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]" />
            <span className="text-xs text-[var(--color-muted)]">Loading stream...</span>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <svg
              className="w-8 h-8 mx-auto mb-2 text-[var(--color-error)] opacity-60"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-sm text-[var(--color-error)]">{errorMessage ?? "Stream error"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
