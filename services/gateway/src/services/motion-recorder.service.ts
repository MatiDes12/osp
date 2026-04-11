/**
 * MotionRecorderService — single authority for motion-triggered recordings.
 *
 * Why this exists:
 *   Motion events can be produced by multiple sources (go2rtc polling in
 *   `health-checker`, camera-ingest pushing events to `POST /api/v1/events`,
 *   rule engine actions).  Before this service existed, each source had its
 *   own debouncer and own start/stop state, so two sources could fire two
 *   recordings for the same motion event — producing duplicate 0-byte rows
 *   in Supabase whenever the server-side capture couldn't actually write.
 *
 * What it does:
 *   - One debouncer keyed by `tenantId:cameraId`
 *   - Starts exactly one recording on the first motion event per key
 *   - Every subsequent motion event within `tailMs` extends the tail timer
 *   - When the tail expires, stops the recording
 *   - Guards against duplicate starts while a start is already in-flight
 *   - Respects `camera.config.recording_mode === "motion"` so a camera must
 *     be opted in for auto-recording
 *   - Skips silently when `RECORDINGS_DIR` is not configured (cloud mode),
 *     so no orphan rows are ever created
 */
import { getSupabase } from "../lib/supabase.js";
import { createLogger } from "../lib/logger.js";
import { get } from "../lib/config.js";
import { getRecordingService } from "./recording.service.js";

const logger = createLogger("motion-recorder");

/** How long to keep recording after the last motion frame. */
const DEFAULT_TAIL_MS = 5_000;

export class MotionRecorderService {
  private readonly tailTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly recordingIds = new Map<string, string>();
  // "starting" prevents duplicate onStart calls while the first is in-flight
  private readonly starting = new Set<string>();

  /**
   * Call this every time a motion event is observed for a camera.
   * Handles decision (should we record?) and debounce (tail timer).
   */
  async handleMotionEvent(
    cameraId: string,
    tenantId: string,
    tailMs: number = DEFAULT_TAIL_MS,
  ): Promise<void> {
    // Hard guard: server-side capture only works when RECORDINGS_DIR is set.
    // Skipping here (rather than inside startRecording) means we don't even
    // create a debounce-timer entry on cloud deployments, which keeps memory
    // usage flat and avoids misleading "starting…" log lines.
    if (!get("RECORDINGS_DIR")) return;

    // Check the camera's opt-in flag.  Looked up fresh every call so the user
    // can toggle recording_mode in settings without restarting the gateway.
    const supabase = getSupabase();
    const { data: cameraConfig } = await supabase
      .from("cameras")
      .select("config")
      .eq("id", cameraId)
      .eq("tenant_id", tenantId)
      .single();

    const config = cameraConfig?.config as Record<string, unknown> | null;
    const recordingMode = config?.recording_mode ?? config?.recordingMode;
    if (recordingMode !== "motion") return;

    this.dispatch(`${tenantId}:${cameraId}`, cameraId, tenantId, tailMs);
  }

  /** Internal — do the debounce work once we've decided to record. */
  private dispatch(
    key: string,
    cameraId: string,
    tenantId: string,
    tailMs: number,
  ): void {
    // Always reset the tail timer — motion is still active.
    const existing = this.tailTimers.get(key);
    if (existing) clearTimeout(existing);

    if (!this.recordingIds.has(key) && !this.starting.has(key)) {
      // No active recording and none starting — start one.
      this.starting.add(key);
      getRecordingService()
        .startRecording(cameraId, tenantId, "motion")
        .then((recordingId) => {
          this.starting.delete(key);
          if (recordingId) {
            this.recordingIds.set(key, recordingId);
            logger.info("Motion recording started", {
              cameraId,
              recordingId,
            });
            this.scheduleTail(key, tailMs);
          }
        })
        .catch((err) => {
          this.starting.delete(key);
          const code = (err as { code?: string } | null)?.code;
          if (code === "RECORDING_NOT_SUPPORTED") {
            // Expected on cloud deployments — the outer guard should have
            // caught this, but belt-and-braces in case RECORDINGS_DIR was
            // cleared between the check and the call.
            return;
          }
          logger.warn("Failed to start motion recording", {
            cameraId,
            error: String(err),
          });
        });
    } else {
      // Recording already running (or starting) — just extend the tail.
      this.scheduleTail(key, tailMs);
    }
  }

  private scheduleTail(key: string, tailMs: number): void {
    const timer = setTimeout(() => {
      const recordingId = this.recordingIds.get(key);
      this.tailTimers.delete(key);
      this.recordingIds.delete(key);
      if (!recordingId) return;
      getRecordingService()
        .stopRecording(recordingId)
        .then(() => {
          logger.info("Motion recording stopped (tail expired)", {
            recordingId,
            tailMs,
          });
        })
        .catch((err) => {
          logger.warn("Failed to stop motion recording", {
            recordingId,
            error: String(err),
          });
        });
    }, tailMs);
    this.tailTimers.set(key, timer);
  }

  /** Shutdown helper for tests / graceful stop. */
  clear(): void {
    for (const timer of this.tailTimers.values()) clearTimeout(timer);
    this.tailTimers.clear();
    this.recordingIds.clear();
    this.starting.clear();
  }
}

// Singleton
let instance: MotionRecorderService | null = null;

export function getMotionRecorder(): MotionRecorderService {
  instance ??= new MotionRecorderService();
  return instance;
}
