import type { ApiClient } from "./client.js";
import type {
  ApiResponse,
  PaginationParams,
  TimeRangeParams,
} from "../types/api.js";
import type { OSPEvent, EventSummary } from "../types/event.js";
import type { ListEventsInput } from "../schemas/event.schema.js";

export function createEventsApi(client: ApiClient) {
  return {
    list(
      params?: ListEventsInput & PaginationParams,
    ): Promise<ApiResponse<OSPEvent[]>> {
      return client.get<OSPEvent[]>(
        "/api/v1/events",
        params as Record<string, string | number | boolean | undefined>,
      );
    },

    get(id: string): Promise<ApiResponse<OSPEvent>> {
      return client.get<OSPEvent>(`/api/v1/events/${id}`);
    },

    acknowledge(id: string): Promise<ApiResponse<OSPEvent>> {
      return client.post<OSPEvent>(`/api/v1/events/${id}/acknowledge`);
    },

    bulkAcknowledge(
      eventIds: string[],
    ): Promise<ApiResponse<{ acknowledgedCount: number }>> {
      return client.post<{ acknowledgedCount: number }>(
        "/api/v1/events/bulk-acknowledge",
        { eventIds },
      );
    },

    summary(params?: TimeRangeParams): Promise<ApiResponse<EventSummary>> {
      return client.get<EventSummary>(
        "/api/v1/events/summary",
        params as unknown as Record<string, string | number | boolean | undefined>,
      );
    },
  };
}
