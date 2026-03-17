"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { HLSPlayer } from "./HLSPlayer";

interface LiveViewPlayerProps {
  readonly cameraId: string;
  readonly cameraName: string;
  readonly className?: string;
  readonly onError?: (error: string) => void;
  /** Whether the camera supports backchannel (two-way) audio */
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
const WEBRTC_TIMEOUT_MS = 5000;

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

  const [state, setState] = useState<PlayerState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);

  // Two-way audio state
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSenderRef = useRef<RTCRtpSender | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Speaker/volume state
  const [speakerMuted, setSpeakerMuted] = useState(true);
  const [volume, setVolume] = useState(0.7);

  const cleanup = useCallback(() => {
    // Stop mic tracks
    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) {
        track.stop();
      }
      micStreamRef.current = null;
    }
    micSenderRef.current = null;
    setMicActive(false);
    setMicError(null);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const fallbackToHLS = useCallback(
    (info: StreamInfo) => {
      cleanup();
      if (info.fallbackHlsUrl) {
        setState("fallback");
      } else {
        setState("error");
        setErrorMessage("WebRTC failed and no HLS fallback available");
        onError?.("WebRTC failed and no HLS fallback available");
      }
    },
    [cleanup, onError],
  );

  const connectWebRTC = useCallback(
    async (info: StreamInfo) => {
      cleanup();
      setState("connecting");

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
        // Use sendrecv for audio when two-way audio is supported to enable mic
        pc.addTransceiver("audio", {
          direction: twoWayAudioSupported ? "sendrecv" : "recvonly",
        });

        pc.ontrack = (event) => {
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
            setState("live");
          }
        };

        pc.oniceconnectionstatechange = () => {
          const iceState = pc.iceConnectionState;
          if (iceState === "failed" || iceState === "disconnected") {
            fallbackToHLS(info);
          }
        };

        // Set timeout for WebRTC connection
        // Use pc.iceConnectionState instead of React state to avoid stale closure
        timeoutRef.current = setTimeout(() => {
          if (pc.iceConnectionState !== "connected" && pc.iceConnectionState !== "completed") {
            fallbackToHLS(info);
          }
        }, WEBRTC_TIMEOUT_MS);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (abort.signal.aborted) return;

        // Send SDP offer to go2rtc (direct connection, no proxy)
        // go2rtc accepts JSON: {type: "offer", sdp: "..."}
        const isDirectGo2rtc = info.whepUrl.includes("/api/webrtc");
        const whepHeaders: Record<string, string> = {
          "Content-Type": isDirectGo2rtc ? "application/json" : "application/sdp",
        };
        // Only send auth header if going through the gateway proxy
        if (!isDirectGo2rtc) {
          const authToken = localStorage.getItem("osp_access_token");
          if (authToken) {
            whepHeaders["Authorization"] = `Bearer ${authToken}`;
          }
        }

        const whepBody = isDirectGo2rtc
          ? JSON.stringify({ type: "offer", sdp: offer.sdp })
          : offer.sdp;

        const whepResponse = await fetch(info.whepUrl, {
          method: "POST",
          headers: whepHeaders,
          body: whepBody,
          signal: abort.signal,
        });

        if (!whepResponse.ok) {
          throw new Error(`WHEP server returned ${whepResponse.status}`);
        }

        const responseText = await whepResponse.text();
        // go2rtc returns JSON {type:"answer",sdp:"..."}, parse it
        let answerSdp: string;
        try {
          const parsed = JSON.parse(responseText);
          answerSdp = parsed.sdp ?? responseText;
        } catch {
          answerSdp = responseText;
        }
        await pc.setRemoteDescription({
          type: "answer",
          sdp: answerSdp,
        });
      } catch (err) {
        if (abort.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "WebRTC connection failed";
        console.error("[LiveViewPlayer] WebRTC error:", message);

        // Auto-retry once after 2s before falling back to HLS
        if (!retryRef.current) {
          retryRef.current = true;
          setState("connecting");
          setTimeout(() => {
            if (!abort.signal.aborted) {
              connectWebRTC(info);
            }
          }, 2000);
          return;
        }
        retryRef.current = false;
        fallbackToHLS(info);
      }
    },
    [cleanup, fallbackToHLS],
  );

  const fetchStreamAndConnect = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);

    try {
      const response = await fetch(
        `${API_URL}/api/v1/cameras/${cameraId}/stream`,
        { headers: getAuthHeaders() },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch stream info (${response.status})`);
      }

      const json = await response.json();
      const info: StreamInfo = json.data ?? json;
      setStreamInfo(info);
      await connectWebRTC(info);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load stream";
      setState("error");
      setErrorMessage(message);
      onError?.(message);
    }
  }, [cameraId, connectWebRTC, onError]);

  useEffect(() => {
    fetchStreamAndConnect();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId]);

  const handleReconnect = useCallback(() => {
    fetchStreamAndConnect();
  }, [fetchStreamAndConnect]);

  // Fallback: MJPEG snapshot refresh (simpler and more reliable than HLS)
  if (state === "fallback") {
    const go2rtcUrl = process.env["NEXT_PUBLIC_GO2RTC_URL"] ?? "http://localhost:1984";
    const mjpegUrl = `${go2rtcUrl}/api/stream.mp4?src=${encodeURIComponent(cameraId)}`;
    return (
      <div className={`relative ${className ?? ""}`}>
        <video
          src={mjpegUrl}
          autoPlay
          muted
          playsInline
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
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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
        </div>
      )}

      {/* Reconnect button */}
      {state === "live" && (
        <div className="absolute top-2 right-2">
          <button
            onClick={handleReconnect}
            className="p-1.5 rounded bg-black/50 text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
            title="Reconnect"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      )}

      {/* Loading state */}
      {(state === "loading" || state === "connecting") && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]" />
            <span className="text-xs text-[var(--color-muted)]">
              {state === "loading"
                ? "Loading stream info..."
                : "Connecting WebRTC..."}
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
