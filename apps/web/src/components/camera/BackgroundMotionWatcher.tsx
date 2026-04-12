"use client";

/**
 * BackgroundMotionWatcher — global per-camera motion detection + recording.
 *
 * Lives in the dashboard layout so it survives page navigation.
 * Completely local — no gateway, no WebSocket, no cloud.
 *
 * Detection: polls go2rtc /api/frame.jpeg every second, canvas frame-diff.
 * Recording: opens a direct WHEP WebRTC connection to go2rtc when motion
 *            is detected, records from the resulting MediaStream (no
 *            captureStream() needed — same path as LiveViewPlayer).
 * Saving:    Tauri save_recording invoke → DB row via gateway.
 */

import { useEffect, useRef } from "react";
import { isTauri } from "@/lib/tauri";
import { useStorageSettings } from "@/stores/storage-settings";
import type { Camera } from "@osp/shared";

const GO2RTC = "http://localhost:1984";
const POLL_MS = 1_000;
const SAMPLE_W = 160;
const SAMPLE_H = 90;
const PIXEL_DIFF_THRESHOLD = 15;
const MOTION_RATIO = 0.015;
const TAIL_MS = 8_500;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("osp_access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
function isoTag(iso: string) { return iso.replace(/[:.]/g, "-").slice(0, 19); }
function safe(name: string) { return name.replace(/[^a-zA-Z0-9-_]/g, "_"); }

// ─── WHEP helper ─────────────────────────────────────────────────────────────

async function openWhep(cameraId: string): Promise<{ pc: RTCPeerConnection; stream: MediaStream } | null> {
  const pc = new RTCPeerConnection();
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  try {
    const res = await fetch(`${GO2RTC}/api/webrtc?src=${encodeURIComponent(cameraId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "offer", sdp: offer.sdp }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) { pc.close(); return null; }

    const text = await res.text();
    let answerSdp: string;
    try { answerSdp = (JSON.parse(text) as { sdp?: string }).sdp ?? text; }
    catch { answerSdp = text; }

    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  } catch {
    pc.close();
    return null;
  }

  return new Promise((resolve) => {
    const stream = new MediaStream();
    const timeout = setTimeout(() => {
      resolve(stream.getVideoTracks().length > 0 ? { pc, stream } : null);
    }, 8_000);

    pc.ontrack = (e) => {
      stream.addTrack(e.track);
      if (stream.getVideoTracks().length > 0) {
        clearTimeout(timeout);
        resolve({ pc, stream });
      }
    };
  });
}

// ─── Per-camera watcher state ─────────────────────────────────────────────────

interface Watcher {
  cameraId: string;
  cameraName: string;
  // detection
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  prevPixels: Uint8ClampedArray | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  // recording
  pc: RTCPeerConnection | null;
  recorder: MediaRecorder | null;
  starting: boolean; // true while openWhep is in-flight — prevents concurrent starts
  chunks: Blob[];
  mimeType: string;
  startIso: string | null;
  tailTimer: ReturnType<typeof setTimeout> | null;
  // settings (kept as refs so saves see current values)
  recordingsPathRef: { current: string | null };
  saveModeRef: { current: string };
  _eventThrottle: number; // epoch ms of last posted event — throttle to 1 per 10s
  destroyed: boolean;
}

function pickMime(hasAudio: boolean): string {
  const c = hasAudio
    ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]
    : ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm"];
  return c.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
}

async function saveRecording(w: Watcher, blob: Blob, startIso: string) {
  if (blob.size === 0) return;
  const filename = `${safe(w.cameraName)}-${isoTag(startIso)}.webm`;

  const invoke = (window as unknown as {
    __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> };
  }).__TAURI_INTERNALS__?.invoke;

  let savedPath: string | null = null;
  if (invoke) {
    try {
      const ab = await blob.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let bin = "";
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      savedPath = (await invoke("save_recording", {
        filename,
        dataBase64: btoa(bin),
        customDir: w.recordingsPathRef.current || null,
      })) as string;
    } catch { /* ignore */ }
  }

  if (!savedPath || w.saveModeRef.current === "local_only") return;
  try {
    await fetch(`${API_URL}/api/v1/cameras/${w.cameraId}/record/local`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        startTime: startIso,
        endTime: new Date().toISOString(),
        localFilePath: savedPath,
        sizeBytes: blob.size,
        trigger: "motion",
      }),
    });
  } catch { /* non-critical */ }
}

function stopRecording(w: Watcher) {
  if (w.recorder && w.recorder.state !== "inactive") {
    try { w.recorder.stop(); } catch { /* ignore */ }
  }
  w.recorder = null;
  if (w.pc) { w.pc.close(); w.pc = null; }
}

async function startRecording(w: Watcher) {
  if (w.starting) return; // openWhep already in-flight — don't open a second connection
  if (w.recorder && w.recorder.state !== "inactive") return; // already recording

  w.starting = true;
  const result = await openWhep(w.cameraId);
  w.starting = false;

  // If the tail timer already fired while we were connecting (motion was brief
  // and WHEP was slow), abort — don't start a recording that will never stop.
  if (!result || w.destroyed || w.tailTimer === null) {
    result?.pc.close();
    return;
  }

  w.pc = result.pc;
  const { stream } = result;

  const videoTracks = stream.getVideoTracks().filter((t) => t.readyState === "live");
  if (videoTracks.length === 0) { result.pc.close(); w.pc = null; return; }

  const hasAudio = stream.getAudioTracks().some((t) => t.readyState === "live");
  const mimeType = pickMime(hasAudio);
  w.mimeType = mimeType;

  const recStream = new MediaStream();
  for (const t of videoTracks) recStream.addTrack(t);
  if (hasAudio) stream.getAudioTracks().filter((t) => t.readyState === "live").forEach((t) => recStream.addTrack(t));

  w.chunks = [];
  w.startIso = new Date().toISOString();

  const recorder = new MediaRecorder(recStream, {
    mimeType,
    videoBitsPerSecond: 1_500_000,
    ...(hasAudio ? { audioBitsPerSecond: 64_000 } : {}),
  });
  w.recorder = recorder;

  recorder.ondataavailable = (e) => { if (e.data.size > 0) w.chunks.push(e.data); };
  recorder.onstop = () => {
    if (w.destroyed) return;
    const blob = new Blob(w.chunks, { type: w.mimeType });
    const iso = w.startIso ?? new Date().toISOString();
    w.startIso = null;
    w.chunks = [];
    void saveRecording(w, blob, iso);
  };

  recorder.start(200);
}

function onMotion(w: Watcher) {
  if (!w.starting && (!w.recorder || w.recorder.state === "inactive")) {
    void startRecording(w);
  }
  if (w.tailTimer) clearTimeout(w.tailTimer);
  w.tailTimer = setTimeout(() => {
    w.tailTimer = null;
    stopRecording(w);
  }, TAIL_MS);

  // Post motion event to gateway so it appears in the sidebar and triggers
  // WS notifications. Fire-and-forget — recording is not blocked by this.
  if (!w._eventThrottle || Date.now() - w._eventThrottle > 10_000) {
    w._eventThrottle = Date.now();
    void fetch(`${API_URL}/api/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        cameraId: w.cameraId,
        type: "motion",
        severity: "medium",
        intensity: 60,
        metadata: { source: "local_frame_diff" },
      }),
    }).catch(() => { /* non-critical */ });
  }
}

async function sampleFrame(w: Watcher) {
  // Fetch a JPEG snapshot from go2rtc
  let imgBlob: Blob;
  try {
    const res = await fetch(
      `${GO2RTC}/api/frame.jpeg?src=${encodeURIComponent(w.cameraId)}`,
      { signal: AbortSignal.timeout(3_000) },
    );
    if (!res.ok) return;
    imgBlob = await res.blob();
  } catch { return; }

  // Draw onto canvas and diff vs previous frame
  const bitmap = await createImageBitmap(imgBlob).catch(() => null);
  if (!bitmap) return;

  w.ctx.drawImage(bitmap, 0, 0, SAMPLE_W, SAMPLE_H);
  bitmap.close();

  const { data } = w.ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);

  if (w.prevPixels) {
    let changed = 0;
    const total = SAMPLE_W * SAMPLE_H;
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      const prev = (w.prevPixels[i]! + w.prevPixels[i + 1]! + w.prevPixels[i + 2]!) / 3;
      if (Math.abs(lum - prev) > PIXEL_DIFF_THRESHOLD) changed++;
    }
    if (changed / total >= MOTION_RATIO) onMotion(w);
  }

  w.prevPixels = new Uint8ClampedArray(data);
}

function createWatcher(
  cam: Camera,
  recordingsPathRef: { current: string | null },
  saveModeRef: { current: string },
): Watcher | null {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const w: Watcher = {
    cameraId: cam.id,
    cameraName: cam.name,
    canvas,
    ctx,
    prevPixels: null,
    pollTimer: null,
    pc: null,
    recorder: null,
    starting: false,
    chunks: [],
    mimeType: "video/webm",
    startIso: null,
    tailTimer: null,
    recordingsPathRef,
    saveModeRef,
    _eventThrottle: 0,
    destroyed: false,
  };

  w.pollTimer = setInterval(() => { void sampleFrame(w); }, POLL_MS);
  return w;
}

function destroyWatcher(w: Watcher) {
  w.destroyed = true;
  if (w.pollTimer) { clearInterval(w.pollTimer); w.pollTimer = null; }
  if (w.tailTimer) { clearTimeout(w.tailTimer); w.tailTimer = null; }
  stopRecording(w);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BackgroundMotionWatcher({ cameras }: { readonly cameras: readonly Camera[] }) {
  const { saveMode, recordingsPath } = useStorageSettings();
  const watchersRef = useRef<Map<string, Watcher>>(new Map());
  const saveModeRef = useRef(saveMode);
  const recordingsPathRef = useRef(recordingsPath);
  saveModeRef.current = saveMode;
  recordingsPathRef.current = recordingsPath;

  useEffect(() => {
    if (!isTauri()) return;

    // Don't filter by status — in the desktop app the cloud health-checker
    // can't reach local go2rtc so cameras stay "connecting" indefinitely.
    // If a camera has no stream, sampleFrame() fails silently on every poll.
    const wanted = cameras.filter(
      (c) => c.config?.recordingMode === "motion",
    );
    const wantedIds = new Set(wanted.map((c) => c.id));
    const map = watchersRef.current;

    for (const [id, w] of map) {
      if (!wantedIds.has(id)) { destroyWatcher(w); map.delete(id); }
    }
    for (const cam of wanted) {
      if (!map.has(cam.id)) {
        const w = createWatcher(cam, recordingsPathRef, saveModeRef);
        if (w) map.set(cam.id, w);
      }
    }
  }, [cameras]);

  useEffect(() => {
    return () => {
      for (const w of watchersRef.current.values()) destroyWatcher(w);
      watchersRef.current.clear();
    };
  }, []);

  return null;
}
