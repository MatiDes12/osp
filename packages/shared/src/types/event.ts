export type EventType =
  | "motion"
  | "person"
  | "vehicle"
  | "animal"
  | "camera_offline"
  | "camera_online"
  | "tampering"
  | "audio"
  | "custom";

export type EventSeverity = "low" | "medium" | "high" | "critical";

export interface OSPEvent {
  id: string;
  cameraId: string;
  cameraName: string;
  zoneId: string | null;
  zoneName: string | null;
  tenantId: string;
  type: EventType;
  severity: EventSeverity;
  detectedAt: string;
  metadata: Record<string, unknown>;
  snapshotUrl: string | null;
  clipUrl: string | null;
  intensity: number;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface EventSummary {
  period: { from: string; to: string };
  byType: Record<EventType, number>;
  bySeverity: Record<EventSeverity, number>;
  byCamera: { cameraId: string; cameraName: string; count: number }[];
  total: number;
  unacknowledged: number;
}
