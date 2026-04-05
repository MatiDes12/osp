import type { ApiClient } from "./client.js";
import type { ApiResponse, PaginationParams } from "../types/api.js";
import type {
  Camera,
  CameraZone,
  DiscoveredCamera,
  StreamInfo,
} from "../types/camera.js";
import type {
  CreateCameraInput,
  UpdateCameraInput,
  PTZCommandInput,
  CreateZoneInput,
  UpdateZoneInput,
} from "../schemas/camera.schema.js";

export function createCamerasApi(client: ApiClient) {
  return {
    list(params?: PaginationParams & { status?: string; search?: string }) {
      return client.get<Camera[]>("/api/v1/cameras", params as Record<string, string | number | boolean | undefined>);
    },

    get(id: string) {
      return client.get<Camera>(`/api/v1/cameras/${id}`);
    },

    create(data: CreateCameraInput) {
      return client.post<Camera>("/api/v1/cameras", data);
    },

    update(id: string, data: UpdateCameraInput) {
      return client.patch<Camera>(`/api/v1/cameras/${id}`, data);
    },

    delete(id: string) {
      return client.delete<void>(`/api/v1/cameras/${id}`);
    },

    discover(subnet?: string) {
      return client.post<{
        cameras: DiscoveredCamera[];
        scanDurationMs: number;
        subnetScanned: string;
      }>("/api/v1/cameras/discover", subnet ? { subnet } : undefined);
    },

    getStream(id: string) {
      return client.get<StreamInfo>(`/api/v1/cameras/${id}/stream`);
    },

    ptz(id: string, command: PTZCommandInput) {
      return client.post<void>(`/api/v1/cameras/${id}/ptz`, command);
    },

    getSnapshot(id: string) {
      return client.get<{ url: string }>(`/api/v1/cameras/${id}/snapshot`);
    },

    reconnect(id: string) {
      return client.post<void>(`/api/v1/cameras/${id}/reconnect`);
    },

    // Zones
    listZones(cameraId: string) {
      return client.get<CameraZone[]>(`/api/v1/cameras/${cameraId}/zones`);
    },

    createZone(cameraId: string, data: CreateZoneInput) {
      return client.post<CameraZone>(`/api/v1/cameras/${cameraId}/zones`, data);
    },

    updateZone(cameraId: string, zoneId: string, data: UpdateZoneInput) {
      return client.patch<CameraZone>(
        `/api/v1/cameras/${cameraId}/zones/${zoneId}`,
        data,
      );
    },

    deleteZone(cameraId: string, zoneId: string) {
      return client.delete<void>(`/api/v1/cameras/${cameraId}/zones/${zoneId}`);
    },
  };
}
