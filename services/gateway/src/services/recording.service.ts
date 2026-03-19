import { mkdirSync, createWriteStream, statSync } from "node:fs";
import { join } from "node:path";
import { getSupabase } from "../lib/supabase.js";
import { createLogger } from "../lib/logger.js";
import { ApiError } from "../middleware/error-handler.js";
import { getVideoPipelineClient, GrpcFallbackError } from "../grpc/index.js";
import type { RecordingTrigger } from "@osp/shared";

const logger = createLogger("recording-service");

interface ActiveRecording {
  readonly abortController: AbortController;
  readonly filePath: string;
  readonly cameraId: string;
  readonly startTime: number;
}

export class RecordingService {
  private readonly activeRecordings = new Map<string, ActiveRecording>();
  /**
   * Start recording for a camera.
   * Tries gRPC video-pipeline service first, falls back to direct Supabase.
   */
  async startRecording(
    cameraId: string,
    tenantId: string,
    trigger: RecordingTrigger,
  ): Promise<string> {
    // Try gRPC video-pipeline service first (production path)
    try {
      const client = getVideoPipelineClient();
      const result = await client.startRecording(cameraId, tenantId, trigger);
      logger.info("Recording started via gRPC video-pipeline", {
        recordingId: result.recordingId,
        cameraId,
        trigger,
      });
      return result.recordingId;
    } catch (err) {
      if (!(err instanceof GrpcFallbackError)) {
        throw err;
      }
      // Fall through to direct Supabase
    }

    // Fallback: direct Supabase (development / standalone mode)
    return this.startRecordingDirect(cameraId, tenantId, trigger);
  }

  /**
   * Direct Supabase implementation of startRecording (fallback path).
   */
  private async startRecordingDirect(
    cameraId: string,
    tenantId: string,
    trigger: RecordingTrigger,
  ): Promise<string> {
    const supabase = getSupabase();

    // Verify camera belongs to tenant
    const { data: camera, error: cameraError } = await supabase
      .from("cameras")
      .select("id, name")
      .eq("id", cameraId)
      .eq("tenant_id", tenantId)
      .single();

    if (cameraError || !camera) {
      throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
    }

    // Check if there's already an active recording for this camera
    const { data: existing } = await supabase
      .from("recordings")
      .select("id")
      .eq("camera_id", cameraId)
      .eq("tenant_id", tenantId)
      .eq("status", "recording")
      .limit(1)
      .maybeSingle();

    if (existing) {
      throw new ApiError(
        "RECORDING_ALREADY_ACTIVE",
        "Camera already has an active recording",
        409,
      );
    }

    const storagePath = `recordings/${tenantId}/${cameraId}/${Date.now()}.mp4`;

    const { data: recording, error } = await supabase
      .from("recordings")
      .insert({
        camera_id: cameraId,
        tenant_id: tenantId,
        start_time: new Date().toISOString(),
        trigger,
        status: "recording",
        format: "mp4",
        storage_path: storagePath,
        size_bytes: 0,
        retention_until: computeRetentionDate(tenantId),
      })
      .select("id")
      .single();

    if (error || !recording) {
      logger.error("Failed to create recording record", {
        cameraId,
        tenantId,
        error: String(error),
      });
      throw new ApiError(
        "RECORDING_START_FAILED",
        "Failed to start recording",
        500,
      );
    }

    const recordingId = recording.id as string;

    // Start background video capture from go2rtc
    const go2rtcUrl = process.env["GO2RTC_URL"] ?? "http://localhost:1984";
    const recordingsDir = process.env["RECORDINGS_DIR"] ?? "./recordings";

    const dir = join(recordingsDir, tenantId, cameraId);
    mkdirSync(dir, { recursive: true });

    const filePath = join(dir, `${recordingId}.mp4`);
    const abortController = new AbortController();

    const mp4Url = `${go2rtcUrl}/api/stream.mp4?src=${encodeURIComponent(cameraId)}`;

    // Pipe the MP4 stream to a file in the background
    const mp4Fetch = fetch(mp4Url, { signal: abortController.signal });
    mp4Fetch
      .then(async (res) => {
        if (!res.body) {
          logger.warn("MP4 stream returned no body", { recordingId, cameraId });
          return;
        }
        const fileStream = createWriteStream(filePath);
        const reader = res.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fileStream.write(value);
          }
        } catch (err) {
          // AbortError is expected when recording is stopped
          if ((err as Error).name !== "AbortError") {
            logger.error("MP4 capture error", {
              recordingId,
              error: String(err),
            });
          }
        } finally {
          fileStream.end();
        }
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          logger.error("MP4 fetch error", {
            recordingId,
            error: String(err),
          });
        }
      });

    this.activeRecordings.set(recordingId, {
      abortController,
      filePath,
      cameraId,
      startTime: Date.now(),
    });

    // Update storage_path to the actual file path
    await supabase
      .from("recordings")
      .update({ storage_path: filePath })
      .eq("id", recordingId);

    logger.info("Recording started (direct mode)", {
      recordingId,
      cameraId,
      trigger,
      filePath,
    });

    return recordingId;
  }

  /**
   * Stop recording and finalize the DB record.
   */
  async stopRecording(recordingId: string): Promise<Record<string, unknown>> {
    const supabase = getSupabase();

    // Production path: stop via video-pipeline so it finalizes + uploads to R2.
    try {
      const client = getVideoPipelineClient();
      const result = await client.stopRecording(recordingId);
      if (result.success) {
        const { data: updated, error } = await supabase
          .from("recordings")
          .select("*")
          .eq("id", recordingId)
          .single();

        if (error || !updated) {
          throw new ApiError(
            "RECORDING_STOP_FAILED",
            "Recording stopped in video-pipeline but failed to load updated row",
            500,
          );
        }

        return updated as Record<string, unknown>;
      }
    } catch (err) {
      if (!(err instanceof GrpcFallbackError)) {
        throw err;
      }
      // Fall through to direct mode.
    }

    const now = new Date().toISOString();

    const { data: recording, error: fetchError } = await supabase
      .from("recordings")
      .select("id, camera_id, start_time, status")
      .eq("id", recordingId)
      .single();

    if (fetchError || !recording) {
      throw new ApiError("RECORDING_NOT_FOUND", "Recording not found", 404);
    }

    if (recording.status !== "recording") {
      throw new ApiError(
        "RECORDING_NOT_ACTIVE",
        "Recording is not currently active",
        409,
      );
    }

    // Stop the video capture if active
    const active = this.activeRecordings.get(recordingId);
    if (active) {
      active.abortController.abort();
      this.activeRecordings.delete(recordingId);
    }

    const startTime = new Date(recording.start_time as string);
    const durationSec = Math.round((Date.now() - startTime.getTime()) / 1000);

    // Get actual file size (give the write stream a moment to flush)
    let sizeBytes = 0;
    let storagePath: string | undefined;
    if (active) {
      // Small delay to let the file stream finalize after abort
      await new Promise((r) => setTimeout(r, 200));
      try {
        const stats = statSync(active.filePath);
        sizeBytes = stats.size;
        storagePath = active.filePath;
      } catch {
        logger.warn("Could not stat recording file", {
          recordingId,
          filePath: active.filePath,
        });
      }
    }

    const updatePayload: Record<string, unknown> = {
      status: "complete",
      end_time: now,
      duration_sec: durationSec,
      size_bytes: sizeBytes,
    };
    if (storagePath) {
      updatePayload["storage_path"] = storagePath;
    }

    const { data: updated, error } = await supabase
      .from("recordings")
      .update(updatePayload)
      .eq("id", recordingId)
      .select("*")
      .single();

    if (error || !updated) {
      logger.error("Failed to stop recording", {
        recordingId,
        error: String(error),
      });
      throw new ApiError(
        "RECORDING_STOP_FAILED",
        "Failed to stop recording",
        500,
      );
    }

    logger.info("Recording stopped", { recordingId, durationSec, sizeBytes });

    return updated as Record<string, unknown>;
  }

  /**
   * Get the active recording for a camera, if any.
   */
  async getActiveRecording(
    cameraId: string,
    tenantId: string,
  ): Promise<Record<string, unknown> | null> {
    const supabase = getSupabase();

    const { data: recording } = await supabase
      .from("recordings")
      .select("*")
      .eq("camera_id", cameraId)
      .eq("tenant_id", tenantId)
      .eq("status", "recording")
      .limit(1)
      .maybeSingle();

    return (recording as Record<string, unknown>) ?? null;
  }

  /**
   * Generate a playback URL for a recording.
   * Prefers the video-pipeline pre-signed URL (HLS playlist in R2).
   * Falls back to the gateway's local file-serving endpoint.
   */
  async getPlaybackUrl(recordingId: string, tenantId: string): Promise<string> {
    const gatewayUrl =
      process.env["GATEWAY_PUBLIC_URL"] ?? "http://localhost:3000";

    const fallbackUrl = `${gatewayUrl}/api/v1/recordings/${encodeURIComponent(recordingId)}/play`;

    try {
      const client = getVideoPipelineClient();
      const result = await client.getPlaybackURL(recordingId, tenantId);
      if (result.success && result.playbackUrl) {
        return result.playbackUrl;
      }
    } catch (err) {
      if (err instanceof GrpcFallbackError) {
        // Video-pipeline unavailable — keep using local playback.
        return fallbackUrl;
      }
    }

    return fallbackUrl;
  }

  /**
   * Get the absolute file path for a recording.
   */
  getRecordingFilePath(storagePath: string): string {
    return storagePath;
  }

  /**
   * Start a timed recording (e.g., 30s for motion events).
   * Starts recording, then stops after the specified duration.
   */
  async startTimedRecording(
    cameraId: string,
    tenantId: string,
    trigger: RecordingTrigger,
    durationMs: number,
  ): Promise<string> {
    const recordingId = await this.startRecording(cameraId, tenantId, trigger);

    setTimeout(async () => {
      try {
        await this.stopRecording(recordingId);
        logger.info("Timed recording auto-stopped", {
          recordingId,
          cameraId,
          durationMs,
        });
      } catch (err) {
        logger.warn("Failed to auto-stop timed recording", {
          recordingId,
          error: String(err),
        });
      }
    }, durationMs);

    return recordingId;
  }
}

/**
 * Compute retention date based on tenant plan.
 * Placeholder: defaults to 7 days from now.
 */
function computeRetentionDate(_tenantId: string): string {
  const retention = new Date();
  retention.setDate(retention.getDate() + 7);
  return retention.toISOString();
}

// Singleton instance
let recordingServiceInstance: RecordingService | null = null;

export function getRecordingService(): RecordingService {
  recordingServiceInstance ??= new RecordingService();
  return recordingServiceInstance;
}
