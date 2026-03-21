import type {
  Camera,
  CameraProtocol,
  CameraStatus,
  CameraLocation,
  CameraCapabilities,
  CameraConfig,
  CameraZone,
  OSPEvent,
  EventType,
  EventSeverity,
  Recording,
  RecordingTrigger,
  RecordingStatus,
  User,
  UserRole,
  UserPreferences,
} from "@osp/shared";

type RawRow = Record<string, unknown>;

/**
 * Transform JSONB config object -- may be stored with snake_case keys in DB.
 */
function transformConfig(
  raw: Record<string, unknown> | null | undefined,
): CameraConfig {
  if (!raw)
    return { recordingMode: "off", motionSensitivity: 5, audioEnabled: false };
  return {
    recordingMode: (raw.recordingMode ??
      raw.recording_mode ??
      "off") as CameraConfig["recordingMode"],
    motionSensitivity: (raw.motionSensitivity ??
      raw.motion_sensitivity ??
      5) as number,
    audioEnabled: (raw.audioEnabled ?? raw.audio_enabled ?? false) as boolean,
  };
}

/**
 * Transform JSONB capabilities object -- may be stored with snake_case keys in DB.
 */
function transformCapabilities(
  raw: Record<string, unknown> | null | undefined,
): CameraCapabilities {
  if (!raw)
    return {
      ptz: false,
      audio: false,
      twoWayAudio: false,
      infrared: false,
      resolution: "unknown",
    };
  return {
    ptz: (raw.ptz as boolean) ?? false,
    audio: (raw.audio as boolean) ?? false,
    twoWayAudio: (raw.twoWayAudio ?? raw.two_way_audio ?? false) as boolean,
    infrared: (raw.infrared as boolean) ?? false,
    resolution: (raw.resolution as string) ?? "unknown",
  };
}

/**
 * Convert snake_case Supabase camera row to camelCase Camera type.
 */
export function transformCamera(raw: RawRow): Camera {
  return {
    id: raw.id as string,
    tenantId: raw.tenant_id as string,
    name: raw.name as string,
    protocol: raw.protocol as CameraProtocol,
    connectionUri: raw.connection_uri as string,
    status: raw.status as CameraStatus,
    location: (raw.location as CameraLocation) ?? {},
    capabilities: transformCapabilities(
      raw.capabilities as Record<string, unknown> | null,
    ),
    config: transformConfig(raw.config as Record<string, unknown> | null),
    ptzCapable: (raw.ptz_capable as boolean) ?? false,
    audioCapable: (raw.audio_capable as boolean) ?? false,
    firmwareVersion: (raw.firmware_version as string | null) ?? null,
    manufacturer: (raw.manufacturer as string | null) ?? null,
    model: (raw.model as string | null) ?? null,
    locationId: (raw.location_id as string | null) ?? null,
    zonesCount: (raw.zones_count as number) ?? 0,
    lastSeenAt: (raw.last_seen_at as string | null) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

/**
 * Convert snake_case Supabase camera_zones row to camelCase CameraZone type.
 */
function transformZone(raw: RawRow): CameraZone {
  return {
    id: raw.id as string,
    cameraId: raw.camera_id as string,
    tenantId: raw.tenant_id as string,
    name: raw.name as string,
    polygonCoordinates:
      (raw.polygon_coordinates as { x: number; y: number }[]) ?? [],
    alertEnabled: (raw.alert_enabled as boolean) ?? true,
    sensitivity: (raw.sensitivity as number) ?? 5,
    colorHex: (raw.color_hex as string) ?? "#FF0000",
    visibleToRoles: (raw.visible_to_roles as string[]) ?? [],
    sortOrder: (raw.sort_order as number) ?? 0,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

/**
 * Convert snake_case Supabase events row to camelCase OSPEvent type.
 */
function transformEvent(raw: RawRow): OSPEvent {
  return {
    id: raw.id as string,
    cameraId: raw.camera_id as string,
    cameraName: (raw.camera_name as string) ?? "",
    zoneId: (raw.zone_id as string | null) ?? null,
    zoneName: (raw.zone_name as string | null) ?? null,
    tenantId: raw.tenant_id as string,
    type: raw.type as EventType,
    severity: raw.severity as EventSeverity,
    detectedAt: raw.detected_at as string,
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
    snapshotUrl:
      (raw.snapshot_url as string | null) ??
      ((raw.metadata as Record<string, unknown> | null)?.snapshotUrl as
        | string
        | null) ??
      null,
    clipUrl:
      (raw.clip_url as string | null) ??
      (raw.clip_path
        ? `${typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000") : ""}/api/v1/events/${raw.id as string}/clip`
        : null),
    intensity: (raw.intensity as number) ?? 0,
    acknowledged: (raw.acknowledged as boolean) ?? false,
    acknowledgedBy: (raw.acknowledged_by as string | null) ?? null,
    acknowledgedAt: (raw.acknowledged_at as string | null) ?? null,
    createdAt: raw.created_at as string,
  };
}

/**
 * Convert snake_case Supabase recordings row to camelCase Recording type.
 */
function transformRecording(raw: RawRow): Recording {
  return {
    id: raw.id as string,
    cameraId: raw.camera_id as string,
    cameraName: (raw.camera_name as string) ?? "",
    tenantId: raw.tenant_id as string,
    startTime: (raw.start_time as string) ?? (raw.started_at as string) ?? "",
    endTime: (raw.end_time as string) ?? (raw.ended_at as string) ?? "",
    durationSec: (raw.duration_sec as number) ?? 0,
    sizeBytes: (raw.size_bytes as number) ?? 0,
    format: (raw.format as string) ?? "mp4",
    trigger: (raw.trigger as RecordingTrigger) ?? "motion",
    status: (raw.status as RecordingStatus) ?? "complete",
    playbackUrl: (raw.playback_url as string) ?? "",
    thumbnailUrl: (raw.thumbnail_url as string | null) ?? null,
    retentionUntil: (raw.retention_until as string) ?? "",
    createdAt: raw.created_at as string,
  };
}

/**
 * Convert snake_case Supabase users row (with joined role) to camelCase User type.
 */
function transformUser(raw: RawRow): User {
  return {
    id: raw.id as string,
    tenantId: raw.tenant_id as string,
    email: raw.email as string,
    displayName: (raw.display_name as string) ?? "",
    avatarUrl: (raw.avatar_url as string | null) ?? null,
    authProvider: (raw.auth_provider as string) ?? "email",
    role: (raw.role as UserRole) ?? "viewer",
    cameraIds: (raw.camera_ids as string[] | null) ?? null,
    preferences: (raw.preferences as UserPreferences) ?? {
      theme: "dark",
      notificationsEnabled: true,
      defaultGridSize: 4,
      timezone: null,
    },
    lastLoginAt: (raw.last_login_at as string | null) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

/**
 * Determine if a value looks like a snake_case DB row (has snake_case keys)
 * vs an already-transformed camelCase object.
 */
export function isSnakeCaseRow(obj: RawRow): boolean {
  return "tenant_id" in obj || "created_at" in obj || "camera_id" in obj;
}

/**
 * Transform an array of raw rows, auto-detecting if transformation is needed.
 */
export function transformCameras(rows: readonly RawRow[]): Camera[] {
  return rows.map((r) =>
    isSnakeCaseRow(r) ? transformCamera(r) : (r as unknown as Camera),
  );
}

export function transformEvents(rows: readonly RawRow[]): OSPEvent[] {
  return rows.map((r) =>
    isSnakeCaseRow(r) ? transformEvent(r) : (r as unknown as OSPEvent),
  );
}

export function transformRecordings(rows: readonly RawRow[]): Recording[] {
  return rows.map((r) =>
    isSnakeCaseRow(r) ? transformRecording(r) : (r as unknown as Recording),
  );
}

export function transformZones(rows: readonly RawRow[]): CameraZone[] {
  return rows.map((r) =>
    isSnakeCaseRow(r) ? transformZone(r) : (r as unknown as CameraZone),
  );
}

export function transformUsers(rows: readonly RawRow[]): User[] {
  return rows.map((r) =>
    isSnakeCaseRow(r) ? transformUser(r) : (r as unknown as User),
  );
}
