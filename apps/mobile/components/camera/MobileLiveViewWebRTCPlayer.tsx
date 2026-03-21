import { useEffect, useRef, useState } from "react";
import { StyleSheet, View, Text, Image, ActivityIndicator } from "react-native";
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
  type MediaStream,
} from "react-native-webrtc";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { colors } from "@/constants/theme";

const GO2RTC_BASE_URL =
  process.env.EXPO_PUBLIC_GO2RTC_URL ?? "http://localhost:1984";

const WEBRTC_TIMEOUT_MS = 12_000;
const MJPEG_REFRESH_MS = 800;

type IceServer = {
  urls: string[];
  username?: string;
  credential?: string;
};

type StreamInfo = {
  whepUrl: string;
  token: string;
  fallbackHlsUrl: string;
  iceServers: readonly IceServer[];
};

export function MobileLiveViewWebRTCPlayer({
  cameraId,
  status,
}: {
  readonly cameraId: string;
  readonly status: string;
}) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [mode, setMode] = useState<"webrtc" | "mjpeg" | "error">("webrtc");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mjpegTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status !== "online") {
      setMode("webrtc");
      setRemoteStream(null);
      setErrorMessage(null);
      if (mjpegTimerRef.current) {
        clearInterval(mjpegTimerRef.current);
        mjpegTimerRef.current = null;
      }
    }
  }, [status]);

  useEffect(() => {
    if (mode !== "mjpeg") return;

    if (mjpegTimerRef.current) return;
    mjpegTimerRef.current = setInterval(() => {
      setFrameKey((prev) => prev + 1);
    }, MJPEG_REFRESH_MS);

    return () => {
      if (mjpegTimerRef.current) {
        clearInterval(mjpegTimerRef.current);
        mjpegTimerRef.current = null;
      }
    };
  }, [mode]);

  useEffect(() => {
    let cancelled = false;

    async function connect(): Promise<void> {
      setMode("webrtc");
      setRemoteStream(null);
      setErrorMessage(null);

      try {
        const accessToken = await getAccessToken();
        const streamRes = await api.get<StreamInfo>(
          `/api/v1/cameras/${cameraId}/stream`,
        );

        if (!streamRes.success || !streamRes.data) {
          throw new Error(
            streamRes.error?.message ?? "Failed to load stream info",
          );
        }

        const info = streamRes.data;
        const pc = new RTCPeerConnection({
          iceServers: [...info.iceServers],
        });
        pcRef.current = pc;

        pc.ontrack = (event) => {
          const stream = event.streams?.[0] ?? null;
          if (!cancelled && stream) {
            setRemoteStream(stream);
            setMode("webrtc");
          }
        };

        pc.oniceconnectionstatechange = () => {
          if (cancelled) return;
          const state = pc.iceConnectionState;
          if (state === "failed" || state === "disconnected") {
            try {
              pc.close();
            } catch {
              // ignore close errors
            }
            pcRef.current = null;
            setMode("mjpeg");
          }
        };

        timeoutRef.current = setTimeout(() => {
          if (cancelled) return;
          try {
            pc.close();
          } catch {
            // ignore close errors
          }
          pcRef.current = null;
          setMode("mjpeg");
        }, WEBRTC_TIMEOUT_MS);

        // Add recvonly transceivers for video and audio.
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const isDirectGo2rtc = info.whepUrl.includes("/api/webrtc");
        const headers: Record<string, string> = {};
        if (isDirectGo2rtc) {
          headers["Content-Type"] = "application/json";
        } else {
          headers["Content-Type"] = "application/sdp";
          if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
        }

        const whepBody = isDirectGo2rtc
          ? JSON.stringify({ type: "offer", sdp: offer.sdp })
          : offer.sdp;

        const response = await fetch(info.whepUrl, {
          method: "POST",
          headers,
          body: whepBody,
        });

        if (!response.ok) {
          throw new Error(`WHEP server returned ${response.status}`);
        }

        const responseText = await response.text();

        let answerSdp: string;
        try {
          const parsed = JSON.parse(responseText) as { sdp?: string };
          answerSdp = parsed.sdp ?? responseText;
        } catch {
          answerSdp = responseText;
        }

        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: "answer", sdp: answerSdp }),
        );
      } catch (err) {
        if (cancelled) return;
        try {
          pcRef.current?.close();
        } catch {
          // ignore close errors
        }
        pcRef.current = null;
        setMode("mjpeg");
        setErrorMessage(
          err instanceof Error ? err.message : "WebRTC connection failed",
        );
      }
    }

    if (status === "online") {
      void connect();
    }

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {
          // ignore
        }
        pcRef.current = null;
      }
    };
  }, [cameraId, status]);

  if (mode === "error") {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{errorMessage ?? "Stream error"}</Text>
      </View>
    );
  }

  if (mode === "mjpeg") {
    const mjpegUri = `${GO2RTC_BASE_URL}/api/frame.jpeg?src=${encodeURIComponent(cameraId)}&t=${frameKey}`;
    return (
      <View style={styles.container}>
        <Image
          source={{ uri: mjpegUri }}
          style={styles.mjpeg}
          resizeMode="contain"
        />
      </View>
    );
  }

  if (!remoteStream) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <RTCView streamURL={remoteStream.toURL()} style={styles.rtc} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  rtc: {
    flex: 1,
  },
  mjpeg: {
    width: "100%",
    height: "100%",
  },
  errorText: {
    color: colors.error,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 12,
  },
});
