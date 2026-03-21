// ---------------------------------------------------------------------------
//  gRPC Client Layer — barrel export
// ---------------------------------------------------------------------------

export {
  closeAllClients,
  checkServiceHealth,
  type ServiceHealth,
} from "./client.js";

export {
  getCameraIngestClient,
  GrpcFallbackError,
  type CameraIngestClient,
  type CameraStatus as GrpcCameraStatus,
  type DiscoveredCamera as GrpcDiscoveredCamera,
  type PTZCommand,
} from "./camera-ingest.client.js";

export {
  getVideoPipelineClient,
  type VideoPipelineClient,
  type StartRecordingResult,
  type StopRecordingResult,
  type RecordingStatus,
  type SnapshotResult,
  type PlaybackURLResult,
} from "./video-pipeline.client.js";

