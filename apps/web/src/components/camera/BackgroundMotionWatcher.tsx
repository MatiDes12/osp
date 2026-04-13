"use client";

/**
 * BackgroundMotionWatcher — global per-camera motion detection + recording.
 *
 * Lives in the dashboard layout so it survives page navigation.
 * Completely local — no gateway, no WebSocket, no cloud.
 *
 * Motion detection:  polls go2rtc /api/frame.jpeg every second, canvas frame-diff.
 * Motion recording:  WHEP WebRTC → MediaRecorder, saved on tail timeout.
 * Scheduled/global:  separate ContRec objects record all cameras continuously
 *                    while recordingEnabled=true; saved when recording stops.
 */

import { useEffect, useRef } from "react";
import { isTauri } from "@/lib/tauri";
import { useStorageSettings } from "@/stores/storage-settings";
import { useMonitoringStore } from "@/stores/monitoring";
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

function openWhep(cameraId: string): Promise<{ pc: RTCPeerConnection; stream: MediaStream } | null> {
  console.debug("[motion] openWhep: connecting to go2rtc for", cameraId);

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
  });
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  return new Promise((resolve) => {
    const stream = new MediaStream();
    let resolved = false;

    const done = (result: { pc: RTCPeerConnection; stream: MediaStream } | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const timeout = setTimeout(() => {
      const hasVideo = stream.getVideoTracks().length > 0;
      console.warn("[motion] openWhep: 8s timeout — ICE:", pc.iceConnectionState, hasVideo ? "has video, resolving" : "NO TRACKS");
      done(hasVideo ? { pc, stream } : null);
    }, 8_000);

    pc.ontrack = (e) => {
      stream.addTrack(e.track);
      console.debug("[motion] openWhep: track received:", e.track.kind, e.track.readyState);
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      console.debug("[motion] openWhep: ICE →", s);
      if (s === "connected" || s === "completed") {
        if (stream.getVideoTracks().length > 0) {
          done({ pc, stream });
        } else {
          setTimeout(() => {
            if (stream.getVideoTracks().length > 0) {
              done({ pc, stream });
            } else {
              console.warn("[motion] openWhep: ICE connected but still no video tracks");
              pc.close(); done(null);
            }
          }, 500);
        }
      } else if (s === "failed" || s === "disconnected") {
        console.warn("[motion] openWhep: ICE", s);
        pc.close(); done(null);
      }
    };

    void (async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const res = await fetch(`${GO2RTC}/api/webrtc?src=${encodeURIComponent(cameraId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "offer", sdp: offer.sdp }),
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) {
          console.warn("[motion] openWhep: go2rtc returned", res.status);
          pc.close(); done(null); return;
        }

        const text = await res.text();
        let answerSdp: string;
        try { answerSdp = (JSON.parse(text) as { sdp?: string }).sdp ?? text; }
        catch { answerSdp = text; }

        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
        console.debug("[motion] openWhep: remote description set, ICE:", pc.iceConnectionState);
      } catch (err) {
        console.warn("[motion] openWhep: signaling failed", err);
        pc.close(); done(null);
      }
    })();
  });
}

// ─── Shared save helper ───────────────────────────────────────────────────────

async function saveBlob(
  cameraId: string,
  cameraName: string,
  blob: Blob,
  startIso: string,
  trigger: "motion" | "scheduled",
  recordingsPathRef: { current: string | null },
  saveModeRef: { current: string },
) {
  if (blob.size === 0) {
    console.warn(`[motion] saveBlob: empty blob for ${cameraName}`);
    return;
  }
  console.debug(`[motion] saveBlob: ${cameraName} size=${blob.size} trigger=${trigger}`);
  const filename = `${safe(cameraName)}-${isoTag(startIso)}.webm`;

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
        customDir: recordingsPathRef.current || null,
      })) as string;
      console.debug(`[motion] saveBlob: saved to ${savedPath}`);
    } catch (err) {
      console.warn("[motion] saveBlob: Tauri invoke failed", err);
    }
  }

  if (!savedPath || saveModeRef.current === "local_only") return;
  try {
    await fetch(`${API_URL}/api/v1/cameras/${cameraId}/record/local`, {
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
  } catch { /* non-critical */ }
}

// ─── Motion-triggered watcher ─────────────────────────────────────────────────

interface Watcher {
  cameraId: string;
  cameraName: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  prevPixels: Uint8ClampedArray | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  pc: RTCPeerConnection | null;
  recorder: MediaRecorder | null;
  starting: boolean;
  chunks: Blob[];
  mimeType: string;
  startIso: string | null;
  tailTimer: ReturnType<typeof setTimeout> | null;
  recordingsPathRef: { current: string | null };
  saveModeRef: { current: string };
  recordingEnabledRef: { current: boolean };
  _eventThrottle: number;
  destroyed: boolean;
}

function pickMime(hasAudio: boolean): string {
  const c = hasAudio
    ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]
    : ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm"];
  return c.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
}

function stopRecording(w: Watcher) {
  console.debug("[motion] stopRecording:", w.cameraName, "| state:", w.recorder?.state ?? "null");
  if (w.recorder && w.recorder.state !== "inactive") {
    try { w.recorder.stop(); } catch { /* ignore */ }
  }
  w.recorder = null;
  if (w.pc) { w.pc.close(); w.pc = null; }
}

async function startRecording(w: Watcher) {
  if (w.starting) return;
  if (w.recorder && w.recorder.state !== "inactive") return;

  console.debug("[motion] startRecording: opening WHEP for", w.cameraName);
  w.starting = true;
  const result = await openWhep(w.cameraId);
  w.starting = false;

  if (!result || w.destroyed || w.tailTimer === null) {
    console.warn("[motion] startRecording: aborting —",
      !result ? "WHEP null" : w.destroyed ? "destroyed" : "tail timer fired");
    result?.pc.close();
    return;
  }

  w.pc = result.pc;
  const { stream } = result;

  const videoTracks = stream.getVideoTracks().filter((t) => t.readyState === "live");
  if (!videoTracks.length) {
    console.warn("[motion] startRecording: no live video tracks");
    result.pc.close(); w.pc = null; return;
  }

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
    // Always save — even if the watcher was destroyed during recording.
    const blob = new Blob(w.chunks, { type: w.mimeType });
    const iso = w.startIso ?? new Date().toISOString();
    w.startIso = null;
    w.chunks = [];
    void saveBlob(w.cameraId, w.cameraName, blob, iso, "motion", w.recordingsPathRef, w.saveModeRef);
  };

  console.debug("[motion] MediaRecorder starting, mime:", mimeType, "camera:", w.cameraName);
  recorder.start(200);
}

function onMotion(w: Watcher) {
  const globalRecordingOn = w.recordingEnabledRef.current;
  console.debug("[motion] detected on", w.cameraName,
    "| globalRec:", globalRecordingOn,
    "| recorder:", w.recorder?.state ?? "null",
    "| starting:", w.starting);

  if (!globalRecordingOn) {
    // Motion-triggered recording — only when global recording is OFF.
    if (!w.starting && (!w.recorder || w.recorder.state === "inactive")) {
      void startRecording(w);
    }
    if (w.tailTimer) clearTimeout(w.tailTimer);
    w.tailTimer = setTimeout(() => {
      w.tailTimer = null;
      stopRecording(w);
    }, TAIL_MS);
  }
  // When global recording is ON, continuous recorders (ContRec) handle saving.
  // Still post the motion event so the timeline shows the detection.

  if (!w._eventThrottle || Date.now() - w._eventThrottle > 10_000) {
    w._eventThrottle = Date.now();

    let snapshotDataUrl: string | null = null;
    try {
      snapshotDataUrl = w.canvas.toDataURL("image/jpeg", 0.7);
      if (snapshotDataUrl === "data:,") snapshotDataUrl = null;
    } catch { /* ignore */ }

    void fetch(`${API_URL}/api/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        cameraId: w.cameraId,
        type: "motion",
        severity: "medium",
        intensity: 60,
        metadata: { source: "local_frame_diff" },
        ...(snapshotDataUrl ? { snapshotUrl: snapshotDataUrl } : {}),
      }),
    }).catch(() => { /* non-critical */ });
  }
}

async function sampleFrame(w: Watcher) {
  let imgBlob: Blob;
  try {
    const res = await fetch(
      `${GO2RTC}/api/frame.jpeg?src=${encodeURIComponent(w.cameraId)}`,
      { signal: AbortSignal.timeout(3_000) },
    );
    if (!res.ok) return;
    imgBlob = await res.blob();
  } catch { return; }

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
  recordingEnabledRef: { current: boolean },
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
    recordingEnabledRef,
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

// ─── Continuous recording (scheduled / global recording ON) ───────────────────

interface ContRec {
  cameraId: string;
  cameraName: string;
  pc: RTCPeerConnection | null;
  recorder: MediaRecorder | null;
  starting: boolean;
  chunks: Blob[];
  mimeType: string;
  startIso: string | null;
  recordingsPathRef: { current: string | null };
  saveModeRef: { current: string };
}

async function startContRec(cr: ContRec): Promise<void> {
  if (cr.starting) return;
  if (cr.recorder && cr.recorder.state !== "inactive") return;

  console.debug("[contRec] starting WHEP for", cr.cameraName);
  cr.starting = true;
  const result = await openWhep(cr.cameraId);
  cr.starting = false;

  if (!result) {
    console.warn("[contRec] WHEP returned null for", cr.cameraName);
    return;
  }

  cr.pc = result.pc;
  const { stream } = result;

  const videoTracks = stream.getVideoTracks().filter((t) => t.readyState === "live");
  if (!videoTracks.length) {
    console.warn("[contRec] no live video tracks for", cr.cameraName);
    result.pc.close(); cr.pc = null; return;
  }

  const hasAudio = stream.getAudioTracks().some((t) => t.readyState === "live");
  const mimeType = pickMime(hasAudio);
  cr.mimeType = mimeType;

  const recStream = new MediaStream();
  for (const t of videoTracks) recStream.addTrack(t);
  if (hasAudio) stream.getAudioTracks().filter((t) => t.readyState === "live").forEach((t) => recStream.addTrack(t));

  cr.chunks = [];
  cr.startIso = new Date().toISOString();

  const recorder = new MediaRecorder(recStream, {
    mimeType,
    videoBitsPerSecond: 1_500_000,
    ...(hasAudio ? { audioBitsPerSecond: 64_000 } : {}),
  });
  cr.recorder = recorder;

  recorder.ondataavailable = (e) => { if (e.data.size > 0) cr.chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(cr.chunks, { type: cr.mimeType });
    const iso = cr.startIso ?? new Date().toISOString();
    cr.startIso = null;
    cr.chunks = [];
    void saveBlob(cr.cameraId, cr.cameraName, blob, iso, "scheduled", cr.recordingsPathRef, cr.saveModeRef);
  };

  console.debug("[contRec] MediaRecorder starting for", cr.cameraName, "mime:", mimeType);
  recorder.start(200);
}

function stopContRec(cr: ContRec) {
  console.debug("[contRec] stopping", cr.cameraName, "| state:", cr.recorder?.state ?? "null");
  if (cr.recorder && cr.recorder.state !== "inactive") {
    try { cr.recorder.stop(); } catch { /* ignore */ }
  }
  cr.recorder = null;
  if (cr.pc) { cr.pc.close(); cr.pc = null; }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BackgroundMotionWatcher({ cameras }: { readonly cameras: readonly Camera[] }) {
  const { saveMode, recordingsPath } = useStorageSettings();
  const { recordingEnabled } = useMonitoringStore();

  const watchersRef = useRef<Map<string, Watcher>>(new Map());
  const contRecsRef = useRef<Map<string, ContRec>>(new Map());

  const saveModeRef = useRef(saveMode);
  const recordingsPathRef = useRef(recordingsPath);
  const recordingEnabledRef = useRef(recordingEnabled);

  saveModeRef.current = saveMode;
  recordingsPathRef.current = recordingsPath;
  recordingEnabledRef.current = recordingEnabled;

  // ── Motion-detection watchers (recordingMode === "motion" cameras) ──────────
  useEffect(() => {
    if (!isTauri()) return;

    const wanted = cameras.filter((c) => c.config?.recordingMode === "motion");
    const wantedIds = new Set(wanted.map((c) => c.id));
    const map = watchersRef.current;

    for (const [id, w] of map) {
      if (!wantedIds.has(id)) { destroyWatcher(w); map.delete(id); }
    }
    for (const cam of wanted) {
      if (!map.has(cam.id)) {
        const w = createWatcher(cam, recordingsPathRef, saveModeRef, recordingEnabledRef);
        if (w) map.set(cam.id, w);
      }
    }
  }, [cameras]);

  // ── Continuous recorders (all cameras when global recording is ON) ──────────
  useEffect(() => {
    if (!isTauri()) return;

    const cmap = contRecsRef.current;

    if (recordingEnabled) {
      const wantedIds = new Set(cameras.map((c) => c.id));

      // Remove stale
      for (const [id, cr] of cmap) {
        if (!wantedIds.has(id)) { stopContRec(cr); cmap.delete(id); }
      }

      // Add new
      for (const cam of cameras) {
        if (!cmap.has(cam.id)) {
          const cr: ContRec = {
            cameraId: cam.id,
            cameraName: cam.name,
            pc: null,
            recorder: null,
            starting: false,
            chunks: [],
            mimeType: "video/webm",
            startIso: null,
            recordingsPathRef,
            saveModeRef,
          };
          cmap.set(cam.id, cr);
          void startContRec(cr);
        }
      }
    } else {
      // Recording turned off — stop all continuous recordings (onstop will save)
      for (const cr of cmap.values()) stopContRec(cr);
      cmap.clear();
    }
  }, [recordingEnabled, cameras]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      for (const w of watchersRef.current.values()) destroyWatcher(w);
      watchersRef.current.clear();
      // Stop continuous recorders — onstop handlers will fire and save
      for (const cr of contRecsRef.current.values()) stopContRec(cr);
      contRecsRef.current.clear();
    };
  }, []);

  return null;
}
