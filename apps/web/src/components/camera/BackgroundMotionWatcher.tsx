"use client";

/**
 * BackgroundMotionWatcher — global per-camera motion detection + recording.
 *
 * Runs in the dashboard layout so it stays alive regardless of which page the
 * user is on.  Completely local: polls go2rtc snapshots for detection, records
 * via MediaRecorder → Tauri save_recording.  No gateway, no WebSocket needed.
 *
 * One watcher per camera that has recordingMode === "motion" and is online.
 * Each watcher:
 *   1. Keeps a hidden <video> element streaming go2rtc's HTTP fMP4 feed.
 *   2. Samples frames at 2 fps onto a tiny canvas and diffs vs previous frame.
 *   3. On motion: starts MediaRecorder on video.captureStream().
 *   4. 5-second tail timer — every new motion event resets the timer.
 *   5. On tail expiry: stops recorder, saves file via Tauri.
 */

import { useEffect, useRef } from "react";
import { isTauri } from "@/lib/tauri";
import { useStorageSettings } from "@/stores/storage-settings";
import type { Camera } from "@osp/shared";

const GO2RTC = "http://localhost:1984";

// Detection constants
const SAMPLE_W = 160;
const SAMPLE_H = 90;
const POLL_MS = 500;
const PIXEL_DIFF_THRESHOLD = 15;   // 0–255 luma change counts as changed
const MOTION_RATIO = 0.015;         // 1.5% pixels changed → motion

// Recording constants
const TAIL_MS = 5_000;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("osp_access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isoToFileTag(iso: string) {
  return iso.replace(/[:.]/g, "-").slice(0, 19);
}
function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9-_]/g, "_");
}

interface Watcher {
  cameraId: string;
  cameraName: string;
  videoEl: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  prevPixels: Uint8ClampedArray | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  tailTimer: ReturnType<typeof setTimeout> | null;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  startIso: string | null;
  mimeType: string;
  recordingsPath: string | null;
  saveMode: string;
  destroyed: boolean;
}

function pickMimeType(hasAudio: boolean): string {
  const candidates = hasAudio
    ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]
    : ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
}

async function saveRecording(
  w: Watcher,
  blob: Blob,
  startIso: string,
  trigger: "motion",
) {
  if (blob.size === 0) return;

  const ts = isoToFileTag(startIso);
  const filename = `${sanitize(w.cameraName)}-${ts}.webm`;

  const invoke = (
    window as unknown as {
      __TAURI_INTERNALS__?: {
        invoke: (cmd: string, args?: unknown) => Promise<unknown>;
      };
    }
  ).__TAURI_INTERNALS__?.invoke;

  let savedPath: string | null = null;
  if (invoke) {
    try {
      const ab = await blob.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let bin = "";
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      const base64 = btoa(bin);
      savedPath = (await invoke("save_recording", {
        filename,
        dataBase64: base64,
        customDir: w.recordingsPath || null,
      })) as string;
    } catch {
      /* ignore save error */
    }
  }

  if (!savedPath || w.saveMode === "local_only") return;

  try {
    await fetch(`${API_URL}/api/v1/cameras/${w.cameraId}/record/local`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        startTime: startIso,
        endTime: new Date().toISOString(),
        localFilePath: savedPath,
        sizeBytes: blob.size,
        trigger,
      }),
    });
  } catch {
    /* non-critical */
  }
}

function startRecording(w: Watcher) {
  if (w.recorder && w.recorder.state !== "inactive") return;
  const video = w.videoEl;
  if (!video || video.readyState < 2) return;

  // Get stream: prefer srcObject (WebRTC), fall back to captureStream
  const stream =
    (video.srcObject as MediaStream | null) ??
    (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
  if (!stream) return;

  const videoTracks = stream.getVideoTracks().filter((t) => t.readyState === "live");
  if (videoTracks.length === 0) return;

  const hasAudio = stream.getAudioTracks().some((t) => t.readyState === "live");
  const mimeType = pickMimeType(hasAudio);
  w.mimeType = mimeType;

  const recStream = new MediaStream();
  for (const t of videoTracks) recStream.addTrack(t);
  if (hasAudio) {
    for (const t of stream.getAudioTracks()) {
      if (t.readyState === "live") recStream.addTrack(t);
    }
  }

  w.chunks = [];
  w.startIso = new Date().toISOString();

  const recorder = new MediaRecorder(recStream, {
    mimeType,
    videoBitsPerSecond: 1_500_000,
    ...(hasAudio ? { audioBitsPerSecond: 64_000 } : {}),
  });
  w.recorder = recorder;

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) w.chunks.push(e.data);
  };

  recorder.onstop = () => {
    if (w.destroyed) return;
    const blob = new Blob(w.chunks, { type: w.mimeType });
    const iso = w.startIso ?? new Date().toISOString();
    w.startIso = null;
    w.chunks = [];
    void saveRecording(w, blob, iso, "motion");
  };

  // 200ms timeslice: forces timestamp checkpoints every 200ms so the WebM
  // container has correct seek metadata.  Small enough to avoid the per-cluster
  // timestamp drift seen with 2000ms chunks.
  recorder.start(200);
}

function stopRecording(w: Watcher) {
  if (!w.recorder || w.recorder.state === "inactive") return;
  try {
    w.recorder.stop();
  } catch {
    /* ignore */
  }
  w.recorder = null;
}

function onMotionDetected(w: Watcher) {
  // Start recording if not already
  if (!w.recorder || w.recorder.state === "inactive") {
    startRecording(w);
  }

  // Reset / set tail timer
  if (w.tailTimer) clearTimeout(w.tailTimer);
  w.tailTimer = setTimeout(() => {
    w.tailTimer = null;
    stopRecording(w);
  }, TAIL_MS);
}

function sampleFrame(w: Watcher) {
  const video = w.videoEl;
  if (!video || video.readyState < 2 || video.paused) return;

  w.ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
  const { data } = w.ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);

  if (w.prevPixels) {
    let changed = 0;
    const total = SAMPLE_W * SAMPLE_H;
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      const prev = (w.prevPixels[i]! + w.prevPixels[i + 1]! + w.prevPixels[i + 2]!) / 3;
      if (Math.abs(lum - prev) > PIXEL_DIFF_THRESHOLD) changed++;
    }
    if (changed / total >= MOTION_RATIO) {
      onMotionDetected(w);
    }
  }

  w.prevPixels = new Uint8ClampedArray(data);
}

function createWatcher(
  cameraId: string,
  cameraName: string,
  recordingsPath: string | null,
  saveMode: string,
): Watcher | null {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const video = document.createElement("video");
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:-9999px;left:-9999px";
  document.body.appendChild(video);

  const w: Watcher = {
    cameraId,
    cameraName,
    videoEl: video,
    canvas,
    ctx,
    prevPixels: null,
    pollTimer: null,
    tailTimer: null,
    recorder: null,
    chunks: [],
    startIso: null,
    mimeType: "video/webm",
    recordingsPath,
    saveMode,
    destroyed: false,
  };

  // Connect to go2rtc's HTTP fMP4 stream — simplest connection possible,
  // no auth or gateway needed since go2rtc runs locally.
  video.src = `${GO2RTC}/api/stream.mp4?src=${encodeURIComponent(cameraId)}`;

  video.addEventListener("canplay", () => {
    void video.play().catch(() => {});
    if (!w.pollTimer) {
      w.pollTimer = setInterval(() => sampleFrame(w), POLL_MS);
    }
  });

  // Reconnect on error (go2rtc might not have stream yet)
  video.addEventListener("error", () => {
    if (w.destroyed) return;
    setTimeout(() => {
      if (!w.destroyed) {
        video.src = `${GO2RTC}/api/stream.mp4?src=${encodeURIComponent(cameraId)}`;
        video.load();
      }
    }, 5_000);
  });

  return w;
}

function destroyWatcher(w: Watcher) {
  w.destroyed = true;
  if (w.pollTimer) { clearInterval(w.pollTimer); w.pollTimer = null; }
  if (w.tailTimer) { clearTimeout(w.tailTimer); w.tailTimer = null; }
  stopRecording(w);
  try { w.videoEl.src = ""; w.videoEl.load(); } catch { /* ignore */ }
  w.videoEl.remove();
}

// ─────────────────────────────────────────────────────────────────────────────

export function BackgroundMotionWatcher({
  cameras,
}: {
  readonly cameras: readonly Camera[];
}) {
  const { saveMode, recordingsPath } = useStorageSettings();
  const watchersRef = useRef<Map<string, Watcher>>(new Map());
  const saveModeRef = useRef(saveMode);
  const recordingsPathRef = useRef(recordingsPath);
  saveModeRef.current = saveMode;
  recordingsPathRef.current = recordingsPath;

  useEffect(() => {
    if (!isTauri()) return;

    const targetCameras = cameras.filter(
      (c) => c.config?.recordingMode === "motion" && c.status === "online",
    );
    const targetIds = new Set(targetCameras.map((c) => c.id));
    const existing = watchersRef.current;

    // Remove watchers for cameras no longer needing them
    for (const [id, w] of existing) {
      if (!targetIds.has(id)) {
        destroyWatcher(w);
        existing.delete(id);
      }
    }

    // Add watchers for new cameras
    for (const cam of targetCameras) {
      if (!existing.has(cam.id)) {
        const w = createWatcher(cam.id, cam.name, recordingsPathRef.current, saveModeRef.current);
        if (w) existing.set(cam.id, w);
      }
    }
  }, [cameras]);

  // Clean up all watchers on unmount
  useEffect(() => {
    return () => {
      for (const w of watchersRef.current.values()) {
        destroyWatcher(w);
      }
      watchersRef.current.clear();
    };
  }, []);

  return null; // renders nothing
}
