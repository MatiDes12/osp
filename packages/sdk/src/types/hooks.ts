export interface BaseEvent {
  id: string;
  tenantId: string;
  timestamp: string;
}

export interface MotionEvent extends BaseEvent {
  type: "motion.detected";
  cameraId: string;
  cameraName: string;
  zones: { id: string; name: string }[];
  intensity: number;
  boundingBoxes: { x: number; y: number; width: number; height: number }[];
  snapshotUrl: string;
}

export interface PersonEvent extends BaseEvent {
  type: "person.detected";
  cameraId: string;
  cameraName: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  trackingId: string;
  snapshotUrl: string;
}

export interface VehicleEvent extends BaseEvent {
  type: "vehicle.detected";
  cameraId: string;
  cameraName: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  vehicleType: "car" | "truck" | "motorcycle" | "bus" | "bicycle";
  plateNumber: string | null;
  snapshotUrl: string;
}

export interface CameraStatusEvent extends BaseEvent {
  type: "camera.offline" | "camera.online";
  cameraId: string;
  cameraName: string;
  downtimeSeconds: number | null;
  failureReason: string | null;
}

export interface RecordingEvent extends BaseEvent {
  type: "recording.complete";
  cameraId: string;
  cameraName: string;
  recordingId: string;
  durationSec: number;
  sizeBytes: number;
  trigger: string;
  storageUrl: string;
  thumbnailUrl: string | null;
}

export interface AlertEvent extends BaseEvent {
  type: "alert.triggered";
  ruleId: string;
  ruleName: string;
  cameraId: string;
  cameraName: string;
  sourceEventType: string;
  actionsTaken: string[];
}

export interface ScheduledEvent extends BaseEvent {
  type: "scheduled.tick";
  schedule: string;
  tickNumber: number;
}

export interface HookContext {
  tenant: { id: string; name: string; plan: string };
  extension: { id: string; version: string };
  cameras: CameraAPI;
  events: EventAPI;
  notifications: NotificationAPI;
  storage: KeyValueAPI;
  http: HttpAPI;
  logger: Logger;
}

export interface CameraAPI {
  list(): Promise<{ id: string; name: string; status: string }[]>;
  get(id: string): Promise<{ id: string; name: string; status: string } | null>;
  getSnapshot(id: string): Promise<string>;
}

export interface EventAPI {
  query(params: {
    cameraId?: string;
    type?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<unknown[]>;
  create(event: {
    cameraId: string;
    type: string;
    severity: string;
    metadata: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface NotificationAPI {
  sendPush(params: {
    title: string;
    body: string;
    userIds?: string[];
    thumbnailUrl?: string;
  }): Promise<void>;
  sendEmail(params: {
    to: string[];
    subject: string;
    html: string;
  }): Promise<void>;
  sendWebhook(params: {
    url: string;
    method?: "POST" | "PUT";
    headers?: Record<string, string>;
    body: unknown;
  }): Promise<{ status: number; body: unknown }>;
}

export interface KeyValueAPI {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface HttpAPI {
  fetch(
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeoutMs?: number;
    },
  ): Promise<{ status: number; headers: Record<string, string>; body: string }>;
}

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export interface HookResult {
  abort?: boolean;
  data?: Record<string, unknown>;
}
