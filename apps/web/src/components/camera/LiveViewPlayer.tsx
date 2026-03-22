"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { isTauri } from "@/lib/tauri";

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
  iceServers: {
    urls: string[];
    username?: string;
    credential?: string;
  }[];
}

type PlayerState = "loading" | "connecting" | "live" | "fallback" | "error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const WEBRTC_TIMEOUT_MS = 8000;

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
      let res = await fetch(
        isLocal ? localSnapshotUrl : cloudSnapshotUrl,
        {
          headers: isLocal ? {} : getAuthHeaders(),
          signal: AbortSignal.timeout(4000),
        },
      ).catch(() => null);
      // On HTTP, try local go2rtc snapshot as fallback (no localStorage gate)
      if ((!res || !res.ok) && canReachLocal) {
        res = await fetch(localSnapshotUrl, { signal: AbortSignal.timeout(4000) }).catch(() => null);
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
      if (info.fallbackHlsUrl) {
        setState("fallback");
      } else {
        setState("error");
        setErrorMessage("WebRTC failed and no HLS fallback available");
        onError?.("WebRTC failed and no HLS fallback available");
      }
    },
    [teardown, onError],
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
            // ICE succeeded — media is actually flowing now
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
              });
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
      let info: StreamInfo;

      if (isTauri()) {
        // Desktop: go2rtc runs locally as a sidecar — connect directly
        const go2rtcBase = "http://localhost:1984";
        info = {
          whepUrl: `${go2rtcBase}/api/webrtc?src=${encodeURIComponent(cameraId)}`,
          token: "",
          fallbackHlsUrl: `${go2rtcBase}/api/stream.m3u8?src=${encodeURIComponent(cameraId)}`,
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
        }).then((r) => r.ok).catch(() => false);

        if (localOk) {
          const base = "http://localhost:1984";
          info = {
            whepUrl: `${base}/api/webrtc?src=${encodeURIComponent(cameraId)}`,
            token: "",
            fallbackHlsUrl: `${base}/api/stream.m3u8?src=${encodeURIComponent(cameraId)}`,
            iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
          };
        } else {
          // Local go2rtc not running — fall back to cloud
          const response = await fetch(
            `${API_URL}/api/v1/cameras/${cameraId}/stream`,
            { headers: getAuthHeaders(), signal: AbortSignal.timeout(5000) },
          );
          if (!response.ok)
            throw new Error(`Failed to fetch stream info (${response.status})`);
          const json = await response.json();
          info = json.data ?? json;
        }
      }

      setStreamInfo(info);
      streamInfoRef.current = info;
      await connectWebRTC(info);
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

  // MJPEG fallback — works in all browsers via <img>, no codec/MSE issues.
  // go2rtc's /api/stream.mjpeg is a multipart/x-mixed-replace stream that
  // browsers display natively as a continuously-updating image.
  if (state === "fallback") {
    const fallbackBase = streamInfo?.fallbackHlsUrl
      ? streamInfo.fallbackHlsUrl.replace(/\/api\/stream\.m3u8.*$/, "")
      : isTauri()
        ? "http://localhost:1984"
        : (process.env["NEXT_PUBLIC_GO2RTC_URL"] ?? "http://localhost:1984");
    const mjpegUrl = `${fallbackBase}/api/stream.mjpeg?src=${encodeURIComponent(cameraId)}`;
    return (
      <div className={`relative ${className ?? ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mjpegUrl}
          alt={`${cameraName} live`}
          className="aspect-video w-full bg-black rounded-lg object-contain"
          onError={() => {
            setErrorMessage("Stream unavailable");
            setState("error");
          }}
        />
        <div className="absolute top-2 left-2 flex items-center gap-2">
          <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-yellow-500/80 text-black">
            HLS
          </span>
        </div>
        <div className="absolute top-2 right-2">
          <button
            onClick={handleReconnect}
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

  return (
    <div
      className={`relative aspect-video rounded-lg bg-black border border-[var(--color-border)] overflow-hidden ${className ?? ""}`}
    >
      {/* Snapshot overlay — shown while WebRTC is connecting */}
      {snapshotDataUrl && state !== "live" && (
        <img
          src={snapshotDataUrl}
          alt={`${cameraName} last snapshot`}
          className="absolute inset-0 w-full h-full object-contain opacity-60"
        />
      )}

      <video
        ref={videoRef}
        className="w-full h-full object-contain"
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
