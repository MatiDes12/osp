import { getSupabase } from "../lib/supabase.js";
import { createLogger } from "../lib/logger.js";
import { ApiError } from "../middleware/error-handler.js";
import type { RecordingTrigger } from "@osp/shared";

const logger = createLogger("recording-service");

export class RecordingService {
  /**
   * Start recording for a camera.
   * Creates a DB record with status "recording". Actual media capture
   * will be handled by the camera-ingest service (not yet implemented).
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

    const { data: recording, error } = await supabase
      .from("recordings")
      .insert({
        camera_id: cameraId,
        camera_name: camera.name,
        tenant_id: tenantId,
        start_time: new Date().toISOString(),
        trigger,
        status: "recording",
        format: "mp4",
        size_bytes: 0,
        duration_sec: 0,
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
   * Actual media finalization will be handled by camera-ingest.
   */
  async stopRecording(recordingId: string): Promise<void> {
    const supabase = getSupabase();

    const now = new Date().toISOString();

    const { data: recording, error: fetchError } = await supabase
      .from("recordings")
      .select("id, start_time, status")
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

    const { error } = await supabase
      .from("recordings")
      .update({
        status: "complete",
        end_time: now,
        duration_sec: durationSec,
      })
      .eq("id", recordingId);

    if (error) {
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
  }

  /**
   * Generate a playback URL for a recording.
   * Placeholder: returns the storage path. In production this would be
   * a signed URL from the object storage provider.
   */
  async getPlaybackUrl(
    recordingId: string,
    tenantId: string,
  ): Promise<string> {
    const supabase = getSupabase();

    const { data: recording, error } = await supabase
      .from("recordings")
      .select("id, camera_id, tenant_id, start_time, status")
      .eq("id", recordingId)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !recording) {
      throw new ApiError("RECORDING_NOT_FOUND", "Recording not found", 404);
    }

    if (recording.status === "recording") {
      throw new ApiError(
        "RECORDING_IN_PROGRESS",
        "Recording is still in progress",
        409,
      );
    }

    // Placeholder: construct a storage path
    const storagePath = `/recordings/${tenantId}/${recording.camera_id}/${recordingId}.mp4`;

    logger.debug("Generated playback URL", { recordingId, storagePath });

    return storagePath;
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
