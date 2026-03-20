import type { Camera, CameraCapabilities, CameraConfig, CameraLocation } from "@osp/shared/types";
import type { OSPEvent } from "@osp/shared/types";
import type { User, UserPreferences } from "@osp/shared/types";
import type { Tenant, TenantSettings, TenantBranding } from "@osp/shared/types";

type Raw = Record<string, unknown>;

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" ? v : typeof v === "string" ? (Number.parseFloat(v) || fallback) : fallback;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function pick<T>(a: unknown, b: unknown, fallback: T): T {
  if (a !== undefined && a !== null) return a as T;
  if (b !== undefined && b !== null) return b as T;
  return fallback;
}

export function transformCamera(raw: Raw): Camera {
  return {
    id: str(raw["id"]),
    tenantId: str(pick(raw["tenant_id"], raw["tenantId"], "")),
    name: str(raw["name"]),
    protocol: str(raw["protocol"]),
    connectionUri: str(pick(raw["connection_uri"], raw["connectionUri"], "")),
    status: str(raw["status"]) as Camera["status"],
    location: transformCameraLocation((raw["location"] as Raw | undefined) ?? {}),
    capabilities: transformCameraCapabilities((raw["capabilities"] as Raw | undefined) ?? {}),
    config: transformCameraConfig((raw["config"] as Raw | undefined) ?? {}),
    ptzCapable: bool(pick(raw["ptz_capable"], raw["ptzCapable"], false)),
    audioCapable: bool(pick(raw["audio_capable"], raw["audioCapable"], false)),
    firmwareVersion: (pick(raw["firmware_version"], raw["firmwareVersion"], null) as string | null),
    manufacturer: (raw["manufacturer"] as string | null) ?? null,
    model: (raw["model"] as string | null) ?? null,
    zonesCount: num(pick(raw["zones_count"], raw["zonesCount"], 0)),
    lastSeenAt: (pick(raw["last_seen_at"], raw["lastSeenAt"], null) as string | null),
    createdAt: str(pick(raw["created_at"], raw["createdAt"], "")),
    updatedAt: str(pick(raw["updated_at"], raw["updatedAt"], "")),
  };
}

function transformCameraLocation(raw: Raw): CameraLocation {
  return {
    label: raw["label"] as string | undefined,
    lat: raw["lat"] as number | undefined,
    lng: raw["lng"] as number | undefined,
    floor: raw["floor"] as number | undefined,
  };
}

function transformCameraCapabilities(raw: Raw): CameraCapabilities {
  return {
    ptz: bool(raw["ptz"]),
    audio: bool(raw["audio"]),
    twoWayAudio: bool(pick(raw["two_way_audio"], raw["twoWayAudio"], false)),
    infrared: bool(raw["infrared"]),
    resolution: str(raw["resolution"], "unknown"),
  };
}

function transformCameraConfig(raw: Raw): CameraConfig {
  return {
    recordingMode: str(pick(raw["recording_mode"], raw["recordingMode"], "motion")) as CameraConfig["recordingMode"],
    motionSensitivity: num(pick(raw["motion_sensitivity"], raw["motionSensitivity"], 5)),
    audioEnabled: bool(pick(raw["audio_enabled"], raw["audioEnabled"], false)),
  };
}

export function transformCameras(raw: readonly unknown[]): readonly Camera[] {
  return raw.map((r) => transformCamera(r as Raw));
}

export function transformEvent(raw: Raw): OSPEvent {
  return {
    id: str(raw["id"]),
    cameraId: str(pick(raw["camera_id"], raw["cameraId"], "")),
    cameraName: str(pick(raw["camera_name"], raw["cameraName"], "Unknown")),
    zoneId: (pick(raw["zone_id"], raw["zoneId"], null) as string | null),
    zoneName: (pick(raw["zone_name"], raw["zoneName"], null) as string | null),
    tenantId: str(pick(raw["tenant_id"], raw["tenantId"], "")),
    type: str(raw["type"]) as OSPEvent["type"],
    severity: str(raw["severity"]) as OSPEvent["severity"],
    detectedAt: str(pick(raw["detected_at"], raw["detectedAt"], "")),
    metadata: (raw["metadata"] as Record<string, unknown>) ?? {},
    snapshotUrl: (pick(raw["snapshot_url"], raw["snapshotUrl"], null) as string | null),
    clipUrl: (pick(raw["clip_url"], raw["clipUrl"], null) as string | null),
    intensity: num(raw["intensity"]),
    acknowledged: bool(raw["acknowledged"]),
    acknowledgedBy: (pick(raw["acknowledged_by"], raw["acknowledgedBy"], null) as string | null),
    acknowledgedAt: (pick(raw["acknowledged_at"], raw["acknowledgedAt"], null) as string | null),
    createdAt: str(pick(raw["created_at"], raw["createdAt"], "")),
  };
}

export function transformEvents(raw: readonly unknown[]): readonly OSPEvent[] {
  return raw.map((r) => transformEvent(r as Raw));
}

export function transformUser(raw: Raw): User {
  return {
    id: str(raw["id"]),
    tenantId: str(pick(raw["tenant_id"], raw["tenantId"], "")),
    email: str(raw["email"]),
    displayName: str(pick(raw["display_name"], raw["displayName"], "")),
    avatarUrl: (pick(raw["avatar_url"], raw["avatarUrl"], null) as string | null),
    authProvider: str(pick(raw["auth_provider"], raw["authProvider"], "email")),
    role: str(raw["role"]) as User["role"],
    cameraIds: (pick(raw["camera_ids"], raw["cameraIds"], null) as string[] | null),
    preferences: transformUserPreferences((raw["preferences"] as Raw | undefined) ?? {}),
    lastLoginAt: (pick(raw["last_login_at"], raw["lastLoginAt"], null) as string | null),
    createdAt: str(pick(raw["created_at"], raw["createdAt"], "")),
    updatedAt: str(pick(raw["updated_at"], raw["updatedAt"], "")),
  };
}

function transformUserPreferences(raw: Raw): UserPreferences {
  return {
    theme: str(pick(raw["theme"], raw["theme"], "system")) as UserPreferences["theme"],
    notificationsEnabled: bool(pick(raw["notifications_enabled"], raw["notificationsEnabled"], true)),
    defaultGridSize: num(pick(raw["default_grid_size"], raw["defaultGridSize"], 4)),
    timezone: (raw["timezone"] as string | null) ?? null,
  };
}

export function transformTenant(raw: Raw): Tenant {
  return {
    id: str(raw["id"]),
    name: str(raw["name"]),
    slug: str(raw["slug"]),
    plan: str(raw["plan"]) as Tenant["plan"],
    settings: transformTenantSettings((raw["settings"] as Raw | undefined) ?? {}),
    branding: transformTenantBranding((raw["branding"] as Raw | undefined) ?? {}),
    logoUrl: (pick(raw["logo_url"], raw["logoUrl"], null) as string | null),
    customDomain: (pick(raw["custom_domain"], raw["customDomain"], null) as string | null),
    maxCameras: num(pick(raw["max_cameras"], raw["maxCameras"], 4)),
    maxUsers: num(pick(raw["max_users"], raw["maxUsers"], 2)),
    retentionDays: num(pick(raw["retention_days"], raw["retentionDays"], 7)),
    createdAt: str(pick(raw["created_at"], raw["createdAt"], "")),
    updatedAt: str(pick(raw["updated_at"], raw["updatedAt"], "")),
  };
}

function transformTenantSettings(raw: Raw): TenantSettings {
  const notifPrefs = (pick(raw["notification_preferences"], raw["notificationPreferences"], {}) as Raw);
  return {
    defaultRetentionDays: num(pick(raw["default_retention_days"], raw["defaultRetentionDays"], 7)),
    defaultRecordingMode: str(pick(raw["default_recording_mode"], raw["defaultRecordingMode"], "motion")) as TenantSettings["defaultRecordingMode"],
    defaultMotionSensitivity: num(pick(raw["default_motion_sensitivity"], raw["defaultMotionSensitivity"], 5)),
    timezone: str(raw["timezone"], "UTC"),
    notificationPreferences: {
      emailDigest: str(pick(notifPrefs["email_digest"], notifPrefs["emailDigest"], "none")) as TenantSettings["notificationPreferences"]["emailDigest"],
      pushEnabled: bool(pick(notifPrefs["push_enabled"], notifPrefs["pushEnabled"], true)),
    },
  };
}

function transformTenantBranding(raw: Raw): TenantBranding {
  return {
    primaryColor: str(pick(raw["primary_color"], raw["primaryColor"], "#3b82f6")),
    accentColor: str(pick(raw["accent_color"], raw["accentColor"], "#2563eb")),
    fontFamily: (pick(raw["font_family"], raw["fontFamily"], null) as string | null),
    faviconUrl: (pick(raw["favicon_url"], raw["faviconUrl"], null) as string | null),
  };
}
