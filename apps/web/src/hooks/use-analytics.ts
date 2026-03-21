"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  AnalyticsTimeSeriesPoint,
  AnalyticsHeatmapCell,
  AnalyticsEventTypeBreakdown,
  AnalyticsCameraActivity,
  AnalyticsRecordingsSummary,
  AnalyticsGranularity,
} from "@osp/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("osp_access_token")
      : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T | null> {
  const url = new URL(`${API_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: getAuthHeaders() });
  if (!res.ok) return null;
  const json = (await res.json()) as { success: boolean; data: T };
  return json.success ? json.data : null;
}

// ─── Date range preset ───────────────────────────────────────────────────────

export type DatePreset = "24h" | "7d" | "30d" | "90d";

export function presetToRange(preset: DatePreset): {
  from: string;
  to: string;
} {
  const now = new Date();
  const ms: Record<DatePreset, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };
  return {
    from: new Date(now.getTime() - ms[preset]).toISOString(),
    to: now.toISOString(),
  };
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useEventTimeSeries(opts: {
  from: string;
  to: string;
  granularity?: AnalyticsGranularity;
  cameraId?: string;
  type?: string;
}) {
  const [data, setData] = useState<AnalyticsTimeSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {
      from: opts.from,
      to: opts.to,
      granularity: opts.granularity ?? "hour",
    };
    if (opts.cameraId) params.cameraId = opts.cameraId;
    if (opts.type) params.type = opts.type;

    const result = await apiFetch<AnalyticsTimeSeriesPoint[]>(
      "/api/v1/analytics/events/timeseries",
      params,
    );
    setData(result ?? []);
    setLoading(false);
  }, [opts.from, opts.to, opts.granularity, opts.cameraId, opts.type]);

  useEffect(() => {
    void fetch();
  }, [fetch]);
  return { data, loading, refetch: fetch };
}

export function useEventHeatmap(opts: {
  from: string;
  to: string;
  cameraId?: string;
  type?: string;
}) {
  const [data, setData] = useState<AnalyticsHeatmapCell[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { from: opts.from, to: opts.to };
    if (opts.cameraId) params.cameraId = opts.cameraId;
    if (opts.type) params.type = opts.type;

    const result = await apiFetch<AnalyticsHeatmapCell[]>(
      "/api/v1/analytics/events/heatmap",
      params,
    );
    setData(result ?? []);
    setLoading(false);
  }, [opts.from, opts.to, opts.cameraId, opts.type]);

  useEffect(() => {
    void fetch();
  }, [fetch]);
  return { data, loading, refetch: fetch };
}

export function useEventBreakdown(opts: {
  from: string;
  to: string;
  cameraId?: string;
}) {
  const [data, setData] = useState<AnalyticsEventTypeBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { from: opts.from, to: opts.to };
    if (opts.cameraId) params.cameraId = opts.cameraId;

    const result = await apiFetch<AnalyticsEventTypeBreakdown[]>(
      "/api/v1/analytics/events/breakdown",
      params,
    );
    setData(result ?? []);
    setLoading(false);
  }, [opts.from, opts.to, opts.cameraId]);

  useEffect(() => {
    void fetch();
  }, [fetch]);
  return { data, loading, refetch: fetch };
}

export function useCameraActivity(opts: {
  from: string;
  to: string;
  limit?: number;
}) {
  const [data, setData] = useState<AnalyticsCameraActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {
      from: opts.from,
      to: opts.to,
      ...(opts.limit ? { limit: String(opts.limit) } : {}),
    };
    const result = await apiFetch<AnalyticsCameraActivity[]>(
      "/api/v1/analytics/cameras/activity",
      params,
    );
    setData(result ?? []);
    setLoading(false);
  }, [opts.from, opts.to, opts.limit]);

  useEffect(() => {
    void fetch();
  }, [fetch]);
  return { data, loading, refetch: fetch };
}

export function useRecordingsSummary(opts: {
  from: string;
  to: string;
  cameraId?: string;
}) {
  const [data, setData] = useState<AnalyticsRecordingsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { from: opts.from, to: opts.to };
    if (opts.cameraId) params.cameraId = opts.cameraId;

    const result = await apiFetch<AnalyticsRecordingsSummary>(
      "/api/v1/analytics/recordings/summary",
      params,
    );
    setData(result);
    setLoading(false);
  }, [opts.from, opts.to, opts.cameraId]);

  useEffect(() => {
    void fetch();
  }, [fetch]);
  return { data, loading, refetch: fetch };
}
