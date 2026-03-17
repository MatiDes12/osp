import type { Camera, CameraCapabilities, CameraConfig, CameraLocation } from "@osp/shared/types";
import type { OSPEvent } from "@osp/shared/types";
import type { User, UserPreferences } from "@osp/shared/types";
import type { Tenant, TenantSettings, TenantBranding } from "@osp/shared/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformCamera(raw: any): Camera {
  return {
    id: raw.id,
    tenantId: raw.tenant_id ?? raw.tenantId,
    name: raw.name,
    protocol: raw.protocol,
    connectionUri: raw.connection_uri ?? raw.connectionUri,
    status: raw.status,
    location: transformCameraLocation(raw.location ?? {}),
    capabilities: transformCameraCapabilities(raw.capabilities ?? {}),
    config: transformCameraConfig(raw.config ?? {}),
    ptzCapable: raw.ptz_capable ?? raw.ptzCapable ?? false,
    audioCapable: raw.audio_capable ?? raw.audioCapable ?? false,
    firmwareVersion: raw.firmware_version ?? raw.firmwareVersion ?? null,
    manufacturer: raw.manufacturer ?? null,
    model: raw.model ?? null,
    zonesCount: raw.zones_count ?? raw.zonesCount ?? 0,
    lastSeenAt: raw.last_seen_at ?? raw.lastSeenAt ?? null,
    createdAt: raw.created_at ?? raw.createdAt,
    updatedAt: raw.updated_at ?? raw.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformCameraLocation(raw: any): CameraLocation {
  return {
    label: raw.label,
    lat: raw.lat,
    lng: raw.lng,
    floor: raw.floor,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformCameraCapabilities(raw: any): CameraCapabilities {
  return {
    ptz: raw.ptz ?? false,
    audio: raw.audio ?? false,
    twoWayAudio: raw.two_way_audio ?? raw.twoWayAudio ?? false,
    infrared: raw.infrared ?? false,
    resolution: raw.resolution ?? "unknown",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformCameraConfig(raw: any): CameraConfig {
  return {
    recordingMode: raw.recording_mode ?? raw.recordingMode ?? "motion",
    motionSensitivity: raw.motion_sensitivity ?? raw.motionSensitivity ?? 5,
    audioEnabled: raw.audio_enabled ?? raw.audioEnabled ?? false,
  };
}

export function transformCameras(raw: readonly unknown[]): readonly Camera[] {
  return raw.map(transformCamera);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformEvent(raw: any): OSPEvent {
  return {
    id: raw.id,
    cameraId: raw.camera_id ?? raw.cameraId,
    cameraName: raw.camera_name ?? raw.cameraName ?? "Unknown",
    zoneId: raw.zone_id ?? raw.zoneId ?? null,
    zoneName: raw.zone_name ?? raw.zoneName ?? null,
    tenantId: raw.tenant_id ?? raw.tenantId,
    type: raw.type,
    severity: raw.severity,
    detectedAt: raw.detected_at ?? raw.detectedAt,
    metadata: raw.metadata ?? {},
    snapshotUrl: raw.snapshot_url ?? raw.snapshotUrl ?? null,
    clipUrl: raw.clip_url ?? raw.clipUrl ?? null,
    intensity: raw.intensity ?? 0,
    acknowledged: raw.acknowledged ?? false,
    acknowledgedBy: raw.acknowledged_by ?? raw.acknowledgedBy ?? null,
    acknowledgedAt: raw.acknowledged_at ?? raw.acknowledgedAt ?? null,
    createdAt: raw.created_at ?? raw.createdAt,
  };
}

export function transformEvents(raw: readonly unknown[]): readonly OSPEvent[] {
  return raw.map(transformEvent);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformUser(raw: any): User {
  return {
    id: raw.id,
    tenantId: raw.tenant_id ?? raw.tenantId,
    email: raw.email,
    displayName: raw.display_name ?? raw.displayName,
    avatarUrl: raw.avatar_url ?? raw.avatarUrl ?? null,
    authProvider: raw.auth_provider ?? raw.authProvider ?? "email",
    role: raw.role,
    cameraIds: raw.camera_ids ?? raw.cameraIds ?? null,
    preferences: transformUserPreferences(raw.preferences ?? {}),
    lastLoginAt: raw.last_login_at ?? raw.lastLoginAt ?? null,
    createdAt: raw.created_at ?? raw.createdAt,
    updatedAt: raw.updated_at ?? raw.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformUserPreferences(raw: any): UserPreferences {
  return {
    theme: raw.theme ?? "system",
    notificationsEnabled: raw.notifications_enabled ?? raw.notificationsEnabled ?? true,
    defaultGridSize: raw.default_grid_size ?? raw.defaultGridSize ?? 4,
    timezone: raw.timezone ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformTenant(raw: any): Tenant {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    plan: raw.plan,
    settings: transformTenantSettings(raw.settings ?? {}),
    branding: transformTenantBranding(raw.branding ?? {}),
    logoUrl: raw.logo_url ?? raw.logoUrl ?? null,
    customDomain: raw.custom_domain ?? raw.customDomain ?? null,
    maxCameras: raw.max_cameras ?? raw.maxCameras ?? 4,
    maxUsers: raw.max_users ?? raw.maxUsers ?? 2,
    retentionDays: raw.retention_days ?? raw.retentionDays ?? 7,
    createdAt: raw.created_at ?? raw.createdAt,
    updatedAt: raw.updated_at ?? raw.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformTenantSettings(raw: any): TenantSettings {
  return {
    defaultRetentionDays: raw.default_retention_days ?? raw.defaultRetentionDays ?? 7,
    defaultRecordingMode: raw.default_recording_mode ?? raw.defaultRecordingMode ?? "motion",
    defaultMotionSensitivity: raw.default_motion_sensitivity ?? raw.defaultMotionSensitivity ?? 5,
    timezone: raw.timezone ?? "UTC",
    notificationPreferences: {
      emailDigest: raw.notification_preferences?.email_digest
        ?? raw.notificationPreferences?.emailDigest
        ?? "none",
      pushEnabled: raw.notification_preferences?.push_enabled
        ?? raw.notificationPreferences?.pushEnabled
        ?? true,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformTenantBranding(raw: any): TenantBranding {
  return {
    primaryColor: raw.primary_color ?? raw.primaryColor ?? "#3b82f6",
    accentColor: raw.accent_color ?? raw.accentColor ?? "#2563eb",
    fontFamily: raw.font_family ?? raw.fontFamily ?? null,
    faviconUrl: raw.favicon_url ?? raw.faviconUrl ?? null,
  };
}
