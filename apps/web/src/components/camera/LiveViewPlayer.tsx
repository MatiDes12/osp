"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { isTauri } from "@/lib/tauri";
import { getUseMeteredTurn } from "@/lib/webrtc-prefs";

interface LiveViewPlayerProps {
  readonly cameraId: string;
  readonly cameraName: string;
  readonly className?: string;
  readonly onError?: (error: string) => void;
  readonly twoWayAudioSupported?: boolean;
}

interface StreamInfo {
  whepUrl: string;
  token: string;
  fallbackHlsUrl: string;
  wsUrl?: string;
  iceServers: {
    urls: string[];
    username?: string;
    credential?: string;
  }[];
}

type PlayerState =
  | "loading"
  | "connecting"
  | "live"
  | "fallback"
  | "fallback-http"
  | "error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const WEBRTC_TIMEOUT_MS = 12000;

// Per-camera + ICE-mode session cache so repeat visits skip the API fetch.
const streamInfoCache = new Map<string, StreamInfo>();
// Cameras where WebRTC failed this session (key includes STUN-only vs TURN mode).
const webrtcFailed = new Set<string>();

const STUN_ONLY_ICE: StreamInfo["iceServers"] = [
  { urls: ["stun:stun.l.google.com:19302"] },
];

function streamCacheKey(cameraId: string): string {
  return `${cameraId}\0${getUseMeteredTurn() ? "turn" : "direct"}`;
}

function iceServersForLiveView(
  apiServers: StreamInfo["iceServers"],
): StreamInfo["iceServers"] {
  if (getUseMeteredTurn()) {
    return apiServers.map((s) => ({
      urls: s.urls,
      username: s.username,
      credential: s.credential,
    }));
  }
  return STUN_ONLY_ICE;
}

// ---------------------------------------------------------------------------
// Module-level connection pool — survives React component unmounts.
// When a user navigates away, we keep the RTCPeerConnection alive so that
// coming back to the camera view is instant (no ICE re-negotiation needed).
// ---------------------------------------------------------------------------

interface PoolEntry {
  pc: RTCPeerConnection;
  stream: MediaStream;
  streamInfo: StreamInfo;
  lastActiveAt: number;
  useMeteredTurn: boolean;
}

const connectionPool = new Map<string, PoolEntry>();
const POOL_IDLE_TTL_MS = 4 * 60 * 1000; // prune after 4 min idle

// Prune stale/dead connections every 60 seconds
if (typeof window !== "undefined") {
  setInterval(() => {
    const cutoff = Date.now() - POOL_IDLE_TTL_MS;
    for (const [id, entry] of connectionPool) {
      const dead =
        entry.lastActiveAt < cutoff ||
        entry.pc.connectionState === "failed" ||
        entry.pc.connectionState === "closed";
      if (dead) {
        entry.pc.close();
        connectionPool.delete(id);
      }
    }
  }, 60_000);
}

function getPoolEntry(cameraId: string): PoolEntry | null {
  const entry = connectionPool.get(cameraId);
  if (!entry) return null;
  if (entry.useMeteredTurn !== getUseMeteredTurn()) {
    entry.pc.close();
    connectionPool.delete(cameraId);
    return null;
  }
  // Only reuse if the connection is healthy and has live video
  const pcOk =
    entry.pc.connectionState === "connected" ||
    entry.pc.iceConnectionState === "connected" ||
    entry.pc.iceConnectionState === "completed";
  const hasVideo = entry.stream
    .getVideoTracks()
    .some((t) => t.readyState === "live");
  if (!pcOk || !hasVideo) {
    entry.pc.close();
    connectionPool.delete(cameraId);
    return null;
  }
  return entry;
}

// ---------------------------------------------------------------------------

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("osp_access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// ---------------------------------------------------------------------------
// MSE-over-WebSocket fallback player.
// Cloudflare tunnels support WebSocket natively but buffer/terminate infinite
// HTTP streams (MJPEG). go2rtc's /api/ws serves fMP4 over WebSocket — feed
// the binary data to MSE SourceBuffer for smooth video playback.
// ---------------------------------------------------------------------------

/**
 * MSE-over-WebSocket fallback — connects to go2rtc's /api/ws endpoint
 * (through the ngrok tunnel) and pipes fMP4 segments into a MediaSource.
 * ngrok supports WebSocket natively, so this works reliably for live streaming.
 */
function MseFallback({
  wsUrl,
  cameraId,
  cameraName,
  className,
  onError,
  onReconnect,
}: {
  wsUrl: string;
  cameraId: string;
  cameraName: string;
  className?: string;
  onError: () => void;
  onReconnect: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    let errorFired = false;
    let ws: WebSocket | null = null;
    let sb: SourceBuffer | null = null;
    const queue: ArrayBuffer[] = [];

    const fireError = () => {
      if (!destroyed && !errorFired) {
        errorFired = true;
        onErrorRef.current();
      }
    };

    const flush = () => {
      if (!sb || sb.updating || queue.length === 0) return;
      try {
        sb.appendBuffer(queue.shift()!);
      } catch {
        // QuotaExceededError — trim old buffer then retry
        if (sb.buffered.length > 0) {
          const start = sb.buffered.start(0);
          const end = sb.buffered.end(sb.buffered.length - 1);
          if (end - start > 10) {
            try {
              sb.remove(start, end - 5);
            } catch {
              /* ignore */
            }
          }
        }
      }
    };

    const ms = new MediaSource();
    video.src = URL.createObjectURL(ms);

    ms.addEventListener("sourceopen", () => {
      if (destroyed) return;

      console.log("[MSE] Connecting WebSocket:", wsUrl);
      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";

      // If no data arrives within 5s, treat as failed connection
      const dataTimeout = setTimeout(() => {
        if (!sb && !destroyed) {
          console.warn("[MSE] No data received within 5s — firing error");
          fireError();
          try {
            ws?.close();
          } catch {
            /* ignore */
          }
        }
      }, 5000);

      ws.onopen = () => console.log("[MSE] WebSocket connected");

      ws.onmessage = (e) => {
        if (destroyed) return;

        // go2rtc sends a text message first with the MIME type (e.g.
        // 'video/mp4; codecs="avc1.640029"'), then binary fMP4 segments.
        if (typeof e.data === "string" && !sb) {
          clearTimeout(dataTimeout);
          console.log("[MSE] Received MIME type:", e.data);
          try {
            sb = ms.addSourceBuffer(e.data);
            sb.mode = "segments";
            sb.addEventListener("updateend", flush);
          } catch (err) {
            console.error("[MSE] addSourceBuffer failed:", err);
            fireError();
          }
          return;
        }

        if (e.data instanceof ArrayBuffer) {
          clearTimeout(dataTimeout);
          // If no MIME text received, try a safe default
          if (!sb) {
            try {
              sb = ms.addSourceBuffer('video/mp4; codecs="avc1.42E01E"');
              sb.mode = "segments";
              sb.addEventListener("updateend", flush);
            } catch {
              fireError();
              return;
            }
          }
          queue.push(e.data);
          flush();
        }
      };

      ws.onerror = (ev) => {
        console.error("[MSE] WebSocket error:", ev);
        clearTimeout(dataTimeout);
        fireError();
      };
      ws.onclose = (ev) => {
        console.warn("[MSE] WebSocket closed:", ev.code, ev.reason);
        clearTimeout(dataTimeout);
        fireError();
      };
    });

    video.play().catch(() => {});

    // Keep playback near the live edge — if we fall behind by >3s, jump forward
    const liveEdge = setInterval(() => {
      if (video.buffered.length > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        if (end - video.currentTime > 3) {
          video.currentTime = end - 0.5;
        }
      }
    }, 3000);

    return () => {
      destroyed = true;
      clearInterval(liveEdge);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
      if (ms.readyState === "open") {
        try {
          ms.endOfStream();
        } catch {
          /* ignore */
        }
      }
      URL.revokeObjectURL(video.src);
    };
  }, [wsUrl]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <video
        ref={videoRef}
        className="aspect-video w-full bg-black rounded-lg object-contain"
        autoPlay
        muted
        playsInline
      />
      <div className="absolute top-2 left-2 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-green-600/80 text-white">
          Live
        </span>
      </div>
      <div className="absolute top-2 right-2">
        <button
          onClick={onReconnect}
          className="p-1.5 rounded bg-black/50 text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
          title="Retry WebRTC"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MSE-over-HTTP fallback player.
// When WebSocket through ngrok fails, this uses go2rtc's /api/stream.mp4
// endpoint via a plain HTTP request through the gateway. HTTP through ngrok
// is proven to work (snapshots return 200). The fMP4 data is fed into MSE
// via fetch() + ReadableStream.
// ---------------------------------------------------------------------------
function MseHttpFallback({
  httpUrl,
  cameraId,
  cameraName,
  className,
  onError,
  onReconnect,
}: {
  httpUrl: string;
  cameraId: string;
  cameraName: string;
  className?: string;
  onError: () => void;
  onReconnect: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    let errorFired = false;
    const abortCtrl = new AbortController();

    const fireError = () => {
      if (!destroyed && !errorFired) {
        errorFired = true;
        onErrorRef.current();
      }
    };

    const ms = new MediaSource();
    video.src = URL.createObjectURL(ms);

    // Declared here so the proactiveTrim interval (registered after sourceopen)
    // can reference the SourceBuffer without a closure scope issue.
    let sbRef: SourceBuffer | null = null;

    ms.addEventListener("sourceopen", async () => {
      if (destroyed) return;

      try {
        console.log("[MSE-HTTP] Fetching:", httpUrl);
        const resp = await fetch(httpUrl, {
          signal: abortCtrl.signal,
          headers: getAuthHeaders(),
        });

        if (!resp.ok || !resp.body) {
          console.error("[MSE-HTTP] Fetch failed:", resp.status);
          fireError();
          return;
        }

        // Use Content-Type from go2rtc, fall back to safe default
        const contentType =
          resp.headers.get("Content-Type") ?? 'video/mp4; codecs="avc1.42E01E"';
        // go2rtc returns "video/mp4" without codecs — MSE needs codecs
        const mimeType = contentType.includes("codecs")
          ? contentType
          : 'video/mp4; codecs="avc1.42E01E"';

        let sb: SourceBuffer;
        try {
          sb = ms.addSourceBuffer(mimeType);
          sbRef = sb;
          sb.mode = "segments";
        } catch (err) {
          console.error("[MSE-HTTP] addSourceBuffer failed:", err);
          fireError();
          return;
        }

        console.log("[MSE-HTTP] Streaming started, MIME:", mimeType);

        const reader = resp.body.getReader();
        let gotData = false;

        // Timeout: if no data within 8s, assume connection is dead
        const dataTimeout = setTimeout(() => {
          if (!gotData && !destroyed) {
            console.warn("[MSE-HTTP] No data received within 8s");
            fireError();
            abortCtrl.abort();
          }
        }, 8000);

        let initialSeekDone = false;

        const pump = async () => {
          try {
            while (!destroyed) {
              const { done, value } = await reader.read();
              if (done || destroyed) break;

              if (!gotData) {
                gotData = true;
                clearTimeout(dataTimeout);
                console.log(
                  "[MSE-HTTP] First data chunk received, size:",
                  value.byteLength,
                );
              }

              // Wait for SourceBuffer to be ready
              if (sb.updating) {
                await new Promise<void>((resolve) =>
                  sb.addEventListener("updateend", () => resolve(), {
                    once: true,
                  }),
                );
              }

              try {
                sb.appendBuffer(value);
              } catch {
                // QuotaExceededError — trim old buffer
                if (sb.buffered.length > 0) {
                  const start = sb.buffered.start(0);
                  const end = sb.buffered.end(sb.buffered.length - 1);
                  if (end - start > 10) {
                    try {
                      if (sb.updating) {
                        await new Promise<void>((r) =>
                          sb.addEventListener("updateend", () => r(), {
                            once: true,
                          }),
                        );
                      }
                      sb.remove(start, end - 5);
                    } catch {
                      /* ignore */
                    }
                  }
                }
              }

              // Wait for append to complete
              if (sb.updating) {
                await new Promise<void>((resolve) =>
                  sb.addEventListener("updateend", () => resolve(), {
                    once: true,
                  }),
                );
              }

              // Jump to live edge once the buffer has real duration. If we seek when
              // liveEnd≈0 (init segment only), playhead stays at 0 and latency grows
              // with every appended fragment (minutes behind).
              if (!initialSeekDone && video.buffered.length > 0) {
                const liveEnd = video.buffered.end(video.buffered.length - 1);
                if (liveEnd >= 0.5) {
                  initialSeekDone = true;
                  video.currentTime = Math.max(0, liveEnd - 0.1);
                  console.log(
                    "[MSE-HTTP] Initial seek to live edge:",
                    liveEnd.toFixed(2),
                  );
                }
              }
            }
          } catch (err) {
            if (!destroyed && !abortCtrl.signal.aborted) {
              console.error("[MSE-HTTP] Read error:", err);
              fireError();
            }
          }
        };

        pump();
      } catch (err) {
        if (!destroyed && !abortCtrl.signal.aborted) {
          console.error("[MSE-HTTP] Stream error:", err);
          fireError();
        }
      }
    });

    video.play().catch(() => {});

    // Periodically drop buffer *behind* the playhead only. Trimming with remove(start, end-3)
    // while currentTime was still near 0 caused timeline jumps and stutter.
    const proactiveTrim = setInterval(() => {
      if (!sbRef || sbRef.updating || !video.buffered.length) return;
      const start = video.buffered.start(0);
      const end = video.buffered.end(video.buffered.length - 1);
      const ct = video.currentTime;
      if (end - start <= 12) return;
      const removeEnd = Math.min(end - 6, ct - 2);
      if (removeEnd > start + 0.25) {
        try {
          sbRef.remove(start, removeEnd);
        } catch {
          /* ignore */
        }
      }
    }, 5000);

    // Live edge: match pre–TURN-tuning feel — aggressive enough for low latency,
    // not so often that seeks fight decoding (250ms + end-0.05 felt choppy).
    const liveEdge = setInterval(() => {
      if (video.buffered.length > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        const behind = end - video.currentTime;
        if (behind > 0.8) {
          video.currentTime = end - 0.1;
        }
      }
    }, 500);

    return () => {
      destroyed = true;
      clearInterval(proactiveTrim);
      clearInterval(liveEdge);
      abortCtrl.abort();
      if (ms.readyState === "open") {
        try {
          ms.endOfStream();
        } catch {
          /* ignore */
        }
      }
      URL.revokeObjectURL(video.src);
    };
  }, [httpUrl]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <video
        ref={videoRef}
        className="aspect-video w-full bg-black rounded-lg object-contain"
        autoPlay
        muted
        playsInline
      />
      <div className="absolute top-2 left-2 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-green-600/80 text-white">
          Live
        </span>
      </div>
      <div className="absolute top-2 right-2">
        <button
          onClick={onReconnect}
          className="p-1.5 rounded bg-black/50 text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
          title="Retry"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function LiveViewPlayer({
  cameraId,
  cameraName,
  className,
  onError,
  twoWayAudioSupported = false,
}: LiveViewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const retryRef = useRef(false);
  const streamInfoRef = useRef<StreamInfo | null>(null);

  const [state, setState] = useState<PlayerState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  // Incremented on each MSE-HTTP drop to force MseHttpFallback to re-mount.
  // After MSE_HTTP_MAX_RETRIES consecutive drops, we give up and show an error.
  const [mseHttpRetry, setMseHttpRetry] = useState(0);
  const MSE_HTTP_MAX_RETRIES = 3;

  // Snapshot shown while WebRTC is connecting (instant visual feedback)
  const [snapshotDataUrl, setSnapshotDataUrl] = useState<string | null>(null);

  // Two-way audio state
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSenderRef = useRef<RTCRtpSender | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Speaker/volume state
  const [speakerMuted, setSpeakerMuted] = useState(true);
  const [volume, setVolume] = useState(0.7);

  // Keep streamInfoRef in sync so cleanup can read it without a stale closure
  useEffect(() => {
    streamInfoRef.current = streamInfo;
  }, [streamInfo]);

  // Fetch a snapshot immediately to show while WebRTC connects
  const prefetchSnapshot = useCallback(async () => {
    try {
      const cloudSnapshotUrl = `${API_URL}/api/v1/cameras/${cameraId}/snapshot`;
      const localSnapshotUrl = `http://localhost:1984/api/frame.jpeg?src=${encodeURIComponent(cameraId)}`;
      const isLocal = isTauri();
      const canReachLocal = !isLocal && window.location.protocol !== "https:";
      let res = await fetch(isLocal ? localSnapshotUrl : cloudSnapshotUrl, {
        headers: isLocal ? {} : getAuthHeaders(),
        signal: AbortSignal.timeout(4000),
      }).catch(() => null);
      // On HTTP, try local go2rtc snapshot as fallback (no localStorage gate)
      if ((!res || !res.ok) && canReachLocal) {
        res = await fetch(localSnapshotUrl, {
          signal: AbortSignal.timeout(4000),
        }).catch(() => null);
      }
      if (!res?.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setSnapshotDataUrl(url);
    } catch {
      // Non-critical — just means no preview while connecting
    }
  }, [cameraId]);

  const stopMic = useCallback(() => {
    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) track.stop();
      micStreamRef.current = null;
    }
    if (micSenderRef.current && pcRef.current) {
      try {
        pcRef.current.removeTrack(micSenderRef.current);
      } catch {
        /* closed */
      }
      micSenderRef.current = null;
    }
    setMicActive(false);
    setMicError(null);
  }, []);

  // Detach from DOM without closing — called on unmount when we want to pool
  const detachFromDom = useCallback(() => {
    stopMic();
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [stopMic]);

  // Full teardown — closes the peer connection too
  const teardown = useCallback(() => {
    detachFromDom();
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  }, [detachFromDom]);

  const fallbackToHLS = useCallback(
    (info: StreamInfo) => {
      teardown();
      // Remember that WebRTC failed for this camera + ICE mode
      webrtcFailed.add(streamCacheKey(cameraId));

      // On HTTPS, skip WebSocket MSE (ngrok doesn't relay WS frames reliably)
      // and go straight to HTTP-based MSE streaming
      if (
        typeof window !== "undefined" &&
        window.location.protocol === "https:"
      ) {
        console.log(
          "[LiveViewPlayer] WebRTC failed on HTTPS, falling back to HTTP MSE",
        );
        setState("fallback-http");
        return;
      }

      if (info.fallbackHlsUrl) {
        setState("fallback");
      } else {
        setState("error");
        setErrorMessage("WebRTC failed and no HLS fallback available");
        onError?.("WebRTC failed and no HLS fallback available");
      }
    },
    [cameraId, teardown, onError],
  );

  const connectWebRTC = useCallback(
    async (info: StreamInfo) => {
      teardown();
      setState("connecting");
      retryRef.current = false;

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const pc = new RTCPeerConnection({
          iceServers: info.iceServers.map((s) => ({
            urls: s.urls,
            username: s.username,
            credential: s.credential,
          })),
        });
        pcRef.current = pc;

        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", {
          direction: twoWayAudioSupported ? "sendrecv" : "recvonly",
        });

        // Track received from go2rtc — attach to video but don't show "live" yet.
        // ICE may still be "checking"; media only flows once ICE is connected.
        let pendingStream: MediaStream | null = null;
        pc.ontrack = (event) => {
          const stream = event.streams[0];
          if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            pendingStream = stream;
          }
        };

        pc.oniceconnectionstatechange = () => {
          const s = pc.iceConnectionState;
          if (s === "connected" || s === "completed") {
            if (pendingStream) {
              setState("live");
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
              connectionPool.set(cameraId, {
                pc,
                stream: pendingStream,
                streamInfo: info,
                lastActiveAt: Date.now(),
                useMeteredTurn: getUseMeteredTurn(),
              });

              // Verify actual video frames are rendering — ICE may report
              // "connected" but Docker bridge networking can block RTP media
              // transport (UDP), resulting in a dark screen.
              timeoutRef.current = setTimeout(() => {
                const video = videoRef.current;
                if (video && (video.videoWidth === 0 || video.readyState < 2)) {
                  console.warn(
                    "[LiveViewPlayer] ICE connected but no video frames — falling back to MSE",
                  );
                  fallbackToHLS(info);
                }
              }, 4000);
            }
          } else if (s === "failed") {
            fallbackToHLS(info);
          }
        };

        timeoutRef.current = setTimeout(() => {
          const s = pc.iceConnectionState;
          if (s !== "connected" && s !== "completed") {
            fallbackToHLS(info);
          }
        }, WEBRTC_TIMEOUT_MS);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (abort.signal.aborted) return;

        const isDirectGo2rtc = info.whepUrl.includes("/api/webrtc");
        const whepHeaders: Record<string, string> = {
          "Content-Type": isDirectGo2rtc
            ? "application/json"
            : "application/sdp",
        };
        if (!isDirectGo2rtc) {
          const tok = localStorage.getItem("osp_access_token");
          if (tok) whepHeaders["Authorization"] = `Bearer ${tok}`;
        }

        const whepResponse = await fetch(info.whepUrl, {
          method: "POST",
          headers: whepHeaders,
          body: isDirectGo2rtc
            ? JSON.stringify({ type: "offer", sdp: offer.sdp })
            : offer.sdp,
          signal: abort.signal,
        });

        if (!whepResponse.ok) {
          throw new Error(`WHEP server returned ${whepResponse.status}`);
        }

        const responseText = await whepResponse.text();
        let answerSdp: string;
        try {
          const parsed = JSON.parse(responseText);
          answerSdp = parsed.sdp ?? responseText;
        } catch {
          answerSdp = responseText;
        }
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      } catch (err) {
        if (abort.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "WebRTC connection failed";
        console.error("[LiveViewPlayer] WebRTC error:", message);

        // Auto-retry once after 2s
        if (!retryRef.current) {
          retryRef.current = true;
          setState("connecting");
          setTimeout(() => {
            if (!abort.signal.aborted) void connectWebRTC(info);
          }, 2000);
          return;
        }
        retryRef.current = false;
        fallbackToHLS(info);
      }
    },
    [cameraId, teardown, fallbackToHLS, twoWayAudioSupported],
  );

  const fetchStreamAndConnect = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);
    try {
      // Use cached stream info if available — avoids API round-trip on repeat visits
      const cacheKey = streamCacheKey(cameraId);
      let info: StreamInfo | undefined = streamInfoCache.get(cacheKey);

      if (!info) {
        if (isTauri()) {
          // Desktop: go2rtc runs locally as a sidecar — connect directly
          const go2rtcBase = "http://localhost:1984";
          info = {
            whepUrl: `${go2rtcBase}/api/webrtc?src=${encodeURIComponent(cameraId)}`,
            token: "",
            fallbackHlsUrl: `${go2rtcBase}/api/stream.m3u8?src=${encodeURIComponent(cameraId)}`,
            wsUrl: `ws://localhost:1984/api/ws?src=${encodeURIComponent(cameraId)}`,
            iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
          };
        } else if (window.location.protocol === "https:") {
          // HTTPS: browser blocks HTTP localhost fetches — cloud gateway only
          const response = await fetch(
            `${API_URL}/api/v1/cameras/${cameraId}/stream`,
            { headers: getAuthHeaders(), signal: AbortSignal.timeout(5000) },
          );
          if (!response.ok)
            throw new Error(`Failed to fetch stream info (${response.status})`);
          const json = await response.json();
          info = json.data ?? json;
        } else {
          // HTTP: probe local go2rtc regardless of setup flag — no localStorage dependency
          const localOk = await fetch("http://localhost:1984/api/streams", {
            signal: AbortSignal.timeout(1500),
          })
            .then((r) => r.ok)
            .catch(() => false);

          if (localOk) {
            const base = "http://localhost:1984";
            info = {
              whepUrl: `${base}/api/webrtc?src=${encodeURIComponent(cameraId)}`,
              token: "",
              fallbackHlsUrl: `${base}/api/stream.m3u8?src=${encodeURIComponent(cameraId)}`,
              wsUrl: `ws://localhost:1984/api/ws?src=${encodeURIComponent(cameraId)}`,
              iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
            };
          } else {
            // Local go2rtc not running — fall back to cloud
            const response = await fetch(
              `${API_URL}/api/v1/cameras/${cameraId}/stream`,
              { headers: getAuthHeaders(), signal: AbortSignal.timeout(5000) },
            );
            if (!response.ok)
              throw new Error(
                `Failed to fetch stream info (${response.status})`,
              );
            const json = await response.json();
            info = json.data ?? json;
          }
        }
        const raw = info as StreamInfo;
        info = {
          ...raw,
          iceServers: iceServersForLiveView(raw.iceServers),
        };
        streamInfoCache.set(cacheKey, info);
      }

      const resolvedInfo = info as StreamInfo;
      setStreamInfo(resolvedInfo);
      streamInfoRef.current = resolvedInfo;

      // If WebRTC already failed for this camera + ICE mode this session, skip fallback path
      if (webrtcFailed.has(streamCacheKey(cameraId))) {
        setState(
          typeof window !== "undefined" && window.location.protocol === "https:"
            ? "fallback-http"
            : "fallback",
        );
        return;
      }

      // Try WebRTC first (ICE from Settings: TURN off = STUN-only by default).
      // Falls back to HTTP MSE if it fails.
      await connectWebRTC(resolvedInfo);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load stream";
      setState("error");
      setErrorMessage(message);
      onError?.(message);
    }
  }, [cameraId, connectWebRTC, onError]);

  // Main effect — runs on mount (and when cameraId changes)
  useEffect(() => {
    // Check pool first — instant reconnect if connection is alive
    const pooled = getPoolEntry(cameraId);
    if (pooled) {
      pooled.lastActiveAt = Date.now();
      pcRef.current = pooled.pc;
      setStreamInfo(pooled.streamInfo);
      streamInfoRef.current = pooled.streamInfo;
      if (videoRef.current) videoRef.current.srcObject = pooled.stream;
      setState("live");

      return () => {
        // On unmount: detach from DOM, update pool timestamp — don't close PC
        const e = connectionPool.get(cameraId);
        if (e) e.lastActiveAt = Date.now();
        detachFromDom();
        pcRef.current = null;
      };
    }

    // No pool hit — fetch stream info and do full WebRTC connect
    void prefetchSnapshot(); // show still while connecting
    void fetchStreamAndConnect();

    return () => {
      // On unmount: if we're connected, save to pool; otherwise teardown
      const pc = pcRef.current;
      const stream = videoRef.current?.srcObject as MediaStream | null;
      const info = streamInfoRef.current;

      if (
        pc &&
        info &&
        stream &&
        (pc.connectionState === "connected" ||
          pc.iceConnectionState === "connected" ||
          pc.iceConnectionState === "completed")
      ) {
        connectionPool.set(cameraId, {
          pc,
          stream,
          streamInfo: info,
          lastActiveAt: Date.now(),
          useMeteredTurn: getUseMeteredTurn(),
        });
        detachFromDom();
        pcRef.current = null;
      } else {
        teardown();
      }
    };
    // cameraId intentionally the only dep — reconnect only when camera changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId]);

  // Revoke snapshot blob URL when no longer needed
  useEffect(() => {
    if (state === "live" && snapshotDataUrl) {
      const url = snapshotDataUrl;
      // Small delay so there's no flash between snapshot and live video
      const t = setTimeout(() => {
        URL.revokeObjectURL(url);
        setSnapshotDataUrl(null);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [state, snapshotDataUrl]);

  // Sync volume/muted to video element
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = volume;
    videoRef.current.muted = speakerMuted;
  }, [volume, speakerMuted]);

  const handleReconnect = useCallback(() => {
    // Force close the pool entry for this camera so we do a fresh connect
    const e = connectionPool.get(cameraId);
    if (e) {
      e.pc.close();
      connectionPool.delete(cameraId);
    }
    // Clear failure flag so manual reconnect retries WebRTC
    webrtcFailed.delete(streamCacheKey(cameraId));
    setMseHttpRetry(0); // reset drop counter on manual reconnect
    teardown();
    void fetchStreamAndConnect();
  }, [cameraId, teardown, fetchStreamAndConnect]);

  const toggleMic = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    if (micActive) {
      stopMic();
      return;
    }

    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) throw new Error("No audio track available");
      micSenderRef.current = pc.addTrack(audioTrack, stream);
      setMicActive(true);
    } catch (err) {
      setMicError(
        err instanceof Error ? err.message : "Microphone access denied",
      );
      if (micStreamRef.current) {
        for (const t of micStreamRef.current.getTracks()) t.stop();
        micStreamRef.current = null;
      }
    }
  }, [micActive, stopMic]);

  const toggleSpeakerMute = useCallback(() => setSpeakerMuted((p) => !p), []);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      setVolume(v);
      if (v > 0 && speakerMuted) setSpeakerMuted(false);
    },
    [speakerMuted],
  );

  // MSE-over-WebSocket fallback.
  // - Tauri (desktop): direct local WebSocket to go2rtc
  // - HTTPS (cloud): proxy through the gateway (browser→WSS→gateway→WS→ngrok→go2rtc)
  //   because browsers block mixed-content ws:// from HTTPS pages.
  if (state === "fallback") {
    let wsUrl: string | undefined;
    if (isTauri()) {
      wsUrl = `ws://localhost:1984/api/ws?src=${encodeURIComponent(cameraId)}`;
    } else if (
      typeof window !== "undefined" &&
      window.location.protocol === "https:"
    ) {
      // Route through gateway proxy — it connects to ngrok over HTTP internally
      const accessToken = localStorage.getItem("osp_access_token") ?? "";
      const gatewayWs = API_URL.replace(/^https:/, "wss:").replace(
        /^http:/,
        "ws:",
      );
      wsUrl = `${gatewayWs}/api/v1/cameras/${encodeURIComponent(cameraId)}/ws?token=${encodeURIComponent(accessToken)}&cameraId=${encodeURIComponent(cameraId)}`;
    } else {
      // HTTP localhost — direct tunnel URL
      wsUrl = streamInfo?.wsUrl ?? undefined;
    }

    if (wsUrl && typeof MediaSource !== "undefined") {
      return (
        <MseFallback
          wsUrl={wsUrl}
          cameraId={cameraId}
          cameraName={cameraName}
          className={className}
          onError={() => {
            // WebSocket failed — try HTTP streaming instead
            console.log(
              "[LiveView] MSE-over-WebSocket failed, trying HTTP streaming",
            );
            setState("fallback-http");
          }}
          onReconnect={handleReconnect}
        />
      );
    }

    // No WebSocket URL — skip straight to HTTP
    setState("fallback-http");
  }

  // HTTP-based MSE fallback — uses go2rtc's /api/stream.mp4 via the gateway
  // HTTP proxy. This avoids WebSocket through the tunnel entirely.
  // In Tauri (desktop), go2rtc runs locally so we connect directly without
  // going through the gateway (which would 502 trying to proxy localhost:1984).
  if (state === "fallback-http") {
    const httpUrl = isTauri()
      ? `http://localhost:1984/api/stream.mp4?src=${encodeURIComponent(cameraId)}`
      : `${API_URL}/api/v1/cameras/${encodeURIComponent(cameraId)}/live.mp4`;

    if (typeof MediaSource !== "undefined") {
      return (
        <MseHttpFallback
          key={mseHttpRetry}
          httpUrl={httpUrl}
          cameraId={cameraId}
          cameraName={cameraName}
          className={className}
          onError={() => {
            if (mseHttpRetry < MSE_HTTP_MAX_RETRIES) {
              // Stream dropped (connection reset / ngrok hiccup) — re-mount after a short pause
              console.log(
                `[LiveView] MSE-HTTP drop #${mseHttpRetry + 1}, retrying...`,
              );
              setTimeout(() => setMseHttpRetry((n) => n + 1), 1500);
            } else {
              streamInfoCache.delete(streamCacheKey(cameraId));
              setErrorMessage("Stream unavailable");
              setState("error");
            }
          }}
          onReconnect={handleReconnect}
        />
      );
    }

    streamInfoCache.delete(streamCacheKey(cameraId));
    setErrorMessage(
      "Stream unavailable — browser does not support MediaSource",
    );
    setState("error");
  }

  return (
    <div
      className={`relative aspect-video rounded-lg bg-black overflow-hidden ${className ?? ""}`}
    >
      {/* Snapshot overlay — shown while WebRTC is connecting */}
      {snapshotDataUrl && state !== "live" && (
        <img
          src={snapshotDataUrl}
          alt={`${cameraName} last snapshot`}
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        />
      )}

      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        autoPlay
        muted
        playsInline
      />

      {/* LIVE badge */}
      {state === "live" && (
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-red-500/80 text-white">
            Live
          </span>
          {micActive && (
            <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-blue-500/80 text-white animate-pulse">
              AUDIO
            </span>
          )}
        </div>
      )}

      {/* Reconnect button (top-right when live) */}
      {state === "live" && (
        <div className="absolute top-2 right-2">
          <button
            onClick={handleReconnect}
            className="p-1.5 rounded bg-black/50 text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
            title="Reconnect"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Audio controls bar (bottom) */}
      {state === "live" && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 z-10">
          {twoWayAudioSupported && (
            <div className="relative">
              <button
                onClick={toggleMic}
                className={`p-1.5 rounded-md backdrop-blur-sm transition-colors duration-150 cursor-pointer ${
                  micActive
                    ? "bg-blue-500/30 text-blue-400 hover:bg-blue-500/40"
                    : "bg-black/50 text-zinc-300 hover:text-white hover:bg-black/70"
                }`}
                aria-label={micActive ? "Mute microphone" : "Unmute microphone"}
              >
                {micActive ? (
                  <Mic className="w-4 h-4 animate-pulse" />
                ) : (
                  <MicOff className="w-4 h-4" />
                )}
              </button>
              {micError && (
                <div className="absolute bottom-full left-0 mb-1 w-48 p-2 rounded-md bg-red-500/20 border border-red-500/30 text-[10px] text-red-300 backdrop-blur-sm">
                  {micError}
                </div>
              )}
            </div>
          )}
          <button
            onClick={toggleSpeakerMute}
            className="p-1.5 rounded-md backdrop-blur-sm bg-black/50 text-zinc-300 hover:text-white transition-colors duration-150 cursor-pointer"
            aria-label={speakerMuted ? "Unmute speaker" : "Mute speaker"}
          >
            {speakerMuted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={speakerMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-20 h-1 rounded-full appearance-none bg-zinc-600 accent-blue-500 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
            aria-label="Volume"
          />
        </div>
      )}

      {/* Loading / connecting overlay */}
      {(state === "loading" || state === "connecting") && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]" />
            <span className="text-xs text-[var(--color-muted)]">
              {state === "loading" ? "Loading stream info..." : "Connecting..."}
            </span>
            <span className="text-[10px] text-[var(--color-muted)] opacity-60">
              {cameraName}
            </span>
          </div>
        </div>
      )}

      {/* Error state */}
      {state === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center px-4">
            <svg
              className="w-10 h-10 mx-auto mb-2 text-[var(--color-error)] opacity-50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm text-[var(--color-error)] mb-1">
              Stream unavailable
            </p>
            <p className="text-xs text-[var(--color-muted)] mb-3">
              {errorMessage ?? "Connection failed"}
            </p>
            <button
              onClick={handleReconnect}
              className="px-3 py-1.5 text-xs rounded-md bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors"
            >
              Reconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
