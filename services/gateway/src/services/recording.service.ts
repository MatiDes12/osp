import { getSupabase } from "../lib/supabase.js";
import { createLogger } from "../lib/logger.js";
import { ApiError } from "../middleware/error-handler.js";
import type { RecordingTrigger } from "@osp/shared";

const logger = createLogger("recording-service");

export class RecordingService {
  /**
   * Start recording for a camera.
   * Creates a DB record with status "recording" and links to go2rtc's MP4 stream.
   */
  async startRecording(
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

    logger.info("Recording started", {
      recordingId: recording.id,
      cameraId,
      trigger,
    });

    return recording.id as string;
  }

  /**
   * Stop recording and finalize the DB record.
   */
  async stopRecording(recordingId: string): Promise<Record<string, unknown>> {
    const supabase = getSupabase();

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

    const startTime = new Date(recording.start_time as string);
    const durationSec = Math.round((Date.now() - startTime.getTime()) / 1000);

    const { data: updated, error } = await supabase
      .from("recordings")
      .update({
        status: "complete",
        end_time: now,
        duration_sec: durationSec,
      })
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

    logger.info("Recording stopped", { recordingId, durationSec });

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
   * For MVP: returns the gateway's MP4 proxy endpoint (which proxies go2rtc).
   */
  getPlaybackUrl(cameraId: string): string {
    const gatewayUrl = process.env["GATEWAY_PUBLIC_URL"] ?? "http://localhost:3000";
    return `${gatewayUrl}/api/v1/cameras/${encodeURIComponent(cameraId)}/recording.mp4`;
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
  if (!recordingServiceInstance) {
    recordingServiceInstance = new RecordingService();
  }
  return recordingServiceInstance;
}
