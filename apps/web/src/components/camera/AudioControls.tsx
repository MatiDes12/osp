"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";

interface AudioControlsProps {
  /** The RTCPeerConnection to add mic audio track to */
  readonly peerConnection: RTCPeerConnection | null;
  /** The video element to control speaker volume on */
  readonly videoElement: HTMLVideoElement | null;
  /** Whether the camera supports backchannel audio */
  readonly twoWayAudioSupported?: boolean;
  readonly className?: string;
}

export function AudioControls({
  peerConnection,
  videoElement,
  twoWayAudioSupported = false,
  className,
}: AudioControlsProps) {
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(0.7);

  const micStreamRef = useRef<MediaStream | null>(null);
  const micSenderRef = useRef<RTCRtpSender | null>(null);

  // Cleanup mic stream on unmount
  useEffect(() => {
    return () => {
      if (micStreamRef.current) {
        for (const track of micStreamRef.current.getTracks()) {
          track.stop();
        }
        micStreamRef.current = null;
      }
    };
  }, []);

  // Sync volume/muted state to video element
  useEffect(() => {
    if (!videoElement) return;
    videoElement.volume = volume;
    videoElement.muted = muted;
  }, [videoElement, volume, muted]);

  const toggleMic = useCallback(async () => {
    if (!peerConnection) return;

    if (micActive) {
      // Stop mic
      if (micStreamRef.current) {
        for (const track of micStreamRef.current.getTracks()) {
          track.stop();
        }
        micStreamRef.current = null;
      }
      if (micSenderRef.current) {
        try {
          peerConnection.removeTrack(micSenderRef.current);
        } catch {
          // Peer connection may already be closed
        }
        micSenderRef.current = null;
      }
      setMicActive(false);
      setMicError(null);
      return;
    }

    // Start mic
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error("No audio track available");
      }

      const sender = peerConnection.addTrack(audioTrack, stream);
      micSenderRef.current = sender;
      setMicActive(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Microphone access denied";
      setMicError(message);
      // Cleanup on error
      if (micStreamRef.current) {
        for (const track of micStreamRef.current.getTracks()) {
          track.stop();
        }
        micStreamRef.current = null;
      }
    }
  }, [peerConnection, micActive]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value);
      setVolume(newVolume);
      if (newVolume > 0 && muted) {
        setMuted(false);
      }
    },
    [muted],
  );

  return (
    <div
      className={`flex items-center gap-2 ${className ?? ""}`}
    >
      {/* Mic toggle (two-way audio) */}
      {twoWayAudioSupported && (
        <div className="relative">
          <button
            onClick={toggleMic}
            className={`p-2 rounded-md transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
              micActive
                ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                : "text-zinc-300 hover:text-white hover:bg-white/10"
            }`}
            aria-label={micActive ? "Mute microphone" : "Unmute microphone"}
            title={micActive ? "Turn off microphone" : "Turn on microphone"}
          >
            {micActive ? (
              <Mic className="w-4 h-4 animate-pulse" />
            ) : (
              <MicOff className="w-4 h-4" />
            )}
          </button>
          {micActive && (
            <span className="absolute -top-1 -right-1 px-1 py-0.5 text-[8px] font-bold uppercase rounded bg-blue-500 text-white leading-none">
              AUDIO
            </span>
          )}
          {micError && (
            <div className="absolute top-full left-0 mt-1 w-48 p-2 rounded-md bg-red-500/20 border border-red-500/30 text-[10px] text-red-300 z-50">
              {micError}
            </div>
          )}
        </div>
      )}

      {/* Speaker volume controls */}
      <button
        onClick={toggleMute}
        className={`p-2 rounded-md transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
          !muted
            ? "text-zinc-100"
            : "text-zinc-400 hover:text-white hover:bg-white/10"
        }`}
        aria-label={muted ? "Unmute speaker" : "Mute speaker"}
        title={muted ? "Unmute" : "Mute"}
      >
        {muted ? (
          <VolumeX className="w-4 h-4" />
        ) : (
          <Volume2 className="w-4 h-4" />
        )}
      </button>

      {/* Volume slider */}
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={muted ? 0 : volume}
        onChange={handleVolumeChange}
        className="w-16 h-1 rounded-full appearance-none bg-zinc-600 accent-blue-500 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
        aria-label="Volume"
        title={`Volume: ${Math.round((muted ? 0 : volume) * 100)}%`}
      />
    </div>
  );
}
