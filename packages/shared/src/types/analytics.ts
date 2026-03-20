export interface AnalyticsTimeSeriesPoint {
  bucket: string;  // ISO datetime
  count: number;
}

export interface AnalyticsHeatmapCell {
  hourOfDay: number;   // 0-23
  dayOfWeek: number;   // 1=Mon … 7=Sun
  count: number;
}

export interface AnalyticsEventTypeBreakdown {
  type: string;
  count: number;
  pct: number;
}

export interface AnalyticsCameraActivity {
  cameraId: string;
  count: number;
  lastSeen: string;
}

export interface AnalyticsRecordingsSummary {
  totalRecordings: number;
  totalDurationSec: number;
  totalSizeBytes: number;
  byTrigger: Record<string, number>;
  dailyStorageBytes: { date: string; bytes: number }[];
}

export type AnalyticsGranularity = "hour" | "day";
