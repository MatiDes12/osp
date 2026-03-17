# Open Surveillance Platform (OSP) — Technical Design Document

**Version**: 1.0
**Date**: 2026-03-16
**Status**: Draft — Pending Review
**Depends on**: [PRD v1.0](./PRD.md) (Approved), [System Architecture v1.0](./SYSTEM-ARCHITECTURE.md) (Approved)

---

## Table of Contents

1. [Data Models (ERD)](#1-data-models-erd)
2. [API Design](#2-api-design)
3. [Video Pipeline Technical Design](#3-video-pipeline-technical-design)
4. [Extension SDK Design](#4-extension-sdk-design)
5. [Security Design](#5-security-design)
6. [Caching Strategy](#6-caching-strategy)

---

## 1. Data Models (ERD)

### 1.1 Entity Relationship Diagram

```mermaid
erDiagram
    tenants ||--o{ users : "has"
    tenants ||--o{ cameras : "owns"
    tenants ||--o{ alert_rules : "configures"
    tenants ||--o{ tenant_extensions : "installs"

    users ||--o{ user_roles : "assigned"
    users ||--o{ notifications : "receives"

    cameras ||--o{ camera_zones : "defines"
    cameras ||--o{ recordings : "produces"
    cameras ||--o{ snapshots : "captures"
    cameras ||--o{ events : "generates"

    camera_zones ||--o{ events : "triggers in"

    recordings ||--o{ snapshots : "contains"

    events ||--o{ notifications : "dispatches"

    extensions ||--o{ tenant_extensions : "installed as"
    extensions ||--o{ extension_hooks : "registers"

    tenants {
        uuid id PK
        text name
        text slug UK
        tenant_plan plan
        jsonb settings
        jsonb branding
        text logo_url
        text custom_domain
        int max_cameras
        int max_users
        int retention_days
        timestamp created_at
        timestamp updated_at
    }

    users {
        uuid id PK
        uuid tenant_id FK
        text email UK
        text display_name
        text avatar_url
        text auth_provider
        jsonb preferences
        timestamp last_login_at
        timestamp created_at
        timestamp updated_at
    }

    user_roles {
        uuid id PK
        uuid user_id FK
        uuid tenant_id FK
        user_role role
        uuid[] camera_ids
        timestamp created_at
    }

    cameras {
        uuid id PK
        uuid tenant_id FK
        text name
        camera_protocol protocol
        text connection_uri
        camera_status status
        jsonb location
        jsonb capabilities
        jsonb config
        boolean ptz_capable
        boolean audio_capable
        text firmware_version
        text manufacturer
        text model
        timestamp last_seen_at
        timestamp created_at
        timestamp updated_at
    }

    camera_zones {
        uuid id PK
        uuid camera_id FK
        uuid tenant_id FK
        text name
        jsonb polygon_coordinates
        boolean alert_enabled
        int sensitivity
        text[] visible_to_roles
        text color_hex
        int sort_order
        timestamp created_at
        timestamp updated_at
    }

    recordings {
        uuid id PK
        uuid camera_id FK
        uuid tenant_id FK
        timestamp start_time
        timestamp end_time
        int duration_sec
        text storage_path
        bigint size_bytes
        text format
        recording_trigger trigger
        recording_status status
        timestamp retention_until
        timestamp created_at
    }

    snapshots {
        uuid id PK
        uuid camera_id FK
        uuid recording_id FK
        uuid tenant_id FK
        timestamp captured_at
        text storage_path
        jsonb ai_tags
        int width_px
        int height_px
        int size_bytes
        timestamp created_at
    }

    events {
        uuid id PK
        uuid camera_id FK
        uuid zone_id FK
        uuid tenant_id FK
        event_type type
        event_severity severity
        timestamp detected_at
        jsonb metadata
        uuid snapshot_id FK
        text clip_path
        float intensity
        boolean acknowledged
        uuid acknowledged_by FK
        timestamp acknowledged_at
        timestamp created_at
    }

    alert_rules {
        uuid id PK
        uuid tenant_id FK
        text name
        text description
        event_type trigger_event
        jsonb conditions
        jsonb actions
        boolean enabled
        jsonb schedule
        uuid[] camera_ids
        uuid[] zone_ids
        int cooldown_sec
        int priority
        timestamp last_triggered_at
        timestamp created_at
        timestamp updated_at
    }

    notifications {
        uuid id PK
        uuid user_id FK
        uuid event_id FK
        uuid tenant_id FK
        notification_channel channel
        notification_status status
        text title
        text body
        text thumbnail_url
        jsonb payload
        timestamp sent_at
        timestamp read_at
        timestamp created_at
    }

    extensions {
        uuid id PK
        text name UK
        text version
        text author_name
        text author_email
        text description
        jsonb manifest
        extension_status status
        text marketplace_url
        text wasm_bundle_url
        text icon_url
        text[] categories
        int install_count
        float avg_rating
        timestamp published_at
        timestamp created_at
        timestamp updated_at
    }

    tenant_extensions {
        uuid id PK
        uuid tenant_id FK
        uuid extension_id FK
        jsonb config
        boolean enabled
        text installed_version
        text[] previous_versions
        jsonb resource_usage
        timestamp installed_at
        timestamp updated_at
    }

    extension_hooks {
        uuid id PK
        uuid extension_id FK
        text hook_name
        int priority
        text handler_function
        text[] required_permissions
        timestamp created_at
    }
```

### 1.2 Enum Definitions

```sql
-- Tenant plan tiers
CREATE TYPE tenant_plan AS ENUM (
  'free', 'pro', 'business', 'enterprise'
);

-- User roles within a tenant
CREATE TYPE user_role AS ENUM (
  'owner', 'admin', 'operator', 'viewer'
);

-- Camera connection protocols
CREATE TYPE camera_protocol AS ENUM (
  'rtsp', 'onvif', 'webrtc', 'usb', 'ip'
);

-- Camera operational status
CREATE TYPE camera_status AS ENUM (
  'online', 'offline', 'connecting', 'error', 'disabled'
);

-- What triggered a recording
CREATE TYPE recording_trigger AS ENUM (
  'motion', 'continuous', 'manual', 'rule', 'ai_detection'
);

-- Recording pipeline status
CREATE TYPE recording_status AS ENUM (
  'recording', 'complete', 'partial', 'failed', 'deleted'
);

-- Event classification
CREATE TYPE event_type AS ENUM (
  'motion', 'person', 'vehicle', 'animal',
  'camera_offline', 'camera_online',
  'tampering', 'audio', 'custom'
);

-- Event urgency
CREATE TYPE event_severity AS ENUM (
  'low', 'medium', 'high', 'critical'
);

-- How a notification is delivered
CREATE TYPE notification_channel AS ENUM (
  'push', 'email', 'webhook', 'sms', 'in_app'
);

-- Notification delivery status
CREATE TYPE notification_status AS ENUM (
  'pending', 'sent', 'delivered', 'failed', 'read'
);

-- Extension marketplace status
CREATE TYPE extension_status AS ENUM (
  'draft', 'review', 'published', 'suspended', 'deprecated'
);
```

### 1.3 Key Indexes

```sql
-- Tenants
CREATE UNIQUE INDEX idx_tenants_slug ON tenants (slug);

-- Users
CREATE UNIQUE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_tenant ON users (tenant_id);

-- User Roles (composite for fast permission checks)
CREATE UNIQUE INDEX idx_user_roles_user_tenant ON user_roles (user_id, tenant_id);
CREATE INDEX idx_user_roles_tenant_role ON user_roles (tenant_id, role);

-- Cameras
CREATE INDEX idx_cameras_tenant ON cameras (tenant_id);
CREATE INDEX idx_cameras_tenant_status ON cameras (tenant_id, status);

-- Camera Zones
CREATE INDEX idx_zones_camera ON camera_zones (camera_id);
CREATE INDEX idx_zones_tenant ON camera_zones (tenant_id);

-- Recordings (heavy query: "show recordings for camera X on date Y")
CREATE INDEX idx_recordings_camera_time ON recordings (camera_id, start_time DESC);
CREATE INDEX idx_recordings_tenant_time ON recordings (tenant_id, start_time DESC);
CREATE INDEX idx_recordings_retention ON recordings (retention_until)
  WHERE status != 'deleted';

-- Snapshots
CREATE INDEX idx_snapshots_camera_time ON snapshots (camera_id, captured_at DESC);
CREATE INDEX idx_snapshots_recording ON snapshots (recording_id);

-- Events (heavy query: "show events for tenant, filtered by type and time")
CREATE INDEX idx_events_tenant_time ON events (tenant_id, detected_at DESC);
CREATE INDEX idx_events_camera_time ON events (camera_id, detected_at DESC);
CREATE INDEX idx_events_tenant_type_time ON events (tenant_id, type, detected_at DESC);
CREATE INDEX idx_events_zone ON events (zone_id, detected_at DESC);
CREATE INDEX idx_events_unacknowledged ON events (tenant_id, detected_at DESC)
  WHERE acknowledged = false;

-- Alert Rules
CREATE INDEX idx_rules_tenant_enabled ON alert_rules (tenant_id)
  WHERE enabled = true;

-- Notifications
CREATE INDEX idx_notifications_user_time ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (user_id, created_at DESC)
  WHERE status != 'read';

-- Tenant Extensions
CREATE UNIQUE INDEX idx_tenant_ext_unique ON tenant_extensions (tenant_id, extension_id);
CREATE INDEX idx_tenant_ext_tenant ON tenant_extensions (tenant_id)
  WHERE enabled = true;

-- Extension Hooks
CREATE INDEX idx_ext_hooks_name ON extension_hooks (hook_name, priority);
```

### 1.4 Table Partitioning Strategy

For tables that grow unbounded (events, recordings, snapshots, notifications):

```sql
-- Events: partition by month for fast time-range queries + efficient retention cleanup
CREATE TABLE events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  detected_at timestamptz NOT NULL,
  -- ... all other columns
  PRIMARY KEY (id, detected_at)
) PARTITION BY RANGE (detected_at);

-- Create monthly partitions (automated via pg_partman or cron)
CREATE TABLE events_2026_03 PARTITION OF events
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE events_2026_04 PARTITION OF events
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Same pattern for recordings, snapshots, notifications
-- Drop old partitions for retention: DROP TABLE events_2025_12;
```

---

## 2. API Design

### 2.1 Common Types

```typescript
// ── Envelope ──
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  meta?: PaginationMeta;
}

interface ApiError {
  code: string;          // e.g. "CAMERA_NOT_FOUND"
  message: string;       // Human-readable
  details?: unknown;     // Validation errors, etc.
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

// ── Query helpers ──
interface PaginationParams {
  page?: number;         // Default 1
  limit?: number;        // Default 20, max 100
}

interface TimeRangeParams {
  from?: string;         // ISO 8601
  to?: string;           // ISO 8601
}

// ── Common ID types ──
type UUID = string;
type ISOTimestamp = string;
```

### 2.2 Auth Endpoints — `/api/v1/auth/*`

| Method | Path | Description | Auth | Rate Limit |
|--------|------|-------------|------|------------|
| POST | `/auth/register` | Create account + tenant | None | 5/min/IP |
| POST | `/auth/login` | Email/password login | None | 10/min/IP |
| POST | `/auth/refresh` | Refresh access token | Refresh token | 30/min/user |
| POST | `/auth/logout` | Invalidate refresh token | Any role | 10/min/user |
| POST | `/auth/forgot-password` | Send reset email | None | 3/min/IP |
| POST | `/auth/reset-password` | Set new password | Reset token | 5/min/IP |
| GET | `/auth/sso/:provider` | Initiate SSO flow | None | 10/min/IP |
| POST | `/auth/sso/callback` | SSO callback handler | None | 10/min/IP |

```typescript
// POST /auth/register
interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
  tenant_name: string;       // Creates new tenant
}
interface RegisterResponse {
  user: { id: UUID; email: string; display_name: string };
  tenant: { id: UUID; name: string; slug: string };
  access_token: string;
  refresh_token: string;
  expires_at: ISOTimestamp;
}

// POST /auth/login
interface LoginRequest {
  email: string;
  password: string;
}
interface LoginResponse {
  user: { id: UUID; email: string; display_name: string; role: UserRole };
  tenant: { id: UUID; name: string; plan: TenantPlan };
  access_token: string;
  refresh_token: string;
  expires_at: ISOTimestamp;
}

// POST /auth/refresh
interface RefreshRequest {
  refresh_token: string;
}
interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_at: ISOTimestamp;
}
```

### 2.3 Camera Endpoints — `/api/v1/cameras/*`

| Method | Path | Description | Auth | Rate Limit |
|--------|------|-------------|------|------------|
| GET | `/cameras` | List tenant cameras | Viewer+ | 60/min |
| POST | `/cameras` | Add camera | Admin+ | 10/min |
| GET | `/cameras/:id` | Get camera details | Viewer+ (scoped) | 60/min |
| PATCH | `/cameras/:id` | Update camera config | Admin+ | 20/min |
| DELETE | `/cameras/:id` | Remove camera | Admin+ | 10/min |
| POST | `/cameras/discover` | ONVIF LAN discovery | Admin+ | 5/min |
| GET | `/cameras/:id/stream` | Get WebRTC stream URL | Viewer+ (scoped) | 30/min |
| POST | `/cameras/:id/ptz` | PTZ control command | Operator+ | 120/min |
| GET | `/cameras/:id/snapshot` | Get current snapshot | Viewer+ (scoped) | 30/min |
| POST | `/cameras/:id/reconnect` | Force reconnect | Admin+ | 5/min |

```typescript
// GET /cameras?status=online&page=1&limit=20
interface ListCamerasParams extends PaginationParams {
  status?: CameraStatus;
  protocol?: CameraProtocol;
  search?: string;            // Search by name
}
interface CameraResponse {
  id: UUID;
  name: string;
  protocol: CameraProtocol;
  status: CameraStatus;
  location: { label?: string; lat?: number; lng?: number; floor?: string };
  capabilities: {
    ptz: boolean;
    audio: boolean;
    two_way_audio: boolean;
    infrared: boolean;
    resolution: string;       // e.g. "1920x1080"
  };
  zones_count: number;
  last_seen_at: ISOTimestamp | null;
  created_at: ISOTimestamp;
}

// POST /cameras
interface CreateCameraRequest {
  name: string;
  protocol: 'rtsp' | 'onvif';
  connection_uri: string;       // rtsp://user:pass@192.168.1.100:554/stream
  location?: { label?: string; lat?: number; lng?: number; floor?: string };
  config?: {
    recording_mode?: 'motion' | 'continuous' | 'off';
    motion_sensitivity?: number;  // 1–10
    audio_enabled?: boolean;
  };
}
interface CreateCameraResponse {
  camera: CameraResponse;
  stream_test: {
    connected: boolean;
    resolution: string | null;
    codec: string | null;
    error: string | null;
  };
}

// POST /cameras/discover
interface DiscoverResponse {
  cameras: {
    ip: string;
    port: number;
    manufacturer: string;
    model: string;
    name: string;
    rtsp_url: string;
    onvif_url: string;
    already_added: boolean;
  }[];
  scan_duration_ms: number;
}

// GET /cameras/:id/stream
interface StreamResponse {
  whep_url: string;             // WebRTC WHEP endpoint
  token: string;                // One-time auth token (30s TTL)
  fallback_hls_url: string;     // HLS fallback if WebRTC fails
  ice_servers: {
    urls: string[];
    username?: string;
    credential?: string;
  }[];
}

// POST /cameras/:id/ptz
interface PTZRequest {
  action: 'move' | 'zoom' | 'preset' | 'stop';
  pan?: number;                 // -1.0 to 1.0
  tilt?: number;                // -1.0 to 1.0
  zoom?: number;                // -1.0 to 1.0
  preset_id?: string;
  speed?: number;               // 0.1 to 1.0
}
```

### 2.4 Camera Zone Endpoints — `/api/v1/cameras/:id/zones/*`

| Method | Path | Description | Auth | Rate Limit |
|--------|------|-------------|------|------------|
| GET | `/cameras/:id/zones` | List zones for camera | Viewer+ | 60/min |
| POST | `/cameras/:id/zones` | Create zone | Admin+ | 20/min |
| PATCH | `/cameras/:id/zones/:zoneId` | Update zone | Admin+ | 20/min |
| DELETE | `/cameras/:id/zones/:zoneId` | Delete zone | Admin+ | 20/min |

```typescript
// POST /cameras/:id/zones
interface CreateZoneRequest {
  name: string;
  polygon_coordinates: { x: number; y: number }[];   // Normalized 0–1
  alert_enabled: boolean;
  sensitivity?: number;           // 1–10, default 5
  color_hex?: string;             // Display color, e.g. "#FF0000"
  visible_to_roles?: UserRole[];  // Default: all roles
}
interface ZoneResponse {
  id: UUID;
  camera_id: UUID;
  name: string;
  polygon_coordinates: { x: number; y: number }[];
  alert_enabled: boolean;
  sensitivity: number;
  color_hex: string;
  visible_to_roles: UserRole[];
  sort_order: number;
  created_at: ISOTimestamp;
}
```

### 2.5 Recording Endpoints — `/api/v1/recordings/*`

| Method | Path | Description | Auth | Rate Limit |
|--------|------|-------------|------|------------|
| GET | `/recordings` | List recordings | Viewer+ (scoped) | 60/min |
| GET | `/recordings/:id` | Get recording details + playback URL | Viewer+ (scoped) | 60/min |
| GET | `/recordings/:id/download` | Get signed download URL | Operator+ | 10/min |
| DELETE | `/recordings/:id` | Delete recording | Admin+ | 10/min |
| GET | `/recordings/timeline` | Timeline data for a camera + date range | Viewer+ (scoped) | 30/min |

```typescript
// GET /recordings?camera_id=xxx&from=...&to=...&trigger=motion&page=1
interface ListRecordingsParams extends PaginationParams, TimeRangeParams {
  camera_id?: UUID;
  trigger?: RecordingTrigger;
  status?: RecordingStatus;
  min_duration_sec?: number;
}
interface RecordingResponse {
  id: UUID;
  camera_id: UUID;
  camera_name: string;
  start_time: ISOTimestamp;
  end_time: ISOTimestamp;
  duration_sec: number;
  size_bytes: number;
  format: string;
  trigger: RecordingTrigger;
  status: RecordingStatus;
  playback_url: string;         // Signed HLS URL (1h TTL)
  thumbnail_url: string | null; // Signed snapshot URL
  retention_until: ISOTimestamp;
  created_at: ISOTimestamp;
}

// GET /recordings/timeline?camera_id=xxx&date=2026-03-16
interface TimelineParams {
  camera_id: UUID;
  date: string;                 // YYYY-MM-DD
}
interface TimelineResponse {
  date: string;
  camera_id: UUID;
  segments: {
    start_time: ISOTimestamp;
    end_time: ISOTimestamp;
    trigger: RecordingTrigger;
    recording_id: UUID;
    has_events: boolean;
  }[];
  events: {
    timestamp: ISOTimestamp;
    type: EventType;
    severity: EventSeverity;
    event_id: UUID;
    thumbnail_url: string | null;
  }[];
}
```

### 2.6 Event Endpoints — `/api/v1/events/*`

| Method | Path | Description | Auth | Rate Limit |
|--------|------|-------------|------|------------|
| GET | `/events` | List events (paginated, filterable) | Viewer+ (scoped) | 60/min |
| GET | `/events/:id` | Get event details | Viewer+ (scoped) | 60/min |
| PATCH | `/events/:id/acknowledge` | Acknowledge event | Operator+ | 30/min |
| POST | `/events/bulk-acknowledge` | Acknowledge multiple events | Operator+ | 10/min |
| GET | `/events/summary` | Event counts by type/severity/camera | Viewer+ | 30/min |

```typescript
// GET /events?camera_id=xxx&type=motion&severity=high&from=...&to=...
interface ListEventsParams extends PaginationParams, TimeRangeParams {
  camera_id?: UUID;
  zone_id?: UUID;
  type?: EventType;
  severity?: EventSeverity;
  acknowledged?: boolean;
}
interface EventResponse {
  id: UUID;
  camera_id: UUID;
  camera_name: string;
  zone_id: UUID | null;
  zone_name: string | null;
  type: EventType;
  severity: EventSeverity;
  detected_at: ISOTimestamp;
  metadata: Record<string, unknown>;
  snapshot_url: string | null;
  clip_url: string | null;
  intensity: number;
  acknowledged: boolean;
  acknowledged_by: UUID | null;
  acknowledged_at: ISOTimestamp | null;
}

// POST /events/bulk-acknowledge
interface BulkAcknowledgeRequest {
  event_ids: UUID[];            // Max 100
}
interface BulkAcknowledgeResponse {
  acknowledged_count: number;
  failed_ids: UUID[];
}

// GET /events/summary?from=...&to=...
interface EventSummaryResponse {
  period: { from: ISOTimestamp; to: ISOTimestamp };
  by_type: Record<EventType, number>;
  by_severity: Record<EventSeverity, number>;
  by_camera: { camera_id: UUID; camera_name: string; count: number }[];
  total: number;
  unacknowledged: number;
}
```

### 2.7 Alert Rule Endpoints — `/api/v1/rules/*`

| Method | Path | Description | Auth | Rate Limit |
|--------|------|-------------|------|------------|
| GET | `/rules` | List alert rules | Operator+ | 60/min |
| POST | `/rules` | Create alert rule | Admin+ | 10/min |
| GET | `/rules/:id` | Get rule details | Operator+ | 60/min |
| PATCH | `/rules/:id` | Update rule | Admin+ | 20/min |
| DELETE | `/rules/:id` | Delete rule | Admin+ | 10/min |
| POST | `/rules/:id/test` | Test rule against recent events | Admin+ | 5/min |
| GET | `/rules/:id/history` | Rule trigger history | Operator+ | 30/min |

```typescript
// POST /rules
interface CreateRuleRequest {
  name: string;
  description?: string;
  trigger_event: EventType;
  conditions: ConditionNode;
  actions: RuleAction[];
  camera_ids?: UUID[];          // null = all cameras
  zone_ids?: UUID[];            // null = all zones
  schedule?: RuleSchedule;
  cooldown_sec?: number;        // Default 60
  enabled?: boolean;            // Default true
}

interface ConditionNode {
  operator: 'AND' | 'OR';
  children: (ConditionLeaf | ConditionNode)[];
}

interface ConditionLeaf {
  field: string;                // e.g. "data.intensity", "metadata.timestamp.hour"
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'not_contains' | 'in';
  value: string | number | boolean | string[];
}

interface RuleAction {
  type: 'push_notification' | 'email' | 'webhook' | 'start_recording' | 'extension_hook';
  config: Record<string, unknown>;
}

interface RuleSchedule {
  timezone: string;             // IANA timezone
  active_periods: {
    days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
    start: string;              // HH:MM
    end: string;                // HH:MM (can be < start for overnight)
  }[];
}

interface RuleResponse {
  id: UUID;
  name: string;
  description: string | null;
  trigger_event: EventType;
  conditions: ConditionNode;
  actions: RuleAction[];
  camera_ids: UUID[] | null;
  zone_ids: UUID[] | null;
  schedule: RuleSchedule | null;
  cooldown_sec: number;
  enabled: boolean;
  priority: number;
  last_triggered_at: ISOTimestamp | null;
  trigger_count_24h: number;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}
```

### 2.8 Extension Endpoints — `/api/v1/extensions/*`

| Method | Path | Description | Auth | Rate Limit |
|--------|------|-------------|------|------------|
| GET | `/extensions/marketplace` | Browse marketplace | Any | 30/min |
| GET | `/extensions/marketplace/:id` | Marketplace extension details | Any | 30/min |
| GET | `/extensions` | List installed extensions | Admin+ | 60/min |
| POST | `/extensions` | Install extension | Admin+ | 5/min |
| GET | `/extensions/:id` | Get installed extension details | Admin+ | 60/min |
| PATCH | `/extensions/:id/config` | Update extension config | Admin+ | 20/min |
| PATCH | `/extensions/:id/toggle` | Enable/disable extension | Admin+ | 10/min |
| POST | `/extensions/:id/update` | Update to new version | Admin+ | 5/min |
| POST | `/extensions/:id/rollback` | Rollback to previous version | Admin+ | 5/min |
| DELETE | `/extensions/:id` | Uninstall extension | Admin+ | 5/min |

```typescript
// GET /extensions/marketplace?category=alerts&search=slack&page=1
interface MarketplaceParams extends PaginationParams {
  category?: string;
  search?: string;
  sort_by?: 'installs' | 'rating' | 'newest';
}
interface MarketplaceExtensionResponse {
  id: UUID;
  name: string;
  version: string;
  author: { name: string; url?: string; verified: boolean };
  description: string;
  icon_url: string;
  categories: string[];
  install_count: number;
  avg_rating: number;
  permissions: string[];
  screenshots: string[];
  published_at: ISOTimestamp;
}

// POST /extensions (install)
interface InstallExtensionRequest {
  extension_id: UUID;
  config?: Record<string, unknown>;   // Initial config (per manifest schema)
}
interface InstalledExtensionResponse {
  id: UUID;
  extension: MarketplaceExtensionResponse;
  config: Record<string, unknown>;
  enabled: boolean;
  installed_version: string;
  resource_usage: {
    cpu_ms_last_hour: number;
    memory_mb_peak: number;
    api_calls_last_hour: number;
  };
  installed_at: ISOTimestamp;
}
```

### 2.9 Tenant Endpoints — `/api/v1/tenants/*`

| Method | Path | Description | Auth | Rate Limit |
|--------|------|-------------|------|------------|
| GET | `/tenants/current` | Get current tenant | Any | 60/min |
| PATCH | `/tenants/current` | Update tenant settings | Owner | 10/min |
| PATCH | `/tenants/current/branding` | Update branding/theme | Owner | 10/min |
| GET | `/tenants/current/users` | List tenant users | Admin+ | 30/min |
| POST | `/tenants/current/users/invite` | Invite user to tenant | Admin+ | 10/min |
| PATCH | `/tenants/current/users/:userId/role` | Change user role | Owner | 10/min |
| DELETE | `/tenants/current/users/:userId` | Remove user from tenant | Admin+ | 10/min |
| GET | `/tenants/current/usage` | Storage, cameras, plan usage | Admin+ | 10/min |

```typescript
// PATCH /tenants/current
interface UpdateTenantRequest {
  name?: string;
  settings?: {
    default_retention_days?: number;
    default_recording_mode?: 'motion' | 'continuous' | 'off';
    default_motion_sensitivity?: number;
    notification_preferences?: {
      email_digest?: 'none' | 'daily' | 'weekly';
      push_enabled?: boolean;
    };
    timezone?: string;
  };
}

// PATCH /tenants/current/branding
interface UpdateBrandingRequest {
  logo_url?: string;
  primary_color?: string;       // Hex
  accent_color?: string;        // Hex
  font_family?: string;
  custom_domain?: string;       // CNAME target
  favicon_url?: string;
}

// POST /tenants/current/users/invite
interface InviteUserRequest {
  email: string;
  role: UserRole;
  camera_ids?: UUID[];          // For viewer role scoping
  message?: string;             // Custom invite message
}

// GET /tenants/current/usage
interface TenantUsageResponse {
  plan: TenantPlan;
  cameras: { used: number; limit: number };
  users: { used: number; limit: number };
  storage: { used_bytes: number; limit_bytes: number };
  extensions: { used: number; limit: number };
  recordings: { total_count: number; total_duration_hours: number };
  api_calls_today: number;
}
```

### 2.10 WebSocket Endpoints

#### Live Camera Events — `ws/v1/cameras/:id/live`

```typescript
// Client → Server
interface WSCameraSubscribe {
  type: 'subscribe';
  camera_id: UUID;
  token: string;                // JWT access token
}

// Server → Client
interface WSCameraStatus {
  type: 'camera.status';
  camera_id: UUID;
  status: CameraStatus;
  timestamp: ISOTimestamp;
}

interface WSMotionEvent {
  type: 'motion.detected';
  camera_id: UUID;
  zone_ids: UUID[];
  intensity: number;
  snapshot_url: string;
  timestamp: ISOTimestamp;
}

interface WSRecordingStatus {
  type: 'recording.started' | 'recording.stopped';
  camera_id: UUID;
  recording_id: UUID;
  timestamp: ISOTimestamp;
}
```

#### Real-Time Alerts — `ws/v1/events`

```typescript
// Client → Server
interface WSEventSubscribe {
  type: 'subscribe';
  token: string;                // JWT access token
  filters?: {
    camera_ids?: UUID[];
    event_types?: EventType[];
    min_severity?: EventSeverity;
  };
}

// Server → Client
interface WSNewEvent {
  type: 'event.new';
  event: EventResponse;         // Full event object
}

interface WSEventAcknowledged {
  type: 'event.acknowledged';
  event_id: UUID;
  acknowledged_by: UUID;
  timestamp: ISOTimestamp;
}

// Heartbeat (both directions)
interface WSPing { type: 'ping' }
interface WSPong { type: 'pong' }
```

---

## 3. Video Pipeline Technical Design

### 3.1 Stage 1: Camera Discovery

```
Input:  User triggers ONVIF scan OR enters RTSP URL manually
Process: ONVIF WS-Discovery multicast → probe responses → extract stream URIs
Output: List of discovered cameras with metadata
```

| Aspect | Detail |
|--------|--------|
| **Service** | Camera Ingestion Service (Go) |
| **ONVIF Discovery** | Send WS-Discovery probe to `239.255.255.250:3702`. Parse ProbeMatch responses. For each device: call `GetDeviceInformation` (manufacturer, model, firmware), `GetProfiles` (stream profiles), `GetStreamUri` (RTSP URL) |
| **Manual RTSP** | User provides `rtsp://user:pass@host:port/path`. Service attempts RTSP DESCRIBE to validate |
| **Output** | Camera record inserted into PostgreSQL: `connection_uri`, `protocol`, `capabilities`, `manufacturer`, `model`. go2rtc notified to register stream |
| **Error handling** | Discovery timeout: 10s per probe, max 3 retries. RTSP validation failure: return error with diagnostic (`auth_failed`, `connection_refused`, `invalid_uri`, `codec_unsupported`) |
| **Performance** | LAN scan completes in <10s. RTSP validation <3s. Max 255 devices per scan |

### 3.2 Stage 2: Stream Acquisition

```
Input:  Camera record in DB with connection_uri
Process: go2rtc establishes persistent RTSP connection, monitors health
Output: Active stream available for relay/processing
```

| Aspect | Detail |
|--------|--------|
| **Service** | go2rtc (managed by Camera Ingestion Service) |
| **Connection** | Camera Ingestion Service calls go2rtc HTTP API: `POST /api/streams` with stream config. go2rtc opens RTSP TCP connection, negotiates codecs (H.264/H.265 preferred) |
| **Health monitoring** | Camera Ingestion Service pings each camera every 30s via go2rtc API `GET /api/streams/{id}`. Checks: frame count advancing, no error state, bitrate within expected range |
| **Reconnection** | On disconnect: go2rtc retries automatically (built-in). Camera Ingestion Service updates `cameras.status` to `connecting`. After 5 failures in 5 min → status `offline`, emit `camera.offline` event |
| **Error handling** | Auth failure → `camera.status = error`, log `auth_failed`. Codec unsupported → transcode via FFmpeg intermediary. Network timeout → exponential backoff retry |
| **Performance** | ~5MB RAM per idle stream, ~20MB per active stream. Single go2rtc instance handles 200 cameras comfortably |

### 3.3 Stage 3: Live Relay (WebRTC)

```
Input:  Active stream in go2rtc + client requests live view
Process: WHEP signaling → ICE negotiation → SRTP media flow
Output: Low-latency video in client browser/app
```

| Aspect | Detail |
|--------|--------|
| **Service** | go2rtc (WebRTC server) |
| **Signaling** | Client sends HTTP POST to go2rtc WHEP endpoint with SDP offer. go2rtc returns SDP answer. No persistent signaling connection needed |
| **Authentication** | Client first calls API Gateway `GET /cameras/:id/stream` → receives one-time token (30s TTL, stored in Redis). Token included in WHEP request. go2rtc validates against Redis |
| **ICE / NAT traversal** | STUN server (public, e.g. Google STUN or self-hosted). TURN server (Cloudflare TURN or coturn) for symmetric NAT. ICE candidates gathered via Trickle ICE |
| **Codec passthrough** | If camera sends H.264 → direct passthrough to WebRTC (no transcoding). If H.265 → FFmpeg transcode to H.264 (browsers don't support H.265 in WebRTC) |
| **Fallback** | If WebRTC fails after 5s → client switches to Low-Latency HLS endpoint (go2rtc also serves LL-HLS). Latency degrades from <500ms to ~2–3s |
| **Error handling** | ICE failure logged, client auto-retries with TURN-only mode. Track failure rate per camera (may indicate firewall issue) |
| **Performance** | ~0.1 CPU per viewer (passthrough). ~0.3 CPU per viewer (transcoded). Max 200 concurrent viewers per go2rtc instance |

### 3.4 Stage 4: Recording

```
Input:  Trigger event (motion, rule, manual) + active stream in go2rtc
Process: FFmpeg reads RTSP from go2rtc → segments → HLS packaging
Output: .ts segments + .m3u8 playlist written to local staging
```

| Aspect | Detail |
|--------|--------|
| **Service** | Video Processing Pipeline (Go) orchestrating FFmpeg |
| **Trigger** | Event Engine sends `recording.start` command via gRPC with `camera_id`, `trigger_reason`, `requested_duration` |
| **Pre-roll** | go2rtc maintains 30s circular buffer per stream. On recording start, buffer flushed to FFmpeg input so clip includes footage before the trigger |
| **FFmpeg command** | `ffmpeg -i rtsp://go2rtc:8554/{camera_id} -c:v copy -c:a aac -f hls -hls_time 2 -hls_list_size 0 -hls_segment_filename 'seg_%04d.ts' playlist.m3u8` |
| **Segment size** | 2-second HLS segments. Short segments = fine-grained seek + fast start. Overhead acceptable at this duration |
| **Duration** | Default: 30s post-trigger (motion). Configurable per rule (30s – 300s). Continuous: runs until stopped |
| **Error handling** | FFmpeg exit code != 0 → restart, log error. If camera drops mid-recording → finalize partial playlist, mark recording as `partial`. If disk full → alert, stop oldest non-critical recordings |
| **Performance** | H.264 copy (no transcode): ~0.05 CPU per stream. H.265→H.264 transcode: ~0.5 CPU per stream at 1080p. 100 simultaneous recordings (copy mode): ~5 CPU cores |

### 3.5 Stage 5: Storage Upload

```
Input:  Completed HLS segments + playlist on local staging
Process: Upload to R2 with tenant-prefixed path, index in PostgreSQL
Output: Recording accessible via signed URL
```

| Aspect | Detail |
|--------|--------|
| **Service** | Video Processing Pipeline (Go) |
| **Upload** | Segments uploaded to R2 as they complete (streaming upload, not batch). Uses S3 multipart upload for segments >5MB. Path: `/tenant-{id}/videos/camera-{id}/YYYY/MM/DD/{recording_id}/` |
| **Thumbnail** | FFmpeg extracts single JPEG at moment of peak motion: `ffmpeg -i seg_0001.ts -vf "select=eq(n\,0)" -frames:v 1 thumb.jpg`. Uploaded to `/tenant-{id}/snapshots/{recording_id}.jpg` |
| **Metadata** | Recording row inserted into PostgreSQL with `storage_path`, `duration_sec`, `size_bytes`, `start_time`, `end_time`, `trigger` |
| **Error handling** | R2 upload failure → retry 3 times with backoff. If persistent → spool to local disk (max 10GB). Background worker drains spool on R2 recovery. Alert if spool >80% full |
| **Retention** | `retention_until` calculated from tenant's plan retention days. Daily cron job: `DELETE FROM recordings WHERE retention_until < NOW()` + R2 bulk delete |
| **Performance** | Upload throughput: ~100MB/s per instance to R2 (parallel uploads). 100 cameras × 5GB/day = 500GB/day = ~6MB/s sustained (well within limits) |

### 3.6 Stage 6: Playback

```
Input:  Client requests playback of a recording or timeline scrub
Process: Generate signed HLS URL, serve from R2 via CDN
Output: Video playback in client player
```

| Aspect | Detail |
|--------|--------|
| **Service** | API Gateway (URL generation) + Cloudflare CDN (serving) |
| **Clip playback** | Client calls `GET /recordings/:id` → API returns signed HLS URL (R2 pre-signed, 1h TTL). Client HLS player (hls.js web, AVPlayer iOS, ExoPlayer Android) loads `.m3u8`, fetches `.ts` segments |
| **Timeline scrub** | Client calls `GET /recordings/timeline?camera_id=X&date=Y` → returns all segments for that day. Client displays timeline visualization. On scrub → calculate which recording + segment offset → seek within HLS stream |
| **Signed URLs** | R2 pre-signed URLs with 1h expiry. Include `tenant_id` in signature to prevent URL sharing across tenants. CDN caches segments (public-read within signed window) |
| **Adaptive bitrate** | Phase 2: FFmpeg generates multiple quality variants (1080p, 720p, 480p). Master playlist references all variants. Player auto-selects based on bandwidth |
| **Error handling** | Missing segment → player skips gap, UI shows "gap in recording". Expired URL → client calls API for new signed URL, resumes seamlessly |
| **Performance** | Time to first frame: <1s (CDN-cached segments). Seek latency: <2s (load nearest segment boundary). CDN cache hit rate: >90% for recent recordings |

### 3.7 Stage 7: AI Processing (Phase 2)

```
Input:  JPEG frames sampled from active camera streams (1–5 fps)
Process: ONNX Runtime inference → detection results → event creation
Output: AI-tagged events with bounding boxes and confidence scores
```

| Aspect | Detail |
|--------|--------|
| **Service** | AI Processing Service (Go + ONNX Runtime) |
| **Frame source** | go2rtc outputs JPEG snapshots at configurable FPS (1fps default for motion, 5fps when motion active). Delivered via HTTP to AI service |
| **Models** | Phase 2: YOLOv8n (person/vehicle/animal) via ONNX Runtime. Phase 3: tenant-uploaded custom models. Model size: ~6MB (nano), inference: ~20ms/frame on CPU, ~5ms on GPU |
| **Pipeline** | Frame received → resize to model input (640x640) → ONNX inference → NMS (non-max suppression) → filter by confidence (>0.5) → emit typed event (`person.detected`, `vehicle.detected`, etc.) |
| **Event enrichment** | AI events include `bounding_box`, `confidence`, `class_label`, `tracking_id` (multi-frame tracking via simple IoU tracker) |
| **Error handling** | Model load failure → disable AI for that tenant, alert. Inference timeout (>500ms) → skip frame, log. GPU OOM → fallback to CPU inference |
| **Performance** | CPU: ~50ms/frame per camera (YOLOv8n). 100 cameras at 1fps = 100 inferences/sec = ~5 CPU cores. GPU (T4): ~5ms/frame = 200 cameras per GPU at 1fps |

---

## 4. Extension SDK Design

### 4.1 Developer Experience Overview

```typescript
// ── osp-extension-sdk package ──

// The main interface an extension implements
interface OSPExtension {
  manifest: ExtensionManifest;
  onInstall?(ctx: TenantContext): Promise<void>;
  onUninstall?(ctx: TenantContext): Promise<void>;
  hooks?: ExtensionHooks;
  widgets?: DashboardWidget[];
  settings?: SettingsSchema;
}

// Extension manifest (also exists as manifest.json for marketplace)
interface ExtensionManifest {
  id: string;                     // Reverse domain: "com.company.extension-name"
  name: string;                   // Display name
  version: string;                // Semver: "1.2.3"
  description: string;            // One paragraph
  author: {
    name: string;
    email: string;
    url?: string;
  };
  engine: string;                 // SDK version requirement: "osp-sdk@^1.0.0"
  entrypoint: string;             // Relative path to compiled Wasm or JS bundle
  icon?: string;                  // Relative path to icon file
  categories: string[];           // ["alerts", "integrations", "analytics"]
  permissions: Permission[];
  resources: ResourceLimits;
}

// Available permissions
type Permission =
  | 'cameras:read'
  | 'cameras:write'
  | 'events:read'
  | 'events:write'
  | 'events:abort'              // Can stop event propagation
  | 'recordings:read'
  | 'recordings:write'
  | 'notifications:send'
  | 'storage:read'
  | 'storage:write'
  | 'users:read'
  | 'http:outbound';             // Can make HTTP requests to declared domains

interface ResourceLimits {
  maxMemoryMb: number;            // Default 64, max 256
  maxCpuMs: number;               // Per invocation, default 500, max 5000
  maxApiCallsPerMinute: number;   // Default 60, max 600
  maxStorageBytes: number;        // KV storage, default 10MB, max 100MB
  allowedDomains?: string[];      // For http:outbound permission
}
```

### 4.2 Hook Payload Shapes

```typescript
// ── Hook system ──

interface ExtensionHooks {
  onMotionDetected?(event: MotionEvent, ctx: HookContext): Promise<HookResult>;
  onPersonDetected?(event: PersonEvent, ctx: HookContext): Promise<HookResult>;
  onVehicleDetected?(event: VehicleEvent, ctx: HookContext): Promise<HookResult>;
  onCameraOffline?(event: CameraStatusEvent, ctx: HookContext): Promise<HookResult>;
  onCameraOnline?(event: CameraStatusEvent, ctx: HookContext): Promise<HookResult>;
  onRecordingComplete?(event: RecordingEvent, ctx: HookContext): Promise<HookResult>;
  onAlertTriggered?(event: AlertEvent, ctx: HookContext): Promise<HookResult>;
  onScheduledTick?(event: ScheduledEvent, ctx: HookContext): Promise<HookResult>;
}

// ── Event payloads ──

interface BaseEvent {
  id: string;
  tenant_id: string;
  timestamp: string;              // ISO 8601
}

interface MotionEvent extends BaseEvent {
  type: 'motion.detected';
  camera_id: string;
  camera_name: string;
  zones: { id: string; name: string }[];
  intensity: number;              // 0.0 – 1.0
  bounding_boxes: BoundingBox[];
  snapshot_url: string;
}

interface PersonEvent extends BaseEvent {
  type: 'person.detected';
  camera_id: string;
  camera_name: string;
  confidence: number;             // 0.0 – 1.0
  bounding_box: BoundingBox;
  tracking_id: string;            // Stable across frames
  snapshot_url: string;
}

interface VehicleEvent extends BaseEvent {
  type: 'vehicle.detected';
  camera_id: string;
  camera_name: string;
  confidence: number;
  bounding_box: BoundingBox;
  vehicle_type: 'car' | 'truck' | 'motorcycle' | 'bus' | 'bicycle';
  plate_number: string | null;    // If LPR extension active
  snapshot_url: string;
}

interface CameraStatusEvent extends BaseEvent {
  type: 'camera.offline' | 'camera.online';
  camera_id: string;
  camera_name: string;
  downtime_seconds: number | null;
  failure_reason: string | null;
}

interface RecordingEvent extends BaseEvent {
  type: 'recording.complete';
  camera_id: string;
  camera_name: string;
  recording_id: string;
  duration_sec: number;
  size_bytes: number;
  trigger: string;
  storage_url: string;
  thumbnail_url: string | null;
}

interface AlertEvent extends BaseEvent {
  type: 'alert.triggered';
  rule_id: string;
  rule_name: string;
  camera_id: string;
  camera_name: string;
  source_event_type: string;
  actions_taken: string[];
}

interface ScheduledEvent extends BaseEvent {
  type: 'scheduled.tick';
  schedule: string;               // Cron expression
  tick_number: number;
}

interface BoundingBox {
  x: number;                      // Normalized 0–1
  y: number;
  width: number;
  height: number;
}

// ── Hook context (injected by runtime) ──

interface HookContext {
  tenant: { id: string; name: string; plan: string };
  extension: { id: string; version: string };
  cameras: CameraAPI;
  events: EventAPI;
  notifications: NotificationAPI;
  storage: KeyValueAPI;
  http: HttpAPI;
  logger: Logger;
}

interface CameraAPI {
  list(): Promise<Camera[]>;
  get(id: string): Promise<Camera | null>;
  getSnapshot(id: string): Promise<string>;    // Returns signed URL
}

interface EventAPI {
  query(params: {
    camera_id?: string;
    type?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<Event[]>;
  create(event: {
    camera_id: string;
    type: string;
    severity: string;
    metadata: Record<string, unknown>;
  }): Promise<Event>;
}

interface NotificationAPI {
  sendPush(params: {
    title: string;
    body: string;
    user_ids?: string[];          // null = all tenant users
    thumbnail_url?: string;
    data?: Record<string, unknown>;
  }): Promise<void>;
  sendEmail(params: {
    to: string[];
    subject: string;
    html: string;
  }): Promise<void>;
  sendWebhook(params: {
    url: string;
    method?: 'POST' | 'PUT';
    headers?: Record<string, string>;
    body: unknown;
  }): Promise<{ status: number; body: unknown }>;
}

interface KeyValueAPI {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl_sec?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

interface HttpAPI {
  fetch(url: string, options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout_ms?: number;          // Default 5000, max 10000
  }): Promise<{ status: number; headers: Record<string, string>; body: string }>;
}

interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ── Hook result ──

interface HookResult {
  abort?: boolean;                // Stop event chain (requires events:abort permission)
  data?: Record<string, unknown>; // Passed to next hook in chain
}
```

### 4.3 Widget Registration

```typescript
interface DashboardWidget {
  id: string;                     // Unique within extension
  name: string;                   // Display name in widget picker
  description: string;
  component: string;              // Relative path to React component bundle
  placement: WidgetPlacement[];
  size: {
    minWidth: number;             // Grid units (1–4)
    minHeight: number;            // Grid units (1–4)
    maxWidth?: number;
    maxHeight?: number;
  };
  refreshInterval?: number;       // Auto-refresh in seconds
  configSchema?: SettingsSchema;  // Per-widget instance config
}

type WidgetPlacement =
  | 'dashboard'                   // Main dashboard grid
  | 'camera-detail'              // Camera detail sidebar
  | 'event-detail'               // Event detail panel
  | 'settings';                  // Tenant settings page

// Widget component receives these props
interface WidgetProps {
  tenant_id: string;
  config: Record<string, unknown>;
  size: { width: number; height: number };
  api: WidgetAPI;                 // Subset of HookContext APIs
}
```

### 4.4 Settings Schema

```typescript
// Declarative config schema — runtime auto-generates settings UI
interface SettingsSchema {
  fields: SettingsField[];
}

type SettingsField =
  | { type: 'string';  key: string; label: string; required?: boolean; default?: string; placeholder?: string; secret?: boolean }
  | { type: 'number';  key: string; label: string; required?: boolean; default?: number; min?: number; max?: number }
  | { type: 'boolean'; key: string; label: string; required?: boolean; default?: boolean }
  | { type: 'select';  key: string; label: string; required?: boolean; default?: string; options: { label: string; value: string }[] }
  | { type: 'multi-select'; key: string; label: string; options: { label: string; value: string }[] }
  | { type: 'camera-picker'; key: string; label: string; multi?: boolean }
  | { type: 'zone-picker';   key: string; label: string; camera_key: string; multi?: boolean };

// Fields marked secret=true are:
// - Encrypted at rest (AES-256) in PostgreSQL
// - Never returned in API responses (replaced with "••••••")
// - Only decrypted inside extension sandbox at runtime
```

### 4.5 Extension Rate Limits

| API | Free Tenant | Pro Tenant | Business Tenant | Enterprise Tenant |
|-----|-------------|------------|-----------------|-------------------|
| `cameras.*` | 30/min | 60/min | 300/min | 600/min |
| `events.query` | 15/min | 30/min | 150/min | 300/min |
| `events.create` | 5/min | 15/min | 60/min | 300/min |
| `notifications.sendPush` | 10/min | 30/min | 100/min | 600/min |
| `notifications.sendEmail` | 5/min | 15/min | 60/min | 300/min |
| `notifications.sendWebhook` | 10/min | 30/min | 100/min | 600/min |
| `storage.*` | 30/min | 60/min | 300/min | 600/min |
| `http.fetch` | 10/min | 30/min | 100/min | 300/min |

All limits are per-extension, per-tenant. An extension that exceeds limits receives a `RateLimitExceeded` error from the host function.

---

## 5. Security Design

### 5.1 Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Client as Client App
    participant GW as API Gateway
    participant Supa as Supabase Auth
    participant Redis
    participant DB as PostgreSQL

    Note over User,DB: Registration Flow
    User->>Client: Enter email, password, tenant name
    Client->>GW: POST /api/v1/auth/register
    GW->>Supa: supabase.auth.signUp(email, password)
    Supa->>Supa: Hash password (bcrypt), create auth.users row
    Supa-->>GW: User created {id, email}
    GW->>DB: INSERT INTO tenants (name, plan='free')
    GW->>DB: INSERT INTO users (id, tenant_id, email)
    GW->>DB: INSERT INTO user_roles (user_id, tenant_id, role='owner')
    GW->>Supa: Set custom JWT claims {tenant_id, role}
    GW-->>Client: {user, tenant, access_token, refresh_token}

    Note over User,DB: Login Flow
    User->>Client: Enter email, password
    Client->>GW: POST /api/v1/auth/login
    GW->>Supa: supabase.auth.signInWithPassword(email, password)
    Supa->>Supa: Verify bcrypt hash
    Supa-->>GW: {access_token (JWT, 15min), refresh_token (7d)}
    GW->>DB: SELECT role, camera_ids FROM user_roles WHERE user_id = ?
    GW->>Redis: SET session:{user_id} = {tenant_id, role} EX 900
    GW-->>Client: {user, tenant, access_token, refresh_token}

    Note over User,DB: Authenticated API Call
    Client->>GW: GET /api/v1/cameras (Authorization: Bearer JWT)
    GW->>GW: Verify JWT signature (Supabase public key)
    GW->>GW: Extract claims: tenant_id, user_id
    GW->>Redis: GET session:{user_id} (fast role lookup)
    Redis-->>GW: {tenant_id, role}
    GW->>GW: Check rate limit (Redis sliding window)
    GW->>GW: Check role >= required role for endpoint
    GW->>DB: SELECT * FROM cameras (RLS auto-filters by tenant_id)
    DB-->>GW: Tenant-scoped results
    GW-->>Client: 200 {cameras: [...]}

    Note over User,DB: Token Refresh (client-side, automatic)
    Client->>Supa: POST /auth/v1/token?grant_type=refresh_token
    Supa->>Supa: Validate refresh token, rotate
    Supa-->>Client: {new access_token, new refresh_token}
```

### 5.2 RLS Policies Per Table

All tables include `tenant_id`. All policies follow this pattern unless noted.

#### Base Tenant Isolation (applied to every table)

```sql
-- Template applied to: cameras, camera_zones, recordings, snapshots,
-- events, alert_rules, notifications, tenant_extensions

-- SELECT: user can only read their tenant's data
CREATE POLICY "tenant_read" ON {table}
  FOR SELECT USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  );

-- INSERT: can only insert into their tenant
CREATE POLICY "tenant_insert" ON {table}
  FOR INSERT WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  );

-- UPDATE: can only update their tenant's data
CREATE POLICY "tenant_update" ON {table}
  FOR UPDATE USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  ) WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  );

-- DELETE: admin+ only within tenant
CREATE POLICY "tenant_delete" ON {table}
  FOR DELETE USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = {table}.tenant_id
        AND role IN ('owner', 'admin')
    )
  );
```

#### Cameras (viewer scoping)

```sql
-- Override SELECT for viewer camera scoping
CREATE POLICY "camera_viewer_select" ON cameras
  FOR SELECT USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND (
      -- Non-viewers see all cameras
      EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
          AND tenant_id = cameras.tenant_id
          AND role IN ('owner', 'admin', 'operator')
      )
      OR
      -- Viewers see only assigned cameras
      EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
          AND tenant_id = cameras.tenant_id
          AND role = 'viewer'
          AND cameras.id = ANY(camera_ids)
      )
    )
  );
```

#### Recordings / Events / Snapshots (cascade from camera scoping)

```sql
-- Viewers can only see recordings/events for their assigned cameras
CREATE POLICY "recording_viewer_select" ON recordings
  FOR SELECT USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND (
      EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
          AND tenant_id = recordings.tenant_id
          AND role IN ('owner', 'admin', 'operator')
      )
      OR
      EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
          AND tenant_id = recordings.tenant_id
          AND role = 'viewer'
          AND recordings.camera_id = ANY(camera_ids)
      )
    )
  );
-- Same pattern for events and snapshots
```

#### Users (tenant members can see each other, not cross-tenant)

```sql
CREATE POLICY "user_select" ON users
  FOR SELECT USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  );

-- Only owner/admin can modify users
CREATE POLICY "user_update" ON users
  FOR UPDATE USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = users.tenant_id
        AND role IN ('owner', 'admin')
    )
  );
```

#### Tenants (only own tenant)

```sql
CREATE POLICY "tenant_self_select" ON tenants
  FOR SELECT USING (
    id = (auth.jwt() ->> 'tenant_id')::uuid
  );

-- Only owner can update tenant
CREATE POLICY "tenant_self_update" ON tenants
  FOR UPDATE USING (
    id = (auth.jwt() ->> 'tenant_id')::uuid
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = tenants.id
        AND role = 'owner'
    )
  );
```

### 5.3 API Key Scoping for Extensions

```
Key format: osp_ext_{environment}_{32_random_chars}
Example:    osp_ext_prod_kX9mB3nRvP2qYwT8cJ5dH7fL1gZ4aE6s

Storage:    SHA-256(key) stored in extension_api_keys table
Lookup:     Hash incoming key → lookup in DB → retrieve scopes + tenant
```

| Scope | Grants |
|-------|--------|
| `marketplace:read` | Browse and search marketplace |
| `marketplace:publish` | Upload extension bundles, manage listings |
| `marketplace:analytics` | View install counts, ratings, errors for own extensions |
| `extensions:test` | Run extension in test sandbox with mock data |
| `extensions:manage` | Enable/disable/configure extensions (used by CI/CD) |

API keys are tenant-scoped for `extensions:manage` and developer-scoped for `marketplace:*`.

### 5.4 Video Stream Authentication

| Stream Type | Auth Mechanism | TTL | Details |
|-------------|---------------|-----|---------|
| **WebRTC (live)** | One-time token | 30s | Client gets token from `GET /cameras/:id/stream` (JWT-authenticated). Token stored in Redis. go2rtc validates on WHEP request. Token consumed on use |
| **HLS (playback)** | Pre-signed URL | 1h | R2 pre-signed URLs generated server-side. Include `tenant_id` in signing policy. CDN caches segments within signed window |
| **HLS (fallback live)** | Session token | 15min | Long-lived token appended as query param to `.m3u8` URL. Validated on each segment request |
| **Snapshot** | Pre-signed URL | 5min | Short-lived R2 pre-signed URL |
| **Download** | Pre-signed URL + role check | 30min | Operator+ role required. One-time download URL |

### 5.5 Encryption

| Layer | Mechanism | Key Management |
|-------|-----------|---------------|
| **In transit (API)** | TLS 1.3 (Cloudflare terminates) | Cloudflare-managed certificates |
| **In transit (gRPC)** | mTLS between services | Self-signed CA, auto-rotated via cert-manager |
| **In transit (RTSP)** | RTSPS (TLS) where camera supports; unencrypted on LAN as fallback | Camera credentials stored encrypted in DB |
| **In transit (WebRTC)** | DTLS + SRTP (mandatory in WebRTC) | Ephemeral keys per session |
| **At rest (R2)** | AES-256 server-side encryption (SSE-S3) | R2-managed keys |
| **At rest (PostgreSQL)** | Supabase managed encryption at rest | Supabase-managed keys |
| **At rest (secrets in DB)** | AES-256-GCM application-level encryption | Encryption key in env var `OSP_ENCRYPTION_KEY`, rotated quarterly |
| **Camera credentials** | AES-256-GCM before storage | Same app encryption key |
| **Extension secrets** | AES-256-GCM (extension config fields marked `secret`) | Same app encryption key |

### 5.6 Audit Logging

#### Events Logged

| Category | Events | Retention |
|----------|--------|-----------|
| **Auth** | login, logout, register, password_reset, sso_login, failed_login | 90 days |
| **Camera** | camera_added, camera_removed, camera_config_changed, ptz_moved | 90 days |
| **User** | user_invited, user_removed, role_changed, camera_access_changed | 1 year |
| **Recording** | recording_downloaded, recording_deleted, retention_changed | 1 year |
| **Rule** | rule_created, rule_updated, rule_deleted, rule_triggered | 90 days |
| **Extension** | extension_installed, extension_uninstalled, extension_config_changed | 90 days |
| **Tenant** | settings_changed, branding_changed, plan_changed | 1 year |
| **Video access** | live_view_started, playback_started, snapshot_viewed | 90 days (enterprise: 1 year) |

#### Audit Log Schema

```sql
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  actor_email text NOT NULL,
  action text NOT NULL,               -- e.g. "camera_added"
  resource_type text NOT NULL,        -- e.g. "camera"
  resource_id uuid,
  details jsonb,                      -- Action-specific context
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_audit_tenant_time ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs (resource_type, resource_id, created_at DESC);
```

#### Access Control for Audit Logs

- **Read**: Owner and Admin roles only
- **Delete**: Never (immutable within retention period)
- **Export**: Owner only, via `GET /api/v1/tenants/current/audit-logs?from=...&to=...`
- **RLS**: Same tenant isolation policy as all other tables

---

## 6. Caching Strategy

### 6.1 Redis Key Design

All keys follow the pattern: `osp:{domain}:{tenant_id}:{resource}:{id}`

| Cache | Key Pattern | TTL | Invalidation |
|-------|-------------|-----|-------------|
| Camera status | `osp:cam:status:{tenant_id}:{camera_id}` | 5s | Overwritten by health check every 5s |
| Camera list | `osp:cam:list:{tenant_id}` | 30s | Invalidated on camera add/remove/update |
| Camera config | `osp:cam:config:{tenant_id}:{camera_id}` | 5min | Invalidated on camera config change |
| User session | `osp:session:{user_id}` | 15min | Matches JWT expiry. Invalidated on logout or role change |
| Thumbnail (latest) | `osp:thumb:{tenant_id}:{camera_id}:latest` | 10s | Overwritten by snapshot extractor |
| Thumbnail (event) | `osp:thumb:{tenant_id}:{event_id}` | 1h | Immutable (event thumbnails don't change) |
| Extension config | `osp:ext:config:{tenant_id}:{extension_id}` | 10min | Invalidated on config update |
| Extension Wasm | `osp:ext:wasm:{extension_id}:{version}` | 24h | Invalidated on extension update |
| Tenant settings | `osp:tenant:{tenant_id}:settings` | 5min | Invalidated on settings change |
| Tenant plan/limits | `osp:tenant:{tenant_id}:plan` | 1h | Invalidated on plan change |
| Rate limit counter | `osp:rate:{tenant_id}:{endpoint}:{window}` | 60s | Sliding window, auto-expires |
| Rule cooldown | `osp:rule:cool:{tenant_id}:{rule_id}` | Varies (rule's cooldown_sec) | Set on rule trigger, auto-expires |
| Stream token | `osp:stream:token:{token}` | 30s | Consumed (deleted) on use |
| ONVIF discovery | `osp:discover:{tenant_id}:last` | 5min | Prevents rapid re-scans |
| Event dedup | `osp:event:dedup:{camera_id}:{zone_id}` | 2s | Prevents duplicate motion events |

### 6.2 Camera Status Cache (5s TTL)

**Purpose**: Avoid hitting PostgreSQL on every dashboard load for camera online/offline status.

```
Key:    osp:cam:status:{tenant_id}:{camera_id}
Value:  JSON { "status": "online", "last_seen_at": "2026-03-16T12:00:00Z",
               "fps": 25, "bitrate_kbps": 4500, "viewers": 2 }
TTL:    5 seconds
Writer: Camera health checker (Go) runs every 5s per camera
Reader: API Gateway on GET /cameras and GET /cameras/:id
Miss:   Fall through to PostgreSQL query
```

**Batch read optimization**: Dashboard shows all cameras. Use Redis pipeline to fetch all `osp:cam:status:{tenant_id}:*` in a single round-trip.

### 6.3 Thumbnail Cache

**Latest snapshot** (per camera, constantly refreshed):

```
Key:    osp:thumb:{tenant_id}:{camera_id}:latest
Value:  JSON { "url": "https://r2.../snap.jpg", "captured_at": "...", "width": 1920, "height": 1080 }
TTL:    10 seconds
Writer: Snapshot extractor (FFmpeg outputs 1 JPEG every 10s per camera)
Reader: Camera grid view, camera detail view
```

**Event thumbnail** (per event, immutable):

```
Key:    osp:thumb:{tenant_id}:{event_id}
Value:  JSON { "url": "https://r2.../event_snap.jpg", "width": 1920, "height": 1080 }
TTL:    1 hour
Writer: Set when event is created
Reader: Event list, event detail, notification previews
Miss:   Query snapshots table by event_id
```

### 6.4 User Session Cache

**Purpose**: Avoid database query on every authenticated request to look up role and permissions.

```
Key:    osp:session:{user_id}
Value:  JSON {
          "tenant_id": "...",
          "role": "admin",
          "camera_ids": null,        // null = all cameras (non-viewer)
          "plan": "pro",
          "max_cameras": 16,
          "max_streams": 4
        }
TTL:    15 minutes (matches JWT access token expiry)
Writer: Set on login, refresh
Reader: API Gateway auth middleware (every request)
Miss:   Query user_roles + tenants tables, cache result
```

**Invalidation triggers**:
- User role changed → delete `osp:session:{user_id}`
- User camera assignments changed → delete `osp:session:{user_id}`
- Tenant plan changed → delete all `osp:session:*` for tenant (via pub/sub)
- User logs out → delete `osp:session:{user_id}`

### 6.5 Extension Config Cache

```
Key:    osp:ext:config:{tenant_id}:{extension_id}
Value:  JSON { decrypted config object (secrets included, only readable by extension runtime) }
TTL:    10 minutes
Writer: Set on extension install, config update
Reader: Extension Runtime when invoking hooks
Miss:   Query tenant_extensions table, decrypt secrets, cache
```

**Security note**: This cache contains decrypted secrets. Redis access must be restricted to internal services only (no client access). If using Upstash, use TLS + password auth.

### 6.6 Cache Invalidation Patterns

Three patterns used across the system:

#### Pattern 1: Write-Through (status caches)

```
Writer updates DB → Writer updates Redis → Reader reads Redis
Used for: camera status, latest thumbnails
Advantage: Redis always fresh, no stale reads
Risk: Redis write failure → stale for one TTL cycle (acceptable, 5–10s)
```

#### Pattern 2: Cache-Aside with Event Invalidation (entity caches)

```
Writer updates DB → Writer publishes invalidation to Redis pub/sub
                  → Subscriber deletes cache key
Reader checks Redis → Miss → Query DB → Write to Redis
Used for: camera list, camera config, tenant settings, extension config
Advantage: Only caches data that's actually read
Risk: Brief stale window between DB write and cache delete (~1ms)
```

#### Pattern 3: TTL-Only (ephemeral caches)

```
Writer sets key with TTL → Reader reads until TTL expires → Key auto-deleted
Used for: stream tokens (30s), rate limit counters (60s), rule cooldowns, event dedup
Advantage: Self-cleaning, no invalidation logic needed
Risk: None (TTL is the source of truth)
```

### 6.7 Cache Warming

On service startup, pre-warm these caches to avoid cold-start latency:

| Cache | Warm Strategy |
|-------|--------------|
| Tenant settings | Load all active tenants' settings on API Gateway boot |
| Camera list | Load per-tenant on first request (lazy warm) |
| Camera status | Health checker populates within 5s of boot |
| User sessions | Not warmed (populated on first request per user) |
| Extension configs | Load all enabled extensions on Extension Runtime boot |

### 6.8 Memory Budget (Redis)

| Cache Type | Entries (1,000 cameras, 100 users) | Avg Size | Total |
|------------|-------------------------------------|----------|-------|
| Camera status | 1,000 | 200 bytes | 200 KB |
| Camera list | 50 tenants | 5 KB | 250 KB |
| Camera config | 1,000 | 1 KB | 1 MB |
| User sessions | 100 | 300 bytes | 30 KB |
| Latest thumbnails | 1,000 | 200 bytes | 200 KB |
| Event thumbnails | 10,000 (1h window) | 200 bytes | 2 MB |
| Extension config | 200 (50 tenants × 4 exts) | 2 KB | 400 KB |
| Rate limit counters | 5,000 | 50 bytes | 250 KB |
| Stream tokens | 100 (concurrent viewers) | 100 bytes | 10 KB |
| Rule cooldowns | 500 | 50 bytes | 25 KB |
| **Total** | | | **~5 MB** |

Upstash Free tier (256MB) or Pro tier is more than sufficient. At 10,000 cameras: ~50MB estimated.
