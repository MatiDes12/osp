export type RecordingTrigger =
  | "motion"
  | "continuous"
  | "manual"
  | "rule"
  | "ai_detection";

export type RecordingStatus =
  | "recording"
  | "complete"
  | "partial"
  | "failed"
  | "deleted";

export interface Recording {
  id: string;
  cameraId: string;
  cameraName: string;
  tenantId: string;
  startTime: string;
  endTime: string;
  durationSec: number;
  sizeBytes: number;
  format: string;
  trigger: RecordingTrigger;
  status: RecordingStatus;
  playbackUrl: string;
  thumbnailUrl: string | null;
  retentionUntil: string;
  createdAt: string;
}

export interface TimelineSegment {
  startTime: string;
  endTime: string;
  trigger: RecordingTrigger;
  recordingId: string;
  hasEvents: boolean;
}

export interface TimelineResponse {
  date: string;
  cameraId: string;
  segments: TimelineSegment[];
  events: {
    timestamp: string;
    type: string;
    severity: string;
    eventId: string;
    thumbnailUrl: string | null;
  }[];
}
