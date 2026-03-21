// ---------------------------------------------------------------------------
//  Video-Pipeline gRPC Client
//  Wraps the raw gRPC stub with typed methods and a fallback-to-direct pattern.
// ---------------------------------------------------------------------------

import { createLogger } from "../lib/logger.js";
import {
  getRawVideoPipelineStub,
  unaryCall,
  isServiceUnavailable,
} from "./client.js";
import { GrpcFallbackError } from "./camera-ingest.client.js";

const logger = createLogger("grpc-video-pipeline");

// ---------------------------------------------------------------------------
//  Types (mirror proto messages)
// ---------------------------------------------------------------------------

export interface StartRecordingResult {
  success: boolean;
  recordingId: string;
  message: string;
}

export interface StopRecordingResult {
  success: boolean;
  durationSec: number;
  message: string;
}

export interface RecordingStatus {
  recordingId: string;
  status: string; // recording | complete | partial | failed | deleted
  durationSec: number;
  sizeBytes: string; // int64 encoded as string by proto-loader
  startTime: string;
  endTime: string;
}

export interface SnapshotResult {
  success: boolean;
  snapshotId: string;
  storagePath: string;
  message: string;
}

export interface PlaybackURLResult {
  success: boolean;
  playbackUrl: string;
  expiresInSec: number;
  message: string;
}

// ---------------------------------------------------------------------------
//  Client interface
// ---------------------------------------------------------------------------

export interface VideoPipelineClient {
  startRecording(
    cameraId: string,
    tenantId: string,
    trigger: string,
    durationSec?: number,
  ): Promise<StartRecordingResult>;
  stopRecording(recordingId: string): Promise<StopRecordingResult>;
  getRecordingStatus(recordingId: string): Promise<RecordingStatus>;
  generateSnapshot(
    cameraId: string,
    tenantId: string,
    options?: { recordingId?: string; timestampSec?: number },
  ): Promise<SnapshotResult>;
  getPlaybackURL(
    recordingId: string,
    tenantId: string,
  ): Promise<PlaybackURLResult>;
}

// ---------------------------------------------------------------------------
//  gRPC request shapes
// ---------------------------------------------------------------------------

interface StartRecordingRequest {
  cameraId: string;
  tenantId: string;
  trigger: string;
  durationSec: number;
}

interface StopRecordingRequest {
  recordingId: string;
}

interface GetRecordingStatusRequest {
  recordingId: string;
}

interface GenerateSnapshotRequest {
  cameraId: string;
  tenantId: string;
  recordingId?: string;
  timestampSec?: number;
}

interface GetPlaybackURLRequest {
  recordingId: string;
  tenantId: string;
}

// ---------------------------------------------------------------------------
//  Implementation
// ---------------------------------------------------------------------------

function createGrpcVideoPipelineClient(): VideoPipelineClient {
  function getStub() {
    return getRawVideoPipelineStub();
  }

  return {
    async startRecording(cameraId, tenantId, trigger, durationSec = 0) {
      const request: StartRecordingRequest = {
        cameraId,
        tenantId,
        trigger,
        durationSec,
      };

      try {
        return await unaryCall<StartRecordingRequest, StartRecordingResult>(
          getStub(),
          "startRecording",
          request,
        );
      } catch (err) {
        if (isServiceUnavailable(err)) {
          logger.warn(
            "Video-pipeline service not available, using direct mode",
          );
          throw new GrpcFallbackError("video-pipeline", "startRecording");
        }
        throw err;
      }
    },

    async stopRecording(recordingId) {
      try {
        return await unaryCall<StopRecordingRequest, StopRecordingResult>(
          getStub(),
          "stopRecording",
          { recordingId },
        );
      } catch (err) {
        if (isServiceUnavailable(err)) {
          logger.warn(
            "Video-pipeline service not available, using direct mode",
          );
          throw new GrpcFallbackError("video-pipeline", "stopRecording");
        }
        throw err;
      }
    },

    async getRecordingStatus(recordingId) {
      try {
        return await unaryCall<GetRecordingStatusRequest, RecordingStatus>(
          getStub(),
          "getRecordingStatus",
          { recordingId },
        );
      } catch (err) {
        if (isServiceUnavailable(err)) {
          logger.warn(
            "Video-pipeline service not available, using direct mode",
          );
          throw new GrpcFallbackError("video-pipeline", "getRecordingStatus");
        }
        throw err;
      }
    },

    async generateSnapshot(cameraId, tenantId, options) {
      const request: GenerateSnapshotRequest = {
        cameraId,
        tenantId,
        recordingId: options?.recordingId,
        timestampSec: options?.timestampSec,
      };

      try {
        return await unaryCall<GenerateSnapshotRequest, SnapshotResult>(
          getStub(),
          "generateSnapshot",
          request,
        );
      } catch (err) {
        if (isServiceUnavailable(err)) {
          logger.warn(
            "Video-pipeline service not available, using direct mode",
          );
          throw new GrpcFallbackError("video-pipeline", "generateSnapshot");
        }
        throw err;
      }
    },

    async getPlaybackURL(recordingId, tenantId) {
      try {
        return await unaryCall<GetPlaybackURLRequest, PlaybackURLResult>(
          getStub(),
          "getPlaybackURL",
          { recordingId, tenantId },
        );
      } catch (err) {
        if (
          isServiceUnavailable(err) ||
          (err instanceof Error &&
            err.message.includes("not found on gRPC stub"))
        ) {
          logger.warn(
            "Video-pipeline service not available, using direct mode",
          );
          throw new GrpcFallbackError("video-pipeline", "getPlaybackURL");
        }
        throw err;
      }
    },
  };
}

// ---------------------------------------------------------------------------
//  Singleton
// ---------------------------------------------------------------------------

let instance: VideoPipelineClient | null = null;

export function getVideoPipelineClient(): VideoPipelineClient {
  if (!instance) {
    instance = createGrpcVideoPipelineClient();
  }
  return instance;
}
