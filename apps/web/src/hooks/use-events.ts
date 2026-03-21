"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  OSPEvent,
  ApiResponse,
  ListEventsInput,
  PaginationParams,
} from "@osp/shared";
import { transformEvents } from "@/lib/transforms";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("osp_access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

function toSearchParams(
  params?: Record<string, unknown>,
): string {
  if (!params) return "";
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  }
  const str = searchParams.toString();
  return str ? `?${str}` : "";
}

interface UseEventsReturn {
  readonly events: readonly OSPEvent[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refetch: () => Promise<void>;
  readonly acknowledge: (id: string) => Promise<void>;
  readonly bulkAcknowledge: (eventIds: string[]) => Promise<number>;
}

export function useEvents(
  filters?: Partial<ListEventsInput> & PaginationParams,
): UseEventsReturn {
  const [events, setEvents] = useState<readonly OSPEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = toSearchParams(filters as Record<string, unknown>);
      const response = await fetch(`${API_URL}/api/v1/events${qs}`, {
        headers: getAuthHeaders(),
      });
      const json = await response.json();
      if (json.success && json.data) {
        setEvents(transformEvents(json.data as Record<string, unknown>[]));
      } else {
        setError(json.error?.message ?? "Failed to fetch events");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const acknowledge = useCallback(
    async (id: string): Promise<void> => {
      const response = await fetch(
        `${API_URL}/api/v1/events/${id}/acknowledge`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
        },
      );
      const json: ApiResponse<OSPEvent> = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? "Failed to acknowledge event");
      }
      setEvents((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, acknowledged: true } : e,
        ),
      );
    },
    [],
  );

  const bulkAcknowledge = useCallback(
    async (eventIds: string[]): Promise<number> => {
      const response = await fetch(
        `${API_URL}/api/v1/events/bulk-acknowledge`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ eventIds }),
        },
      );
      const json: ApiResponse<{ acknowledgedCount: number }> =
        await response.json();
      if (!json.success || !json.data) {
        throw new Error(
          json.error?.message ?? "Failed to bulk acknowledge events",
        );
      }
      const idSet = new Set(eventIds);
      setEvents((prev) =>
        prev.map((e) =>
          idSet.has(e.id) ? { ...e, acknowledged: true } : e,
        ),
      );
      return json.data.acknowledgedCount;
    },
    [],
  );

  return {
    events,
    loading,
    error,
    refetch: fetchEvents,
    acknowledge,
    bulkAcknowledge,
  };
}

