"use client";

import { useState, useEffect, useCallback } from "react";
import type { Recording, TimelineResponse, ApiResponse } from "@osp/shared";
import { transformRecordings } from "@/lib/transforms";

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

function toSearchParams(params?: Record<string, unknown>): string {
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

interface RecordingFilters {
  cameraId?: string;
  trigger?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

interface UseRecordingsReturn {
  readonly recordings: readonly Recording[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refetch: () => Promise<void>;
}

export function useRecordings(filters?: RecordingFilters): UseRecordingsReturn {
  const [recordings, setRecordings] = useState<readonly Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecordings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = toSearchParams(filters as Record<string, unknown>);
      const response = await fetch(`${API_URL}/api/v1/recordings${qs}`, {
        headers: getAuthHeaders(),
      });
      const json = await response.json();
      if (json.success && json.data) {
        setRecordings(
          transformRecordings(json.data as Record<string, unknown>[]),
        );
      } else {
        setError(json.error?.message ?? "Failed to fetch recordings");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  return {
    recordings,
    loading,
    error,
    refetch: fetchRecordings,
  };
}

interface UseTimelineReturn {
  readonly timeline: TimelineResponse | null;
  readonly loading: boolean;
}

export function useTimeline(
  cameraId: string | undefined,
  date: string | undefined,
): UseTimelineReturn {
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTimeline = useCallback(async () => {
    if (!cameraId || !date) {
      setTimeline(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/v1/recordings/timeline?cameraId=${encodeURIComponent(cameraId)}&date=${encodeURIComponent(date)}`,
        { headers: getAuthHeaders() },
      );
      const json: ApiResponse<TimelineResponse> = await response.json();
      if (json.success && json.data) {
        setTimeline(json.data);
      }
    } catch {
      // Silently fail for timeline
    } finally {
      setLoading(false);
    }
  }, [cameraId, date]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  return { timeline, loading };
}
