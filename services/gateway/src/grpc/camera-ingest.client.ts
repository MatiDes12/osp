// ---------------------------------------------------------------------------
//  Camera-Ingest gRPC Client
//  Wraps the raw gRPC stub with typed methods and a fallback-to-direct pattern
//  so the gateway works without the Go service in development.
// ---------------------------------------------------------------------------

import { createLogger } from "../lib/logger.js";
import {
  getRawCameraIngestStub,
  unaryCall,
  isServiceUnavailable,
} from "./client.js";

const logger = createLogger("grpc-camera-ingest");

// ---------------------------------------------------------------------------
//  Types (mirror the proto messages in TypeScript)
// ---------------------------------------------------------------------------

export interface CameraStatus {
  cameraId: string;
  name: string;
  rtspUrl: string;
  state: string; // CAMERA_STATE_ONLINE | CAMERA_STATE_OFFLINE | ...
  lastSeen: string;
  consecutiveFailures: number;
  errorMessage: string;
}

export interface DiscoveredCamera {
  ip: string;
  port: number;
  manufacturer: string;
  model: string;
  xaddr: string;
}

export interface PTZCommand {
  action: string; // PTZ_ACTION_MOVE | PTZ_ACTION_STOP | PTZ_ACTION_GOTO_PRESET
  pan: number;
  tilt: number;
  zoom: number;
  speed: number;
  presetId: string;
}

// ---------------------------------------------------------------------------
//  gRPC request / response shapes (camelCase from proto-loader)
// ---------------------------------------------------------------------------

interface AddCameraRequest {
  cameraId: string;
  rtspUrl: string;
  name?: string;
  onvifUrl?: string;
  username?: string;
  password?: string;
}

interface AddCameraResponse {
  success: boolean;
  message: string;
  status: CameraStatus;
}

interface RemoveCameraResponse {
  success: boolean;
  message: string;
}

interface CameraStatusResponse {
  status: CameraStatus;
}

interface ListCameraStatusesResponse {
  statuses: CameraStatus[];
}

interface DiscoverCamerasResponse {
  cameras: DiscoveredCamera[];
}

interface PTZCommandResponse {
  success: boolean;
  message: string;
}

interface ReconnectCameraResponse {
  success: boolean;
  message: string;
  status: CameraStatus;
}

// ---------------------------------------------------------------------------
//  Client interface
// ---------------------------------------------------------------------------

export interface CameraIngestClient {
  addCamera(
    id: string,
    rtspUrl: string,
    options?: { name?: string; onvifUrl?: string; username?: string; password?: string },
  ): Promise<AddCameraResponse>;
  removeCamera(id: string): Promise<void>;
  getCameraStatus(id: string): Promise<CameraStatus>;
  listCameraStatuses(): Promise<CameraStatus[]>;
  discoverCameras(timeoutSeconds?: number): Promise<DiscoveredCamera[]>;
  ptzCommand(cameraId: string, command: PTZCommand): Promise<void>;
  reconnectCamera(id: string): Promise<ReconnectCameraResponse>;
}

// ---------------------------------------------------------------------------
//  Implementation with fallback
// ---------------------------------------------------------------------------

function createGrpcCameraIngestClient(): CameraIngestClient {
  function getStub() {
    return getRawCameraIngestStub();
  }

  return {
    async addCamera(id, rtspUrl, options) {
      const request: AddCameraRequest = {
        cameraId: id,
        rtspUrl,
        name: options?.name,
        onvifUrl: options?.onvifUrl,
        username: options?.username,
        password: options?.password,
      };

      try {
        return await unaryCall<AddCameraRequest, AddCameraResponse>(
          getStub(),
          "addCamera",
          request,
        );
      } catch (err) {
        if (isServiceUnavailable(err)) {
          logger.warn("Camera-ingest service not available, using direct mode");
          throw new GrpcFallbackError("camera-ingest", "addCamera");
        }
        throw err;
      }
    },

    async removeCamera(id) {
      try {
        await unaryCall<{ cameraId: string }, RemoveCameraResponse>(
          getStub(),
          "removeCamera",
          { cameraId: id },
        );
      } catch (err) {
        if (isServiceUnavailable(err)) {
          logger.warn("Camera-ingest service not available, using direct mode");
          throw new GrpcFallbackError("camera-ingest", "removeCamera");
        }
        throw err;
      }
    },

    async getCameraStatus(id) {
      try {
        const response = await unaryCall<{ cameraId: string }, CameraStatusResponse>(
          getStub(),
          "getCameraStatus",
          { cameraId: id },
        );
        return response.status;
      } catch (err) {
        if (isServiceUnavailable(err)) {
          logger.warn("Camera-ingest service not available, using direct mode");
          throw new GrpcFallbackError("camera-ingest", "getCameraStatus");
        }
        throw err;
      }
    },

    async listCameraStatuses() {
      try {
        const response = await unaryCall<Record<string, never>, ListCameraStatusesResponse>(
          getStub(),
          "listCameraStatuses",
          {},
        );
        return response.statuses;
      } catch (err) {
        if (isServiceUnavailable(err)) {
          logger.warn("Camera-ingest service not available, using direct mode");
          throw new GrpcFallbackError("camera-ingest", "listCameraStatuses");
        }
        throw err;
      }
    },

    async discoverCameras(timeoutSeconds = 10) {
      try {
        const response = await unaryCall<{ timeoutSeconds: number }, DiscoverCamerasResponse>(
          getStub(),
          "discoverCameras",
          { timeoutSeconds },
          30_000, // Discovery can be slow
        );
        return response.cameras;
      } catch (err) {
        if (isServiceUnavailable(err)) {
          logger.warn("Camera-ingest service not available, using direct mode");
          throw new GrpcFallbackError("camera-ingest", "discoverCameras");
        }
        throw err;
      }
    },

    async ptzCommand(cameraId, command) {
      try {
        await unaryCall<{ cameraId: string } & PTZCommand, PTZCommandResponse>(
          getStub(),
          "pTZCommand",
          { cameraId, ...command },
        );
      } catch (err) {
        if (isServiceUnavailable(err)) {
          logger.warn("Camera-ingest service not available, using direct mode");
          throw new GrpcFallbackError("camera-ingest", "ptzCommand");
        }
        throw err;
      }
    },

    async reconnectCamera(id) {
      try {
        return await unaryCall<{ cameraId: string }, ReconnectCameraResponse>(
          getStub(),
          "reconnectCamera",
          { cameraId: id },
        );
      } catch (err) {
        if (isServiceUnavailable(err)) {
          logger.warn("Camera-ingest service not available, using direct mode");
          throw new GrpcFallbackError("camera-ingest", "reconnectCamera");
        }
        throw err;
      }
    },
  };
}

// ---------------------------------------------------------------------------
//  Fallback error (caught by service layer to switch to direct mode)
// ---------------------------------------------------------------------------

export class GrpcFallbackError extends Error {
  readonly serviceName: string;
  readonly methodName: string;

  constructor(serviceName: string, methodName: string) {
    super(`gRPC service "${serviceName}" unavailable for method "${methodName}"`);
    this.name = "GrpcFallbackError";
    this.serviceName = serviceName;
    this.methodName = methodName;
  }
}

// ---------------------------------------------------------------------------
//  Singleton
// ---------------------------------------------------------------------------

let instance: CameraIngestClient | null = null;

export function getCameraIngestClient(): CameraIngestClient {
  if (!instance) {
    instance = createGrpcCameraIngestClient();
  }
  return instance;
}
