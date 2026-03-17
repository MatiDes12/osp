import type { ApiClient } from "./client.js";
import type { ApiResponse, PaginationParams } from "../types/api.js";
import type { Recording, TimelineResponse } from "../types/recording.js";

export interface ListRecordingsParams extends PaginationParams {
  cameraId?: string;
  trigger?: string;
  from?: string;
  to?: string;
}

export function createRecordingsApi(client: ApiClient) {
  return {
    list(
      params?: ListRecordingsParams,
    ): Promise<ApiResponse<Recording[]>> {
      return client.get<Recording[]>(
        "/api/v1/recordings",
        params as Record<string, string | number | boolean | undefined>,
      );
    },

    get(id: string): Promise<ApiResponse<Recording>> {
      return client.get<Recording>(`/api/v1/recordings/${id}`);
    },

    delete(id: string): Promise<ApiResponse<void>> {
      return client.delete<void>(`/api/v1/recordings/${id}`);
    },

    timeline(
      cameraId: string,
      date: string,
    ): Promise<ApiResponse<TimelineResponse>> {
      return client.get<TimelineResponse>(
        `/api/v1/cameras/${cameraId}/timeline`,
        { date },
      );
    },
  };
}
