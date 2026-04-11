/**
 * useCameraCapture — single source of truth for ALL camera capture flows.
 *
 * Why this hook exists:
 *   Before this hook, recording + snapshot logic was duplicated in 5+ places:
 *   the camera detail page had ~200 lines of inline MediaRecorder code, and
 *   every component that wanted to show a live thumbnail (CameraCard,
 *   LiveViewPlayer, FloorPlanEditor, FloorPlan3DView) re-implemented the
 *   same snapshot fetch + blob URL lifecycle. The drift between copies is
 *   why two components would sometimes show different snapshots, and why a
 *   regression in MediaRecorder could only be fixed in one page.
 *
 * What this hook owns:
 *   - All MediaRecorder setup (codec negotiation, bitrate cap, track trim)
 *   - Tauri vs web branching (native save vs server REST)
 *   - Snapshot fetching (local go2rtc fallback, auth, blob URL lifecycle)
 *   - Start/stop state + duration timer
 *   - 0-byte blob guard + user-facing error toast
 *
 * Callers just do:
 *     const capture = useCameraCapture({ cameraId, cameraName, videoContainerRef });
 *     capture.toggleRecording("manual")
 *     capture.takeSnapshot()
 *
 * If you need to change recording behavior, change it HERE. Do not add new
 * MediaRecorder or /snapshot fetch code elsewhere.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { isTauri } from "@/lib/tauri";
import { showToast } from "@/stores/toast";
import { useStorageSettings } from "@/stores/storage-settings";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("osp_access_token")
      : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/** ISO timestamp → filesystem-safe tag, e.g. "2026-04-11T15-04-02". */
function isoToFileTag(iso: string): string {
  return iso.replace(/[:.]/g, "-").slice(0, 19);
}

/** Replace unsafe filename chars with underscores. */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, "_");
}

export type RecordingTrigger = "manual" | "motion";

// ---------------------------------------------------------------------------
// Snapshot fetcher — used by both the hook internally and by the
// shared useCameraSnapshot() for background thumbnails.
// ---------------------------------------------------------------------------

/**
 * Fetch a single snapshot frame for a camera.
 * Honors Tauri (direct go2rtc) vs web (authed gateway) automatically.
 * Returns a Blob URL (caller must revoke) or null on failure.
 */
export async function fetchCameraSnapshot(
  cameraId: string,
): Promise<string | null> {
  try {
    const local = `http://localhost:1984/api/frame.jpeg?src=${encodeURIComponent(cameraId)}`;
    const cloud = `${API_URL}/api/v1/cameras/${cameraId}/snapshot`;

    const isDesktop = isTauri();
    const canReachLocal =
      !isDesktop &&
      typeof window !== "undefined" &&
      window.location.protocol !== "https:";

    let res: Response | null = await fetch(
      isDesktop ? local : cloud,
      {
        headers: isDesktop ? {} : getAuthHeaders(),
        signal: AbortSignal.timeout(4000),
      },
    ).catch(() => null);

    // HTTP fallback: try direct go2rtc if gateway fails and we're on HTTP
    if ((!res || !res.ok) && canReachLocal) {
      res = await fetch(local, { signal: AbortSignal.timeout(4000) }).catch(
        () => null,
      );
    }

    if (!res?.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * React hook: auto-refreshing snapshot thumbnail (every `refreshMs` ms).
 * Handles blob URL lifecycle — revokes the previous URL after React paints
 * the new one so thumbnails never flash to black.
 *
 * Use this instead of rolling your own useEffect + fetch + URL.createObjectURL.
 */
export function useCameraSnapshot(
  cameraId: string | undefined,
  enabled: boolean,
  refreshMs = 10_000,
): string | null {
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const prevUrlRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !cameraId) return;

    let cancelled = false;

    const tick = async () => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      try {
        const nextUrl = await fetchCameraSnapshot(cameraId);
        if (!nextUrl) return;

        // Preload / decode before swapping so there's no blank flash.
        const img = new Image();
        img.src = nextUrl;
        try {
          await img.decode();
        } catch {
          // Some browsers can't decode all formats — fall through
        }

        if (cancelled) {
          URL.revokeObjectURL(nextUrl);
          return;
        }

        const oldUrl = prevUrlRef.current;
        prevUrlRef.current = nextUrl;
        setSnapshotUrl(nextUrl);

        if (oldUrl) {
          requestAnimationFrame(() => {
            setTimeout(() => URL.revokeObjectURL(oldUrl), 100);
          });
        }
      } finally {
        fetchingRef.current = false;
      }
    };

    void tick();
    const interval = setInterval(() => void tick(), refreshMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
      fetchingRef.current = false;
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
    };
  }, [cameraId, enabled, refreshMs]);

  return snapshotUrl;
}

// ---------------------------------------------------------------------------
// Recording — the big one
// ---------------------------------------------------------------------------

interface UseCameraCaptureOptions {
  readonly cameraId: string;
  readonly cameraName?: string;
  /** Ref to the element that contains the <video> tag we're recording from. */
  readonly videoContainerRef: RefObject<HTMLElement | null>;
}

interface CameraCaptureApi {
  readonly isRecording: boolean;
  readonly recordingDuration: number;
  readonly toggleRecording: (trigger?: RecordingTrigger) => Promise<void>;
  readonly startRecording: (trigger?: RecordingTrigger) => Promise<void>;
  readonly stopRecording: () => void;
  /** Saves a PNG screenshot of the currently-playing video to the user's machine. */
  readonly takeScreenshot: () => void;
}

/**
 * Master recording hook. Handles both desktop (MediaRecorder + native save)
 * and cloud (server REST) paths internally.
 */
export function useCameraCapture(
  opts: UseCameraCaptureOptions,
): CameraCaptureApi {
  const { cameraId, cameraName, videoContainerRef } = opts;
  const { saveMode, recordingsPath } = useStorageSettings();

  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(
    null,
  );
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // MediaRecorder-related refs (Tauri path only)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startIsoRef = useRef<string | null>(null);
  const triggerRef = useRef<RecordingTrigger>("manual");

  // Check active recording on mount + clean up Tauri orphans.
  useEffect(() => {
    if (!cameraId) return;
    fetch(`${API_URL}/api/v1/cameras/${cameraId}/record/status`, {
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.isRecording && json.data.recording) {
          if (isTauri()) {
            // Orphan from a previous Tauri session — stop silently
            fetch(`${API_URL}/api/v1/cameras/${cameraId}/record/stop`, {
              method: "POST",
              headers: getAuthHeaders(),
            }).catch(() => {});
          } else {
            setIsRecording(true);
            setRecordingStartTime(
              new Date(json.data.recording.start_time).getTime(),
            );
          }
        }
      })
      .catch(() => {});
  }, [cameraId]);

  // Duration ticker
  useEffect(() => {
    if (isRecording && recordingStartTime) {
      const tick = () =>
        setRecordingDuration(
          Math.floor((Date.now() - recordingStartTime) / 1000),
        );
      tick();
      recordingTimerRef.current = setInterval(tick, 1000);
      return () => {
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      };
    }
    setRecordingDuration(0);
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecording, recordingStartTime]);

  // ------- Desktop (Tauri) MediaRecorder path -------

  const startDesktopRecording = useCallback(
    (trigger: RecordingTrigger) => {
      if (!cameraId) return;
      // Already recording — no-op
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        return;
      }

      const video = videoContainerRef.current?.querySelector("video");
      if (!video) return;

      const stream =
        (video.srcObject as MediaStream | null) ??
        (
          video as HTMLVideoElement & { captureStream?: () => MediaStream }
        ).captureStream?.();
      if (!stream) return;

      // Require a live video track, otherwise MediaRecorder produces 0-byte
      // output silently. Happens while the live view is reconnecting.
      const liveVideoTracks = stream
        .getVideoTracks()
        .filter((t) => t.readyState === "live" && t.enabled);
      if (liveVideoTracks.length === 0) {
        if (trigger === "manual") {
          showToast(
            "Live feed not ready — wait a moment and try again",
            "error",
          );
        }
        return;
      }

      const startIso = new Date().toISOString();
      const ts = isoToFileTag(startIso);
      const safeName = sanitizeFilename(cameraName ?? cameraId);

      // Trim the stream down to the tracks we actually need. Passing the
      // full WebRTC stream forces MediaRecorder to spin up encoders for
      // every track even when we don't care about them → CPU hit.
      const hasAudio = stream
        .getAudioTracks()
        .some((t) => t.readyState === "live");
      const recordingStream = new MediaStream();
      for (const t of liveVideoTracks) recordingStream.addTrack(t);
      if (hasAudio) {
        for (const t of stream.getAudioTracks()) {
          if (t.readyState === "live") recordingStream.addTrack(t);
        }
      }

      chunksRef.current = [];

      // VP8 WebM is the reliable path. WebView2's MP4/H.264 MediaRecorder
      // claims support via isTypeSupported() but silently produces empty
      // blobs on some Windows builds. The real perf win comes from the
      // bitrate cap below, which cuts software-encoder CPU usage ~50%.
      const candidates = hasAudio
        ? [
            "video/webm;codecs=vp8,opus",
            "video/webm;codecs=vp9,opus",
            "video/webm",
          ]
        : [
            "video/webm;codecs=vp8",
            "video/webm;codecs=vp9",
            "video/webm",
          ];
      const mimeType =
        candidates.find((m) => MediaRecorder.isTypeSupported(m)) ??
        "video/webm";

      // Cap bitrate — default can be 2.5 Mbps+ which pegs CPU. 1.2 Mbps is
      // plenty for a 720p surveillance feed.
      const recorder = new MediaRecorder(recordingStream, {
        mimeType,
        videoBitsPerSecond: 1_200_000,
        ...(hasAudio ? { audioBitsPerSecond: 64_000 } : {}),
      });
      mediaRecorderRef.current = recorder;
      startIsoRef.current = startIso;
      triggerRef.current = trigger;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const recFilename = `${safeName}-${ts}.webm`;
        const capturedStartIso = startIsoRef.current;
        const capturedTrigger = triggerRef.current;
        startIsoRef.current = null;

        // 0-byte guard: don't create DB rows or files for empty captures.
        // Tell the user so they can retry instead of failing silently.
        if (blob.size === 0) {
          if (capturedTrigger === "manual") {
            showToast(
              "Recording failed — the live feed produced no data. Try again once the stream is active.",
              "error",
            );
          }
          return;
        }

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
            const arrayBuffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = "";
            bytes.forEach((b) => (binary += String.fromCharCode(b)));
            const base64 = btoa(binary);
            savedPath = (await invoke("save_recording", {
              filename: recFilename,
              dataBase64: base64,
              customDir: recordingsPath || null,
            })) as string;
          } catch {
            // Fall through to browser download
          }
        }

        if (!savedPath) {
          // Dev mode / Tauri failed — download through the browser
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = recFilename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          return;
        }

        showToast("Recording saved to your device", "success");

        // Single finalized DB row. Skipped when user chose "local only" mode.
        if (saveMode === "local_only" || !capturedStartIso) return;

        try {
          await fetch(`${API_URL}/api/v1/cameras/${cameraId}/record/local`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
              startTime: capturedStartIso,
              endTime: new Date().toISOString(),
              localFilePath: savedPath,
              sizeBytes: blob.size,
              trigger: capturedTrigger,
            }),
          });
        } catch {
          // Non-critical — file is already saved on disk
        }
      };

      // 2 s chunks = half the dataavailable callbacks vs 1 s, less main-thread churn
      recorder.start(2000);
      setIsRecording(true);
      setRecordingStartTime(Date.now());
    },
    [cameraId, cameraName, saveMode, recordingsPath, videoContainerRef],
  );

  const stopDesktopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setIsRecording(false);
      setRecordingStartTime(null);
      return;
    }
    try {
      recorder.stop();
    } catch {
      // no-op
    }
    setIsRecording(false);
    setRecordingStartTime(null);
  }, []);

  // ------- Public API: toggle / explicit start / explicit stop -------

  const startRecording = useCallback(
    async (trigger: RecordingTrigger = "manual") => {
      if (!cameraId || isRecording) return;

      if (isTauri()) {
        startDesktopRecording(trigger);
        return;
      }

      // Cloud path — optimistic flip, server REST call
      setIsRecording(true);
      setRecordingStartTime(Date.now());
      try {
        const res = await fetch(
          `${API_URL}/api/v1/cameras/${cameraId}/record/start`,
          {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ trigger }),
          },
        );
        const json = await res.json();
        if (!json.success) {
          setIsRecording(false);
          setRecordingStartTime(null);
        }
      } catch {
        setIsRecording(false);
        setRecordingStartTime(null);
      }
    },
    [cameraId, isRecording, startDesktopRecording],
  );

  const stopRecording = useCallback(() => {
    if (!cameraId || !isRecording) return;

    if (isTauri()) {
      stopDesktopRecording();
      return;
    }

    // Cloud path
    setIsRecording(false);
    setRecordingStartTime(null);
    fetch(`${API_URL}/api/v1/cameras/${cameraId}/record/stop`, {
      method: "POST",
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) {
          setIsRecording(true);
          setRecordingStartTime(Date.now());
        }
      })
      .catch(() => {
        setIsRecording(true);
        setRecordingStartTime(Date.now());
      });
  }, [cameraId, isRecording, stopDesktopRecording]);

  const toggleRecording = useCallback(
    async (trigger: RecordingTrigger = "manual") => {
      if (isRecording) stopRecording();
      else await startRecording(trigger);
    },
    [isRecording, startRecording, stopRecording],
  );

  // ------- Screenshot (local PNG snapshot of current frame) -------

  const takeScreenshot = useCallback(() => {
    const video = videoContainerRef.current?.querySelector("video");
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const link = document.createElement("a");
    link.download = `${sanitizeFilename(cameraName ?? "camera")}-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [cameraName, videoContainerRef]);

  return {
    isRecording,
    recordingDuration,
    toggleRecording,
    startRecording,
    stopRecording,
    takeScreenshot,
  };
}
