# OSP — Complete Technical Reference

**Open Surveillance Platform** · Version 0.1.0
This document describes every component of the system from top to bottom —
database tables, API endpoints, frontend pages, backend services, real-time
pipeline, video stack, auth model, infrastructure, and environment variables.
Nothing is omitted.

---

## Table of Contents

1. [What OSP Is](#1-what-osp-is)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Monorepo Structure](#4-monorepo-structure)
5. [Database Schema](#5-database-schema)
6. [API Gateway](#6-api-gateway)
7. [WebSocket Server](#7-websocket-server)
8. [Web Application](#8-web-application)
9. [Mobile Application](#9-mobile-application)
10. [Desktop Application](#10-desktop-application)
11. [Go Microservices](#11-go-microservices)
12. [Edge Agent](#12-edge-agent)
13. [Video Pipeline](#13-video-pipeline)
14. [Real-Time Event System](#14-real-time-event-system)
15. [Authentication & Authorization](#15-authentication--authorization)
16. [Rule Engine & Action Dispatch](#16-rule-engine--action-dispatch)
17. [AI Detection](#17-ai-detection)
18. [License Plate Recognition](#18-license-plate-recognition)
19. [Analytics (ClickHouse)](#19-analytics-clickhouse)
20. [Extension System](#20-extension-system)
21. [Infrastructure](#21-infrastructure)
22. [Environment Variables](#22-environment-variables)
23. [Development Workflow](#23-development-workflow)
24. [Security Model](#24-security-model)

---

## 1. What OSP Is

OSP is a **multi-tenant surveillance camera platform** that connects to any
camera type (RTSP, ONVIF, Ring, Arlo, Wyze, Hikvision, USB, WebRTC, HLS,
MJPEG, RTMP, DVR-IP, ISAPI, GoPro, and more) and provides:

- Live WebRTC video streaming with < 200 ms latency
- Motion-triggered and continuous recording to disk or Cloudflare R2
- An event engine with a visual rule builder and configurable action dispatch
- AI object detection (person / vehicle / animal) via OpenAI Vision
- License plate recognition via PlateRecognizer API
- A real-time WebSocket feed of all events to every connected browser
- Multi-tenant row-level security: every byte of data is scoped to a tenant
- An extension/plugin SDK so third parties can add their own AI models, rules, and UI
- A React Native mobile app and a Tauri desktop app
- On-premise edge agents that buffer events locally and sync to the cloud

---

## 2. High-Level Architecture

```
Browser / Mobile / Desktop
         │  HTTPS  │  WebSocket(:3002)
         ▼
  ┌──────────────────────────────────┐
  │       API Gateway (Hono/Bun)     │  :3000
  │  auth · cameras · events ·       │
  │  rules · recordings · analytics  │
  └──┬────────┬────────┬─────────────┘
     │ gRPC   │ gRPC   │ gRPC
     ▼        ▼        ▼
 camera-  video-   event-    extension-
 ingest   pipeline  engine    runtime
 :50051   :50052   :50053    :50054
     │
     ▼
  go2rtc  ─── cameras (RTSP / ONVIF / USB / WebRTC)
  :1984 / :8554 / :8555

  ┌──────────────────────────────────┐
  │  Supabase (PostgreSQL + Auth)    │
  │  Redis (Upstash)                 │
  │  Cloudflare R2 (video storage)   │
  │  ClickHouse (analytics)          │
  └──────────────────────────────────┘

  ┌──────────────────────────────────┐
  │  Edge Agent  (on-premise)        │  :8084
  │  BoltDB offline queue            │
  │  → syncs to Gateway              │
  └──────────────────────────────────┘
```

### Data flows

| Flow | Path |
|------|------|
| Browser live video | Browser → Gateway `/whep` proxy → go2rtc WHEP → camera RTSP |
| Motion event | Gateway health-checker or Go edge agent → Redis `events:{tenantId}` → WS server → browser |
| Rule trigger | Event inserted → rule-evaluator → action-executor → webhook / email / push / recording |
| Recording | Gateway `record/start` → recording.service → go2rtc MP4 → local disk → R2 upload |
| AI detection | Event created → fire-and-forget → go2rtc frame → OpenAI Vision → event metadata updated |
| LPR | Motion event → go2rtc frame → PlateRecognizer API → watchlist check → `lpr.alert` event |

---

## 3. Tech Stack

### Frontend
| Layer | Technology |
|-------|------------|
| Web app | Next.js 15 (App Router), Tailwind CSS, shadcn/ui |
| Mobile | React Native + Expo (iOS & Android) |
| Desktop | Tauri v2 (webview wrapper around Next.js) |
| State | Zustand (client state) + TanStack Query (server state) |
| Real-time | WebSocket (alerts) + WebRTC WHEP (live camera feeds) |
| Icons | Lucide React |

### Backend
| Layer | Technology |
|-------|------------|
| API Gateway | Hono framework on Bun runtime (TypeScript) |
| Go services | Go 1.22, gRPC, `log/slog`, `net/http` |
| Video proxy | go2rtc (universal protocol translator + WebRTC server) |
| Transcoding | FFmpeg (recording, HLS segmentation, snapshots) |

### Data
| Store | Use |
|-------|-----|
| Supabase (PostgreSQL) | Primary database, row-level security, JWT auth |
| Redis (Upstash) | Rate limiting, event pub/sub, response cache |
| Cloudflare R2 | Video clip and snapshot object storage (zero egress fees) |
| ClickHouse | Event analytics (timeseries, heatmaps, breakdowns) |
| BoltDB | Edge agent offline event queue (embedded, no server needed) |

### Infrastructure
| Layer | Technology |
|-------|------------|
| Monorepo | pnpm workspaces + Turborepo |
| Dev containers | Docker Compose |
| Production web | Vercel |
| Production services | Fly.io (gateway + Go services) |
| Production k8s | Kubernetes manifests (base + staging/production overlays) |
| CDN | Cloudflare |
| CI/CD | GitHub Actions |

---

## 4. Monorepo Structure

```
osp/
├── apps/
│   ├── web/                    Next.js 15 dashboard
│   ├── mobile/                 React Native + Expo
│   └── desktop/                Tauri v2
├── packages/
│   ├── shared/                 Shared TypeScript types, Zod schemas, API client
│   ├── ui/                     Shared React components (shadcn/ui based)
│   └── sdk/                    Extension developer SDK
├── services/
│   ├── gateway/                Hono/Bun API gateway
│   ├── camera-ingest/          Go — camera connections, ONVIF, PTZ, health
│   ├── video-pipeline/         Go — FFmpeg recording, R2, HLS, snapshots
│   ├── event-engine/           Go — Redis sub, rule evaluation, dispatch
│   ├── extension-runtime/      Go — sandboxed JS extension execution (gRPC)
│   └── edge-agent/             Go — on-premise agent, BoltDB queue, cloud sync
├── infra/
│   ├── docker/                 docker-compose.yml, Dockerfiles, go2rtc.yaml
│   ├── k8s/                    Kubernetes manifests
│   ├── supabase/               SQL migrations (23 files), seed data
│   └── clickhouse/             schema.sql
└── docs/                       Architecture docs, PRD, this file
```

---

## 5. Database Schema

All tables live in Supabase PostgreSQL. Every table with tenant data has a
`tenant_id` column and a corresponding Row Level Security (RLS) policy.
The gateway uses the **service role key** (bypasses RLS); frontend clients
use the **anon key** (bound by RLS).

### Enums

```sql
tenant_plan:       free | pro | business | enterprise
user_role:         owner | admin | operator | viewer
camera_protocol:   rtsp | onvif | webrtc | usb | ip | rtmp | hls | mjpeg
                   | ring | wyze | tuya | gopro | arlo | isapi | dvrip
                   | ffmpeg | exec
camera_status:     online | offline | connecting | error | disabled
recording_trigger: motion | continuous | manual | rule | ai_detection
recording_status:  recording | complete | partial | failed | deleted
event_type:        motion | person | vehicle | animal | camera_offline
                   | camera_online | tampering | audio | custom
                   | lpr.detected | lpr.alert
event_severity:    low | medium | high | critical
notification_channel: push | email | webhook | sms | in_app
notification_status:  pending | sent | delivered | failed | read
extension_status:  draft | review | published | suspended | deprecated
```

### Tables (23 migrations, all RLS-enabled)

#### `tenants`
The root isolation unit. Every other table references this.
```
id            uuid PK
name          text NOT NULL
slug          text UNIQUE            -- URL slug, e.g. "acme-corp"
plan          tenant_plan DEFAULT 'free'
settings      jsonb DEFAULT '{}'     -- feature flags, preferences
branding      jsonb DEFAULT '{}'     -- custom colors, logo, company name
logo_url      text
custom_domain text
max_cameras   int DEFAULT 10
max_users     int DEFAULT 5
retention_days int DEFAULT 30
created_at    timestamptz
updated_at    timestamptz
```
RLS: No public access — all reads/writes via service role.

#### `users`
One row per Supabase auth user. Created on register or first SSO login.
```
id            uuid PK (= Supabase auth.users.id)
tenant_id     uuid FK → tenants
email         text UNIQUE
display_name  text
avatar_url    text
auth_provider text DEFAULT 'email'  -- 'email' | 'google' | 'azure' | 'github'
preferences   jsonb DEFAULT '{}'    -- UI prefs (theme, locale, etc.)
last_login_at timestamptz
push_token    text                  -- Expo push notification token
created_at    timestamptz
updated_at    timestamptz
```
RLS: Users read their own row; service role reads all.

#### `user_roles`
Maps users to roles within a tenant. A user can be restricted to specific cameras.
```
id          uuid PK
user_id     uuid FK → users
tenant_id   uuid FK → tenants
role        user_role NOT NULL
camera_ids  uuid[]    -- empty array = access all cameras
created_at  timestamptz
UNIQUE(user_id, tenant_id)
```
RLS: Users read their own role; admins read all for their tenant.

#### `cameras`
Every camera known to the system. Connecting a camera also registers it in
go2rtc automatically.
```
id              uuid PK
tenant_id       uuid FK → tenants
name            text NOT NULL
protocol        camera_protocol NOT NULL
connection_uri  text NOT NULL    -- e.g. rtsp://192.168.1.10:554/stream
status          camera_status DEFAULT 'offline'
location        jsonb            -- {lat, lng, address, floor}
capabilities    jsonb            -- {ptz, audio, twoWayAudio, hd, nightVision}
config          jsonb            -- protocol-specific settings
ptz_capable     boolean DEFAULT false
audio_capable   boolean DEFAULT false
firmware_version text
manufacturer    text
model           text
location_id     uuid FK → locations (nullable)
last_seen_at    timestamptz
created_at      timestamptz
updated_at      timestamptz
```
Indexes: tenant+status (list with filter), location (floor plan query).

#### `camera_zones`
Polygon regions on a camera frame used to scope motion detection alerts.
```
id                   uuid PK
camera_id            uuid FK → cameras
tenant_id            uuid FK → tenants
name                 text
polygon_coordinates  jsonb    -- [{x, y}, ...] normalized 0–1
alert_enabled        boolean DEFAULT true
sensitivity          int DEFAULT 5   -- 1–10
visible_to_roles     text[]   -- which roles see this zone
color_hex            text DEFAULT '#3b82f6'
sort_order           int DEFAULT 0
created_at / updated_at timestamptz
```

#### `recordings`
Every started recording segment. Continuous recording auto-segments every 30 min.
```
id             uuid PK
camera_id      uuid FK → cameras
tenant_id      uuid FK → tenants
start_time     timestamptz NOT NULL
end_time       timestamptz
duration_sec   int
storage_path   text           -- local path OR R2 object key
size_bytes     bigint
format         text DEFAULT 'hls'
trigger        recording_trigger
status         recording_status DEFAULT 'recording'
retention_until timestamptz
created_at     timestamptz
```
Indexes: camera+time (timeline query), tenant+time (library), retention (cleanup job).

#### `snapshots`
Still images captured at event time or on demand.
```
id           uuid PK
camera_id    uuid FK → cameras
recording_id uuid FK → recordings (nullable)
tenant_id    uuid FK → tenants
captured_at  timestamptz NOT NULL
storage_path text
ai_tags      jsonb    -- [{label, confidence, boundingBox}]
width_px     int
height_px    int
size_bytes   int
created_at   timestamptz
```

#### `events`
Every detection or system event. Motion, person, vehicle, LPR, camera
offline/online, audio, custom rule-triggered.
```
id               uuid PK
camera_id        uuid FK → cameras
zone_id          uuid FK → camera_zones (nullable)
tenant_id        uuid FK → tenants
type             event_type NOT NULL
severity         event_severity DEFAULT 'low'
detected_at      timestamptz NOT NULL
metadata         jsonb DEFAULT '{}'   -- detections, intensity, AI results, etc.
snapshot_id      uuid FK → snapshots (nullable)
clip_path        text                 -- local path to short MP4 clip
intensity        int DEFAULT 0        -- 0–100 motion intensity
acknowledged     boolean DEFAULT false
acknowledged_by  uuid FK → users (nullable)
acknowledged_at  timestamptz
created_at       timestamptz
```
Indexes: tenant+time, camera+time, tenant+type+time, unacknowledged (dashboard badge).

#### `alert_rules`
Visual pipeline: trigger → conditions → actions. Evaluated by the rule engine
for every incoming event.
```
id               uuid PK
tenant_id        uuid FK → tenants
name             text NOT NULL
description      text
trigger_event    event_type NOT NULL    -- which event type triggers this rule
conditions       jsonb                  -- AND/OR condition tree
actions          jsonb[]                -- [{type, ...params}] array
enabled          boolean DEFAULT true
schedule         jsonb                  -- {days[], startTime, endTime} optional active window
camera_ids       uuid[]                 -- empty = all cameras
zone_ids         uuid[]                 -- empty = all zones
cooldown_sec     int DEFAULT 60         -- minimum seconds between re-triggers
priority         int DEFAULT 0
last_triggered_at timestamptz
created_at / updated_at timestamptz
```
Condition tree example:
```json
{
  "operator": "AND",
  "conditions": [
    {"field": "severity", "op": "gte", "value": "medium"},
    {"field": "type", "op": "eq", "value": "person"}
  ]
}
```
Action types: `webhook`, `email`, `push_notification`, `record`, `in_app`.

#### `notifications`
Every notification sent to a user (push, email, in-app).
```
id            uuid PK
user_id       uuid FK → users
event_id      uuid FK → events (nullable)
tenant_id     uuid FK → tenants
channel       notification_channel
status        notification_status DEFAULT 'pending'
title         text
body          text
thumbnail_url text
payload       jsonb
sent_at       timestamptz
read_at       timestamptz
created_at    timestamptz
```

#### `extensions`
Marketplace catalog — shared across all tenants.
```
id               uuid PK
name             text UNIQUE
version          text
author_name/email text
description      text
manifest         jsonb    -- capabilities, hooks, permissions declared by extension
status           extension_status
marketplace_url  text
wasm_bundle_url  text     -- future Phase 3 WASM sandbox
icon_url         text
categories       text[]
install_count    int DEFAULT 0
avg_rating       numeric DEFAULT 0
published_at     timestamptz
created_at / updated_at timestamptz
```

#### `tenant_extensions`
Installed extensions per tenant with per-tenant config.
```
id                uuid PK
tenant_id         uuid FK → tenants
extension_id      uuid FK → extensions
config            jsonb DEFAULT '{}'
enabled           boolean DEFAULT true
installed_version text
previous_versions text[]
resource_usage    jsonb    -- CPU/memory quotas consumed
installed_at      timestamptz
updated_at        timestamptz
UNIQUE(tenant_id, extension_id)
```

#### `extension_hooks`
Hooks registered by extensions (event types they respond to).
```
id                   uuid PK
extension_id         uuid FK → extensions
hook_name            text    -- e.g. "event.motion", "recording.complete"
priority             int DEFAULT 0
handler_function     text    -- function name in the extension bundle
required_permissions text[]
created_at           timestamptz
```

#### `audit_logs`
Immutable log of all write actions performed via the API.
```
id            uuid PK
tenant_id     uuid FK → tenants
actor_id      text     -- user UUID or "system"
actor_email   text
action        text     -- e.g. "camera.create", "user.invite", "rule.delete"
resource_type text
resource_id   text
details       jsonb
ip_address    inet
user_agent    text
created_at    timestamptz
```

#### `locations`
Physical sites (buildings, campuses, stores). Cameras are assigned to locations.
```
id          uuid PK
tenant_id   uuid FK → tenants
name        text
address/city/country text
lat/lng     double precision
timezone    text
floor_plan  jsonb    -- {rooms: [{name, polygon}], walls: [...], objects: [...]}
created_at / updated_at timestamptz
```

#### `camera_tags` + `camera_tag_assignments`
Flexible tagging for grouping cameras.
```
camera_tags:
  id, tenant_id, name, color, created_at

camera_tag_assignments:
  camera_id (FK), tag_id (FK)   -- composite PK
```

#### `webhook_delivery_attempts`
Every webhook delivery attempt (success or failure) for audit and retry visibility.
```
id               uuid PK
tenant_id        uuid FK → tenants
rule_id          uuid FK → alert_rules
event_id         uuid FK → events (nullable)
url              text
request_payload  jsonb
request_headers  jsonb
attempt_number   int
delivery_status  text    -- 'delivered' | 'failed'
response_status  int
response_body    text
error_message    text
created_at       timestamptz
```
Retention: auto-purged after 90 days (documented comment in migration).

#### `config_secrets`
Runtime configuration override — key/value pairs that supplement `.env`.
```
id         uuid PK
key        text
value      text    -- encrypted at rest via OSP_ENCRYPTION_KEY
scope      text    -- 'global' | 'tenant'
tenant_id  uuid FK → tenants (nullable, for tenant-scope keys)
created_at / updated_at timestamptz
```

#### `api_keys`
Long-lived API keys for programmatic access (machine-to-machine, CI/CD).
```
id           uuid PK
tenant_id    uuid FK → tenants
created_by   uuid FK → users
name         text
key_prefix   text    -- first 8 chars shown in UI (e.g. "osp_live_")
key_hash     text    -- SHA-256 of full key; full key never stored
last_used_at timestamptz
expires_at   timestamptz (nullable)
revoked_at   timestamptz (nullable)
created_at   timestamptz
```

#### `sso_configs`
Per-tenant OAuth/SSO configuration on top of Supabase's built-in OAuth.
```
id              uuid PK
tenant_id       uuid FK → tenants
provider        text CHECK IN ('google', 'azure', 'github')
enabled         boolean DEFAULT true
allowed_domains text[]    -- e.g. ['company.com'] — empty = any domain
auto_provision  boolean DEFAULT true   -- create user on first login
default_role    user_role DEFAULT 'viewer'
created_at / updated_at timestamptz
UNIQUE(tenant_id, provider)
```

#### `lpr_watchlist`
Plates that trigger `lpr.alert` events when detected by a camera.
```
id              uuid PK
tenant_id       uuid FK → tenants
plate           text      -- uppercase normalized, e.g. "ABC1234"
label           text      -- display label, e.g. "John's Tesla"
alert_on_detect boolean DEFAULT true
created_by      uuid FK → users
created_at / updated_at timestamptz
UNIQUE(tenant_id, plate)
```

#### `edge_agents`
On-premise edge agent binaries reporting their status to the cloud.
```
id             uuid PK
tenant_id      uuid FK → tenants
agent_id       text      -- self-reported EDGE_AGENT_ID env var
name           text
location       text      -- human label, e.g. "Building A – Floor 2"
status         text CHECK IN ('online', 'offline', 'error')
version        text
cameras_active int DEFAULT 0
pending_events int DEFAULT 0   -- events buffered but not yet synced
synced_events  int DEFAULT 0
last_seen_at   timestamptz
config         jsonb DEFAULT '{}'
created_at / updated_at timestamptz
UNIQUE(tenant_id, agent_id)
```

---

## 6. API Gateway

**Runtime:** Bun · **Framework:** Hono · **Port:** 3000
**Source:** `services/gateway/src/`

### Middleware stack (applied in order)

| Middleware | What it does |
|------------|-------------|
| `requestId()` | Generates `X-Request-Id` UUID, stored in context |
| `requestLogger()` | Logs method, path, status, duration on every request |
| `metricsMiddleware()` | Increments Prometheus counters (requests, errors, latency) |
| `errorHandler()` | Catches `ApiError` and `ZodError`, formats standard JSON envelope |
| CORS | Allowed origins from `GATEWAY_CORS_ORIGINS` env var |
| `apiVersion()` | Adds `API-Version: 1` response header; supports `Accept-Version` |
| `tenantContext()` | Extracts tenant from JWT, loads plan + limits into context |
| `rateLimit()` | Redis sliding-window per tenant+route; 429 with `Retry-After` |

### `requireAuth(minRole?)` middleware

Called per-route. Reads `Authorization: Bearer <JWT>` or `X-API-Key: <key>`,
validates with Supabase, resolves `tenantId`, `userId`, `userRole` into Hono
context variables. Role hierarchy: `owner > admin > operator > viewer`.

### Error envelope

Every error response:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "CAMERA_NOT_FOUND",
    "message": "Camera not found",
    "details": "...",
    "requestId": "req_abc123",
    "timestamp": "2026-03-20T12:00:00.000Z"
  },
  "meta": null
}
```

### Success envelope

```json
{
  "success": true,
  "data": { ... },
  "meta": { "total": 42, "page": 1, "limit": 20, "hasMore": true }
}
```

### Route files

#### Auth — `POST /api/v1/auth/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | none | Create account + tenant + owner role. Hashes password via Supabase, stores user record, creates tenant, assigns `owner` role. Returns `{user, tenant, accessToken, refreshToken}`. |
| POST | `/login` | none | Email + password. Returns same token envelope. |
| POST | `/refresh` | none | Body `{refreshToken}`. Returns new access + refresh token pair. |
| POST | `/forgot-password` | none | Sends reset link email via Supabase magic link (fire-and-forget). |
| POST | `/reset-password` | none | Body `{token, password}`. Calls Supabase `verifyOtp` + `updateUser`. |
| POST | `/logout` | Bearer | Calls Supabase `signOut`. |

#### SSO — `/api/v1/auth/sso/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/providers?domain=` | none | Returns available SSO providers for an email domain. If domain given, checks `sso_configs` table. Without domain, returns all three globally. |
| GET | `/initiate?provider=&redirectTo=` | none | Returns Supabase OAuth URL: `{SUPABASE_URL}/auth/v1/authorize?provider=...&redirect_to=...`. Client redirects browser here. |
| POST | `/session` | none | Body `{accessToken, refreshToken}` from OAuth callback hash. Calls Supabase `setSession`, auto-provisions user+tenant on first login, returns OSP tokens. |
| GET | `/config` | admin+ | Lists tenant's SSO provider configs. |
| PUT | `/config/:provider` | admin+ | Upsert config: enabled, allowed_domains, auto_provision, default_role. |
| DELETE | `/config/:provider` | admin+ | Remove provider config. |

#### Cameras — `/api/v1/cameras/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | viewer+ | List cameras. Query: `status`, `search`, `locationId`, `tagIds`, `page`, `limit`. Returns array with live status. |
| GET | `/:id` | viewer+ | Single camera with zones, tags, location. |
| POST | `/` | admin+ | Create camera. Validates connection URI format, registers stream in go2rtc (auto-connects). |
| PATCH | `/:id` | admin+ | Update name, location, config. |
| PATCH | `/:id/capabilities` | admin+ | Enable/disable PTZ, audio, twoWayAudio. If twoWayAudio changes on ONVIF cameras, re-registers stream with `?backchannel=1`. |
| DELETE | `/:id` | admin+ | Delete camera record, removes from go2rtc, stops any active recording. |
| POST | `/bulk/assign-location` | admin+ | Body `{cameraIds, locationId}`. |
| POST | `/bulk/delete` | admin+ | Body `{cameraIds}`. |
| POST | `/bulk/record-start` | operator+ | Starts manual recording on multiple cameras. |
| POST | `/bulk/record-stop` | operator+ | Stops recording on multiple cameras. |
| POST | `/:id/record/start` | operator+ | Body `{trigger}`. Creates recording row, calls `recording.service`. |
| POST | `/:id/record/stop` | operator+ | Stops recording, finalises MP4, optionally uploads to R2. |
| GET | `/:id/record/status` | viewer+ | Is this camera currently recording? Returns `{recording: bool, recordingId?}`. |
| POST | `/:id/ptz` | operator+ | Body: `{action: move|stop|zoom|preset, direction?, speed?, presetId?}`. Forwards to camera-ingest gRPC `PtzCommand`. Falls back gracefully if gRPC unavailable. |
| GET | `/:id/zones` | viewer+ | List zones for camera. |
| POST | `/:id/zones` | admin+ | Create zone with polygon coordinates and sensitivity. |
| PATCH | `/:id/zones/:zoneId` | admin+ | Update zone. |
| DELETE | `/:id/zones/:zoneId` | admin+ | Delete zone. |
| GET | `/internal/online` | service token | Returns all `status=online` cameras. Used by Go ingest workers. |

#### Streams — `/api/v1/cameras/:id/*` and `/api/v1/streams/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/:id/stream` | viewer+ | Returns `{whepUrl, token, iceServers}`. ICE servers include STUN always; TURN when env vars present. |
| POST | `/:id/whep` | viewer+ | SDP offer proxy. Registers camera in go2rtc if missing, forwards WHEP POST. |
| GET | `/:id/snapshot` | viewer+ | Returns JPEG from `go2rtc /api/frame.jpeg?src=:id`. |
| POST | `/:id/reconnect` | admin+ | Removes + re-adds stream in go2rtc (hard reconnect). |
| GET | `/:id/recording.mp4` | viewer+ | Proxies MP4 stream from go2rtc (last 30 s clip). |
| POST | `/discover` | admin+ | Runs USB detection + ONVIF network scan on given subnet. Returns list of discovered cameras with connection URIs. |
| POST | `/test` | admin+ | Test a connection URI before saving. Tries to grab one JPEG frame from go2rtc. Returns `{success, snapshotUrl?, error?}`. |

#### Events — `/api/v1/events/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | operator+ | Create event. Fires rule evaluation + AI detection + LPR in background. Publishes to Redis → WebSocket. |
| GET | `/` | viewer+ | List events. Query: `cameraId`, `zoneId`, `type`, `severity`, `acknowledged`, `startDate`, `endDate`, `page`, `limit`. |
| GET | `/summary` | viewer+ | Aggregated counts by type/severity/camera for a time range. |
| GET | `/:id` | viewer+ | Single event with camera name, zone name, snapshot, clip URL. |
| PATCH | `/:id/acknowledge` | operator+ | Mark acknowledged, stores `acknowledged_by` + timestamp. |
| GET | `/:id/clip` | viewer+ | Stream event MP4 clip with range request support. |
| GET | `/:id/thumbnail` | viewer+ | JPEG first frame extracted from clip with FFmpeg. |
| POST | `/bulk-acknowledge` | operator+ | Body `{eventIds}`. Batch acknowledge. |

#### Recordings — `/api/v1/recordings/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | viewer+ | List recordings. Query: `cameraId`, `trigger`, `status`, `startDate`, `endDate`. |
| GET | `/timeline?cameraId=&date=` | viewer+ | Recording segments + events for timeline scrubber. Returns segments as `{start, end, id}` array. |
| GET | `/:id` | viewer+ | Recording details including signed playback URL (R2 presigned or local path). |
| GET | `/:id/play` | viewer+ | Stream MP4 with HTTP range requests. Redirects to R2 presigned URL if stored there; otherwise proxies local file. |
| DELETE | `/:id` | admin+ | Deletes recording file and row. |

#### Rules — `/api/v1/rules/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | viewer+ | List alert rules. |
| POST | `/` | admin+ | Create rule. Validates condition tree + actions array. |
| GET | `/:id` | viewer+ | Get rule with last trigger time + delivery stats. |
| PATCH | `/:id` | admin+ | Update rule. |
| DELETE | `/:id` | admin+ | Delete rule. |
| POST | `/:id/test` | admin+ | Simulate rule against the last 10 events of the trigger type. Returns `{matched: bool, matchedEvents: [...]}`. |
| GET | `/webhook-attempts` | admin+ | Paginated delivery log. Query: `ruleId`, `eventId`, `status` (delivered/failed). |

#### Tenants — `/api/v1/tenants/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/current` | viewer+ | Current tenant with plan limits. |
| PATCH | `/current` | owner | Update name, slug, settings. |
| PATCH | `/current/branding` | owner | Update logo URL, custom colors. |
| GET | `/current/users` | admin+ | List users with roles, last login. |
| POST | `/current/users/invite` | admin+ | Send invite email. Creates pending user record. |
| PATCH | `/current/users/:userId/role` | owner | Change role. Cannot demote last owner. |
| DELETE | `/current/users/:userId` | admin+ | Remove user from tenant. Cannot remove only owner. |
| GET | `/current/usage` | admin+ | Camera count, user count, storage used, extensions installed. |

#### Locations — `/api/v1/locations/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | viewer+ | List locations with camera counts. |
| POST | `/` | admin+ | Create location with optional floor plan. |
| GET | `/:id` | viewer+ | Get location with camera count. |
| PATCH | `/:id` | admin+ | Update including floor plan JSON (canvas polygon objects). |
| DELETE | `/:id` | admin+ | Delete location (cameras' location_id set to null). |
| GET | `/:id/cameras` | viewer+ | Cameras assigned to this location. |

#### Tags — `/api/v1/tags/*` and `/api/v1/cameras/:id/tags`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | viewer+ | List all tags. |
| POST | `/` | admin+ | Create tag with color. |
| DELETE | `/:id` | admin+ | Delete tag + all assignments. |
| GET | `/cameras/:id/tags` | viewer+ | Tags assigned to camera. |
| POST | `/cameras/:id/tags` | admin+ | Assign tags to camera (replaces all). |
| DELETE | `/cameras/:id/tags/:tagId` | admin+ | Remove one tag. |

#### Extensions — `/api/v1/extensions/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/marketplace` | viewer+ | Browse published extensions with categories, ratings. |
| GET | `/marketplace/:id` | viewer+ | Extension detail page. |
| GET | `/` | admin+ | Tenant's installed extensions. |
| POST | `/` | admin+ | Install extension (checks plan limits). |
| PATCH | `/:id/config` | admin+ | Update extension config (merged with defaults). |
| PATCH | `/:id/toggle` | admin+ | Enable/disable without uninstalling. |
| DELETE | `/:id` | admin+ | Uninstall. |

#### API Keys — `/api/v1/api-keys/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | admin+ | List keys (prefix shown, hash never returned). |
| POST | `/` | admin+ | Create key. Returns full key **once** — not stored. |
| DELETE | `/:id` | admin+ | Revoke key (sets `revoked_at`). |

#### Users — `/api/v1/users/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| PATCH | `/push-token` | Bearer | Register Expo push notification token for mobile app. |

#### LPR — `/api/v1/lpr/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/status` | viewer+ | `{configured: bool, provider: "platerecognizer"}`. |
| GET | `/watchlist` | viewer+ | List watchlist entries. |
| POST | `/watchlist` | admin+ | Add plate. Normalizes to uppercase, deduplicates. |
| PATCH | `/watchlist/:id` | admin+ | Toggle `alert_on_detect` or update label. |
| DELETE | `/watchlist/:id` | admin+ | Remove plate. |
| GET | `/detections` | viewer+ | Recent LPR detections (from events with type `lpr.detected`). |

#### Analytics — `/api/v1/analytics/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/timeseries?interval=&start=&end=` | viewer+ | Event counts over time (ClickHouse). |
| GET | `/heatmap?start=&end=` | viewer+ | 24×7 grid of event counts by hour/day. |
| GET | `/breakdown?by=type|severity|camera` | viewer+ | Pie/bar breakdown. |
| GET | `/camera-activity?cameraId=` | viewer+ | Per-camera event timeline. |
| GET | `/recordings-summary` | viewer+ | Recording storage totals by day. |

#### Edge Agents — `/api/v1/edge/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/agents/register` | X-Tenant-Id + API key | Upsert agent record (called by edge agent on startup). |
| POST | `/agents/:agentId/heartbeat` | X-Tenant-Id | Update status, pending count, last_seen_at. Returns 200 always. |
| GET | `/agents` | viewer+ | List all registered edge agents. |
| GET | `/agents/:agentId` | viewer+ | Single agent. |
| PATCH | `/agents/:agentId` | admin+ | Update name, location, config. |
| DELETE | `/agents/:agentId` | admin+ | Remove agent record. |

#### Config — `/api/v1/config/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | owner | List config keys (values masked). |
| PUT | `/:key` | owner | Set config value. Encrypted at rest. |
| DELETE | `/:key` | owner | Remove config key. |

#### Health — `/health/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | none | `{status: ok, services: {supabase, redis, go2rtc}}`. |
| GET | `/metrics` | none | Prometheus text format (counters, histograms). |

#### Docs — `/docs`

Scalar API documentation rendered from OpenAPI spec. No auth required.

#### Dev — `/api/v1/dev/*` (development only)

Seed data, test helpers, dev shortcuts. Disabled in production via env guard.

---

## 7. WebSocket Server

**Port:** 3002 (separate from HTTP on 3000)
**Source:** `services/gateway/src/ws/server.ts`

The WebSocket server broadcasts real-time events to all browser/mobile clients.
It runs alongside the Hono HTTP server in the same Bun process.

### Connection flow

1. Client connects: `ws://host:3002/?token=<JWT>`
2. Server validates JWT via Supabase `auth.getUser(token)`, extracts `tenant_id`
3. On success: sends `{type: "connected", clientId, tenantId}`
4. On failure: sends error then closes with code `4001`

### Client → Server messages

| Type | Payload | Effect |
|------|---------|--------|
| `subscribe` | `{cameraIds?, eventTypes?, minSeverity?}` | Adds filters; client only receives matching events |
| `ping` | none | Server responds `{type: "pong"}` |

### Server → Client messages

| Type | Payload | When |
|------|---------|------|
| `connected` | `{clientId, tenantId}` | On successful auth |
| `event` | full `OSPEvent` object | When matching event published to Redis |
| `ping` | none | Every 30 s keepalive |
| `error` | `{code, message}` | Auth failure, bad message |

### Event routing

- Redis subscription: `PSUBSCRIBE events:*`
- Channel pattern: `events:{tenantId}`
- When an event is published to Redis, the WS server pattern-matches the channel to extract `tenantId`, finds all connected clients for that tenant, applies each client's filters, and sends to matching clients

### Reconnect handling

The frontend (`use-event-stream.ts`) automatically reconnects on disconnect.
If it receives `4001 Authentication failed`, it first refreshes the JWT then
reconnects with the new token. After 3 consecutive auth failures it shows an
error state and stops retrying.

---

## 8. Web Application

**Framework:** Next.js 15 App Router · **Styling:** Tailwind CSS + shadcn/ui
**Source:** `apps/web/src/`

### Route groups

```
app/
├── (auth)/          No sidebar, centered layout
│   ├── login/
│   ├── register/
│   ├── callback/    OAuth return page
│   ├── forgot-password/
│   └── reset-password/
├── (dashboard)/     Sidebar + topbar layout
│   ├── cameras/
│   ├── cameras/[id]/
│   ├── events/
│   ├── recordings/
│   ├── rules/
│   ├── locations/
│   ├── locations/[id]/
│   ├── settings/
│   ├── extensions/
│   ├── analytics/
│   ├── health/
│   └── monitor/
└── wall/            Fullscreen camera wall (no nav)
```

### Auth pages

**`/login`** — Email/password form + Google/Microsoft/GitHub SSO buttons.
On submit: `POST /api/v1/auth/login`, stores `osp_access_token` +
`osp_refresh_token` in localStorage. SSO: calls `/initiate`, redirects browser
to Supabase OAuth URL.

**`/register`** — Account creation. On submit: `POST /api/v1/auth/register`.
First user becomes `owner` of automatically-created tenant.

**`/auth/callback`** — OAuth return page. Reads `#access_token=...&refresh_token=...`
from URL hash fragment. Posts to `/api/v1/auth/sso/session`. Stores tokens,
redirects to `/cameras`.

**`/forgot-password`** / **`/reset-password`** — Standard password reset flow.

### Dashboard pages

**`/cameras`** — Camera grid/list. Features:
- Live MJPEG thumbnail previews (10 s refresh via go2rtc `/api/frame.jpeg`)
- Status dot (online/offline/connecting/error) with pulse animation
- Search, filter by status/location/tag
- Bulk actions (assign location, start recording, delete)
- Camera discovery wizard (network scan + USB)
- Add camera modal with protocol selector and connection test

**`/cameras/[id]`** — Full camera detail page. Six tabs:
- **Live** — WebRTC video player (WHEP), falls back to MP4 stream, then MJPEG. PTZ controls (joystick + presets). Two-way audio toggle (mic button opens getUserMedia, sends WebRTC backchannel). Recording start/stop with REC badge + duration timer.
- **Timeline** — Recordings bar with 24 h scrubber. Click segment → video player seeks to that time. Events overlaid as pins.
- **Events** — Filtered event list for this camera.
- **Zones** — Canvas polygon zone editor. Draw zones, set sensitivity per zone.
- **Settings** — Edit camera name, protocol, URI, capabilities (PTZ, audio, twoWayAudio).
- **Info** — Manufacturer, model, firmware, connection metadata.

**`/events`** — Event feed. Features:
- Real-time updates via WebSocket (new events appear without refresh)
- Filters: type, severity, camera, date range, acknowledged status
- Acknowledge individually or bulk-acknowledge
- Click event → detail panel with snapshot, clip player, AI detections
- CSV/JSON export

**`/recordings`** — Recording library. Features:
- Grouped by date
- Playback via HTML5 video + range requests
- Filter by camera, trigger, date
- CSV/JSON export

**`/rules`** — Alert rule builder. Features:
- Visual pipeline: Trigger box → Conditions block → Actions block
- Trigger selector (event type)
- Condition tree editor (AND/OR, field/op/value)
- Action cards: Webhook (URL + headers + payload template), Email, Push notification, Record clip
- Schedule (active hours + days of week)
- Cooldown slider
- Test rule against recent events
- Webhook delivery log panel (per rule, with request/response detail)

**`/locations`** — Location management. Features:
- Map view (lat/lng markers)
- Floor plan editor (canvas — draw rooms, walls, place camera markers)
- Assign cameras to locations

**`/settings`** — Multi-tab settings. Tabs:
| Tab | Contents |
|-----|----------|
| Cameras | Camera list management (duplicate of main list, shortcut to add) |
| Users & Roles | Invite users, change roles, remove members |
| Notifications | Push, email, webhook toggles per event type/severity |
| Recording | Default mode (motion/continuous/off), retention days, storage path |
| Extensions | Extensions shortcut |
| Tenant | Name, slug, plan info |
| Billing | Plan comparison, upgrade CTA |
| API Keys | Create/revoke API keys, show prefix + last used |
| SSO / Identity | Toggle Google/Microsoft/GitHub; allowed domains; auto-provision; default role; setup instructions |
| License Plates | LPR status, watchlist CRUD |
| Edge Agents | List registered agents with status/queue depth; Docker run command |
| Desktop App | Autostart toggle, native notification test |

**`/extensions`** — Marketplace. Features:
- Browse published extensions by category
- Install with one click
- Configure per-extension settings
- Enable/disable without uninstalling
- Demo extensions: motion heatmap, people counter, ANPR, ALPR, Slack alerts, Teams alerts, PagerDuty, SMS via Twilio

**`/analytics`** — ClickHouse-powered dashboards. Features:
- Event timeline (line chart)
- Event type breakdown (donut)
- Hourly heatmap (24×7 grid)
- Camera activity bar chart
- Recording storage trend
- 24h / 7d / 30d / 90d presets

**`/health`** — System health dashboard. Features:
- Gateway status, Redis ping, Supabase connectivity
- go2rtc stream list with individual stream health
- Memory/CPU metrics from gateway Prometheus endpoint
- Camera status summary

**`/monitor`** — Multi-camera wall view inside dashboard. Layouts: 1×1, 2×2, 3×3, 2×3, 1+5, 1+7. Auto-rotate option. "Open Wall" button.

**`/wall`** — Fullscreen camera wall (no sidebar). Eight layouts (1×1 through 4×4, 1+5, 1+7). Features:
- HUD auto-hides after 3.5 s, reappears on mouse move
- Auto-rotate pages with amber progress bar
- URL params: `?layout=`, `?rotate=`, `?filter=online`
- Keyboard shortcuts: 1-8 (layouts), F (fullscreen), R (rotate), ← / → (pages), ? (shortcut legend)
- "Dashboard" back button

### Key hooks and lib

| File | Purpose |
|------|---------|
| `hooks/use-cameras.ts` | TanStack Query for camera list |
| `hooks/use-events.ts` | Events with polling |
| `hooks/use-event-stream.ts` | WebSocket connection + reconnect logic |
| `hooks/use-live-feed.ts` | WebRTC WHEP + fallback chain |
| `hooks/use-recordings.ts` | Recording list + timeline |
| `hooks/use-analytics.ts` | ClickHouse analytics queries |
| `hooks/use-tray-sync.ts` | Tauri tray badge sync |
| `lib/api.ts` | Fetch wrapper with JWT refresh interceptor |
| `lib/jwt.ts` | Token decode, expiry check |
| `lib/transforms.ts` | API response → UI type conversions |
| `lib/notifications.ts` | Web/native push notification registration |
| `lib/tauri.ts` | Typed Tauri bridge (isTauri, updateTrayStatus, …) |
| `lib/export.ts` | CSV + JSON export for events/recordings |
| `stores/toast.ts` | Global toast notification store (Zustand) |
| `stores/sidebar.ts` | Sidebar open/close state |
| `stores/theme.ts` | Dark/light theme |
| `stores/notification-prefs.ts` | Per-channel notification preferences |

### Global features

- **Keyboard shortcuts:** `Cmd+K` (command palette), `?` (shortcuts modal), `1-6` (nav jump)
- **Onboarding wizard:** First-time user flow (add camera → test → view live)
- **Error boundaries:** All pages wrapped; toast on API errors
- **Dark/light theme:** Persisted in localStorage
- **Responsive mobile web:** Collapsible sidebar drawer + bottom navigation bar
- **Sentry integration:** Browser error reporting via `sentry.client.config.ts`

---

## 9. Mobile Application

**Framework:** React Native + Expo · **Source:** `apps/mobile/`

### Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Login | `/login` | Email/password auth, stores tokens in SecureStore |
| Register | `/register` | Account creation |
| Camera List | `/(tabs)/cameras` | Grid of camera thumbnails (5 s MJPEG refresh) |
| Camera Detail | `/camera/[id]` | WebRTC live view + MJPEG fallback; PTZ; recording; motion zones list |
| Events | `/(tabs)/events` | Event feed with severity color coding |
| Recordings | `/(tabs)/recordings` | Date-grouped recordings list; cached offline (AsyncStorage) |
| Settings | `/(tabs)/settings` | User profile, tenant info, push notification preferences |
| Recording Controls | `/camera/[id]/record` | Full-screen recording timer, start/stop |

### Key features

- **WebRTC live view** — `MobileLiveViewWebRTCPlayer.tsx` uses `react-native-webrtc`
  for WHEP-based live streaming. Falls back to MJPEG snapshot refresh (3 s) on
  ICE failure or timeout.
- **Offline recordings** — `AsyncStorage` cache via `recordings-cache.ts`. Loads
  cache immediately on mount (no blank spinner), fetches fresh in background, shows
  amber "Offline — cached Xm ago" banner on failure.
- **Motion zones on mobile** — Fetches zones via API, displays name/sensitivity/alert
  toggle. Toggle calls `PATCH /cameras/:id/zones/:zoneId` with optimistic update.
- **Push notifications** — Registers Expo token via `PATCH /users/push-token`. Native
  notification arrives via Expo Push API from the server.
- **Offline detection banner** — NetInfo monitoring, amber banner when offline.

---

## 10. Desktop Application

**Framework:** Tauri v2 · **Source:** `apps/desktop/`

The desktop app is a native OS window wrapping the Next.js web app.
In dev mode it loads `http://localhost:3001`. In production builds the user
enters their server URL on a connect screen; the webview navigates there.

### Features

| Feature | Implementation |
|---------|----------------|
| System tray | `tauri-plugin-notification` — live camera count + alert count in tooltip |
| Tray left-click | Toggle window show/hide |
| Tray menu | Open / Start at Login / Quit |
| Minimize to tray | `×` button hides window instead of quitting |
| Auto-start on login | `tauri-plugin-autostart` (toggle in Settings → Desktop App) |
| Native notifications | Replaces Web Notifications API (`isTauri()` guard in `notifications.ts`) |
| Connection screen | Production mode: user enters server URL, verified with `/health`, then webview loads it |

### Build

```bash
pnpm --filter @osp/web dev          # Next.js dev server on :3001
pnpm --filter @osp/desktop dev      # Opens Tauri window
pnpm --filter @osp/desktop build    # Produces .dmg / .msi / .deb
```

---

## 11. Go Microservices

All Go services share the same patterns:
- Module path: `github.com/MatiDes12/osp/services/<name>`
- Go 1.22 / CGO disabled / Alpine Docker image
- `internal/log/log.go` — structured slog JSON logging with startup/shutdown banners
- Graceful shutdown on `SIGINT`/`SIGTERM`

### Camera Ingest Service

**Port:** gRPC 50051 · **Health:** 8080
**Source:** `services/camera-ingest/`

**Responsibilities:**
- Manages camera stream registrations in go2rtc via its HTTP API
- Monitors camera health at configurable intervals (default 30 s)
- Publishes `camera:status` Redis channel events on status changes
- Handles PTZ commands via ONVIF SOAP over go2rtc

**Key packages:**

| Package | Description |
|---------|-------------|
| `internal/camera` | Camera CRUD business logic |
| `internal/stream` | go2rtc HTTP client (add/remove/list streams) |
| `internal/health` | Per-camera health monitor, status state machine |
| `internal/ptz` | PTZ controller — translates gRPC actions to ONVIF SOAP |
| `internal/discovery` | ONVIF multicast discovery (WS-Discovery) |
| `internal/server` | gRPC handler implementation |
| `pkg/motion` | Pure-Go JPEG pixel-diff motion detector (1 fps polling) |

**gRPC API (proto: `camera_ingest.proto`):**
- `AddCamera(id, uri, protocol, config)` — registers stream in go2rtc
- `RemoveCamera(id)` — removes from go2rtc
- `GetCameraStatus(id)` — returns current status
- `PtzCommand(cameraId, action, direction, speed, presetId)` — forwards PTZ

**Motion detection (inline worker):**
- `MotionService.StartPolling(ctx)` — 1-fps ticker, fetches JPEG from go2rtc for each camera
- `Detector.ProcessJPEG()` — RGBA pixel diff against previous frame
- Sensitivity 1–10 maps to diff ratio threshold 0.050–0.005
- Cooldown prevents event flooding (default 10 s per camera)
- On motion: calls `eventCallback(EventData{CameraID, DetectedAt, Intensity})`

### Video Pipeline Service

**Port:** gRPC 50052 · **Health:** 8081
**Source:** `services/video-pipeline/`

**Responsibilities:**
- Manages FFmpeg recording processes (start/stop/segment)
- Uploads completed recordings to Cloudflare R2
- Extracts snapshots (first frame of clip)
- Runs retention cleanup job (deletes files older than tenant's retention_days)
- Spools recordings locally until R2 upload succeeds

**Key packages:**

| Package | Description |
|---------|-------------|
| `internal/recording` | FFmpeg process lifecycle, segment detection |
| `internal/storage` | R2 upload (AWS SDK S3-compatible), spool queue |
| `internal/snapshot` | FFmpeg `-frames:v 1` extraction |
| `internal/retention` | Periodic cleanup of expired recordings + R2 objects |
| `internal/playback` | Generate signed playback URLs (presigned R2 or local path) |
| `internal/db` | PostgreSQL queries (recordings table) |
| `internal/dualdb` | Dual-write to primary + cloud mirror DB |

### Event Engine Service

**Port:** gRPC 50053 · **Health:** 8082
**Source:** `services/event-engine/`

**Responsibilities:**
- Subscribes to Redis `events:*` channels
- Persists incoming events to PostgreSQL
- Evaluates alert rules against each event
- Dispatches actions (email, push, webhook) for matched rules
- Maintains rule cache with Redis-based invalidation

**Key packages:**

| Package | Description |
|---------|-------------|
| `internal/events` | Event repository (Postgres), publisher, subscriber |
| `internal/rules` | Rule engine: condition tree evaluator, cooldown, cache |
| `internal/dispatch` | Notification dispatchers: push (Expo), email (SendGrid), webhook |
| `internal/audit` | Writes to audit_logs table |
| `internal/dualdb` | Dual-write pattern |

**Rule evaluation:**
1. Event arrives via Redis subscriber
2. Load all enabled rules for tenant (from cache or DB)
3. For each rule: check `trigger_event` matches, evaluate condition tree (recursive AND/OR), check cooldown not expired, check camera/zone whitelist
4. For each matched rule: dispatch all actions

**Condition operators:** `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`
**Condition fields:** `type`, `severity`, `intensity`, `cameraId`, `zoneId`, `metadata.*`

### Extension Runtime Service

**Port:** gRPC 50054 · **Health:** 8083
**Source:** `services/extension-runtime/`

**Current state:** gRPC server scaffold. Extension execution happens in the
gateway's `extension-runner.ts` (Node.js `vm` module). Phase 3 will migrate
to this service with WASM sandbox via `isolated-vm`.

### Gateway Extension Runner

**Source:** `services/gateway/src/services/extension-runner.ts`

The current JS extension execution:
- Uses Node.js `vm` module with `codeGeneration: {strings: false, wasm: false}`
- Timeout clamped to prevent infinite loops
- Guarded by `EXTENSION_ALLOW_INLINE_SOURCE=true` env var (must explicitly enable; off in prod)
- Extensions receive a sandboxed context with `console`, `fetch` (mocked), and OSP event data
- Phase 3: migrate to `isolated-vm` for stronger V8 isolation

---

## 12. Edge Agent

**Port:** HTTP 8084 · **Language:** Go 1.22
**Source:** `services/edge-agent/`

A lightweight binary deployed on-premise alongside a local go2rtc instance.
Runs offline-first: all events are buffered to local BoltDB and synced to the
cloud gateway when connectivity is available.

### Architecture

```
Local site:
  go2rtc ← cameras (RTSP/USB)
     ↓ 1fps JPEG frames
  Edge Agent
     ↓ motion detected
  BoltDB queue          ←→ HTTP heartbeat + event sync
     ↑ sync loop              ↓
  (offline buffer)     Cloud Gateway API
```

### Internal packages

| Package | Description |
|---------|-------------|
| `internal/config` | Env var config loading (EDGE_AGENT_ID, CLOUD_GATEWAY_URL, etc.) |
| `internal/log` | Shared slog structured logger (same as other Go services) |
| `internal/storage` | BoltDB wrapper: enqueue, get pending, mark synced, prune old |
| `internal/motion` | Pure-Go JPEG pixel-diff motion detector (adapted from camera-ingest) |
| `internal/camera` | Camera manager: static list or auto-discover from go2rtc |
| `internal/sync` | Cloud sync loop: heartbeat + batch event upload (50/cycle) |
| `internal/health` | HTTP `/health` + `/status` endpoints |

### Sync behaviour

- **Heartbeat:** `POST /api/v1/edge/agents/:agentId/heartbeat` every `SYNC_INTERVAL_SECONDS` (default 30)
- **Event sync:** Up to 50 pending events per sync cycle sent to `POST /api/v1/events`
- **Offline:** Events buffer indefinitely in BoltDB; prune synced events older than 24 h
- **Connectivity change:** Logs state change; `cloudOnline` bool exposed in `/status`

### Environment variables

```env
EDGE_AGENT_ID=site-01
EDGE_AGENT_NAME=Building A
CLOUD_GATEWAY_URL=https://your-gateway.fly.dev
CLOUD_API_TOKEN=<api-key>
TENANT_ID=<tenant-uuid>
GO2RTC_URL=http://localhost:1984
CAMERA_IDS=cam1,cam2,cam3          # or auto-discover from go2rtc
SYNC_INTERVAL_SECONDS=30
MOTION_SENSITIVITY=5               # 1-10
MOTION_COOLDOWN_SECONDS=10
DATA_DIR=./data                    # BoltDB location
EDGE_HTTP_PORT=8084
```

### Docker

```bash
docker run -d --name osp-edge \
  -e EDGE_AGENT_ID=site-01 \
  -e CLOUD_GATEWAY_URL=https://... \
  -e CLOUD_API_TOKEN=... \
  -e TENANT_ID=... \
  -p 8084:8084 \
  -v edge-data:/data \
  osp-edge-agent
```

---

## 13. Video Pipeline

### go2rtc

go2rtc is the universal camera protocol translator and WebRTC server.

**Ports:**
- `1984` — HTTP API (stream management, MJPEG, JPEG snapshots, WHEP, WHIP)
- `8554` — RTSP server (re-stream all cameras as RTSP)
- `8555` — WebRTC server (ICE candidates from this port)

**Config (`infra/docker/go2rtc.yaml`):**
```yaml
api:
  listen: :1984
rtsp:
  listen: :8554
webrtc:
  listen: :8555
  candidates:
    - 127.0.0.1:8555
  ice_servers:
    - urls: [stun:stun.l.google.com:19302]
  ice_servers_client:
    - urls: [stun:stun.l.google.com:19302]
    # TURN added from env if TURN_SERVER_URL is set
ffmpeg:
  bin: ffmpeg
log:
  level: warn
  format: text
```
Audio codecs include `opus` for WebRTC two-way audio backchannel.

### WebRTC live view (WHEP)

```
Browser                    Gateway              go2rtc           Camera
   |                          |                    |               |
   |-- POST /cameras/:id/whep |                    |               |
   |   (SDP offer)            |                    |               |
   |                          |-- POST /api/whep -- |               |
   |                          |                    |-- RTSP pull --|
   |                          |<--- SDP answer ----|               |
   |<-- SDP answer -----------|                    |               |
   |                                               |               |
   |<========= WebRTC RTP media (direct) =========|               |
```

ICE servers returned by `GET /cameras/:id/stream`:
- Always: `stun:stun.l.google.com:19302`
- Optional: TURN server from `TURN_SERVER_URL` env var (needed for NAT traversal)

### Recording

**Manual trigger:** `POST /cameras/:id/record/start`
**Motion trigger:** health-checker detects motion → calls recording start API
**Continuous:** starts on camera register if `recordingMode=continuous`

Recording flow:
1. `recording.service.ts` creates DB row (`status: recording`)
2. Calls go2rtc `GET /api/stream.mp4?src=:id` (FFmpeg MP4 mux) to local file
3. On stop: finalizes MP4, calculates duration + size, updates DB row
4. If `R2_ACCESS_KEY_ID` set: uploads to R2 at `{tenantId}/{cameraId}/{timestamp}.mp4`
5. Extracts thumbnail with `ffmpeg -i file.mp4 -frames:v 1 thumbnail.jpg`
6. Sets `storage_path` to R2 key (for presigned URL) or local path

**30-min auto-segmentation:** A background timer in `recording.service.ts` watches
active recordings and triggers stop+restart every 30 minutes for continuous mode.

**Retention cleanup:** `CameraHealthChecker` runs hourly, deletes local clip files
older than 7 days, clears `clip_path` column on pruned rows.

### HLS

go2rtc can serve cameras as HLS (`/api/stream.m3u8?src=:id`). The gateway exposes
this via the `/:id/recording.mp4` and stream endpoints.

### Two-way audio

For ONVIF cameras with `twoWayAudio` capability enabled:
1. go2rtc registers stream with `?backchannel=1` appended to ONVIF URI
2. go2rtc negotiates `sendrecv` audio with `opus` codec
3. Browser opens microphone (`getUserMedia`), adds track to WebRTC connection
4. go2rtc forwards audio back to camera via ONVIF backchannel

---

## 14. Real-Time Event System

### Flow

```
Event created (API / motion detector / AI / LPR)
        ↓
  PostgreSQL INSERT (events table)
        ↓
  Redis PUBLISH events:{tenantId} <event JSON>
        ↓
  WS server psubscribes events:*
        ↓
  For each connected client in that tenant:
    - Apply client filters (cameraIds, eventTypes, minSeverity)
    - Send {type: "event", data: <OSPEvent>} via WebSocket
        ↓
  Browser: useEventStream hook receives event
        ↓
  Toast notification + events list update
```

### Event publisher (`lib/event-publisher.ts`)

```typescript
publishEvent(tenantId: string, event: OSPEvent): Promise<void>
// Redis PUBLISH events:{tenantId} JSON.stringify(event)
```

### Event shape (`OSPEvent` from `@osp/shared`)

```typescript
{
  id: string
  cameraId: string
  cameraName: string
  zoneId: string | null
  zoneName: string | null
  tenantId: string
  type: EventType
  severity: EventSeverity
  detectedAt: string        // ISO 8601
  metadata: Record<string, unknown>
  snapshotUrl: string | null
  clipUrl: string | null
  intensity: number          // 0–100
  acknowledged: boolean
  acknowledgedBy: string | null
  acknowledgedAt: string | null
  createdAt: string
}
```

---

## 15. Authentication & Authorization

### JWT flow

1. Login → Supabase issues JWT containing `user_metadata.tenant_id` and `user_metadata.role`
2. Frontend stores `osp_access_token` + `osp_refresh_token` in localStorage
3. Every API request: `Authorization: Bearer <access_token>`
4. Gateway `requireAuth()` middleware: calls `supabase.auth.getUser(token)`, extracts `tenantId`, `userId`, `userRole` from JWT claims
5. Token expiry: `api.ts` proactively refreshes 60 s before expiry; on 401 attempts refresh then retries

### Role hierarchy

```
owner    > admin    > operator  > viewer
create     manage     record      read
tenant     cameras    events      cameras
settings   users      acknowledge events
           rules      PTZ
```

A user with role `viewer` on a specific camera list (non-empty `camera_ids`) can
only see those cameras, not all tenant cameras.

### API Keys

- Created via `POST /api/v1/api-keys` — returns full key once
- Key format: `osp_live_<random 32 bytes>` (prefix `osp_live_` or `osp_test_`)
- Stored as: `key_prefix` (first 8 chars) + `key_hash` (SHA-256 of full key)
- On request: gateway hashes incoming `X-API-Key` header value and looks up in DB
- Keys carry the `owner` role of the creating user

### SSO

Uses Supabase's built-in OAuth (works on all Supabase plans):
1. Frontend calls `GET /initiate?provider=google` → gets Supabase OAuth URL
2. Browser redirects to Google (or Azure/GitHub), user authenticates
3. Supabase redirects back to `/auth/callback` with `#access_token=...` in hash
4. Callback page calls `POST /sso/session` with Supabase tokens
5. Gateway creates/finds user record, creates tenant if auto_provision=true, returns OSP tokens

**Domain restriction:** If `sso_configs.allowed_domains = ['company.com']`, users with
emails outside that domain get a 403.

### Rate limiting

Redis sliding-window counter per `{tenantId}:{normalizedPath}`. UUIDs in paths
are replaced with `:id` for bucketing. Default limits: 100 req/min on most
endpoints. On exceed: `429 Too Many Requests` with `Retry-After` header.
`RATE_LIMIT_FAIL_OPEN=true` (default): requests allowed if Redis is down.

---

## 16. Rule Engine & Action Dispatch

### Rule evaluator (`lib/rule-evaluator.ts`)

Called on every new event. Steps:
1. Load all `enabled=true` rules for tenant (Redis-cached with 60 s TTL; invalidated on rule change)
2. Filter rules by `trigger_event` matching event type
3. Check `camera_ids` filter (empty = all cameras)
4. Check `zone_ids` filter
5. Evaluate `conditions` tree recursively
6. Check cooldown: `last_triggered_at + cooldown_sec > now` → skip
7. Check schedule: if rule has schedule, check current day/time falls in window

### Action executor (`lib/action-executor.ts`)

Called with each matched rule + event context. Actions execute independently
(failure of one doesn't block others). Updates `last_triggered_at`.

**Action types:**

| Type | What happens |
|------|-------------|
| `webhook` | HTTP POST to configured URL with event payload. Up to 5 retries with exponential backoff (1s, 2s, 4s, 8s). Each attempt logged to `webhook_delivery_attempts`. |
| `email` | Sends formatted HTML email via SendGrid API v3. Uses `alertEmailTemplate`. Includes camera name, event type, severity, snapshot link. |
| `push_notification` | Fetches all user `push_token` values for tenant. Posts to Expo Push API `https://exp.host/--/api/v2/push/send`. |
| `record` | Calls `POST /cameras/:id/record/start` with `trigger: rule`. |
| `in_app` | Inserts notification row in `notifications` table + publishes `rule.triggered` synthetic event to Redis → WebSocket. |

### Event publishing on action

When a rule fires, a synthetic `rule.triggered` event is published to Redis with:
```json
{
  "type": "custom",
  "metadata": {
    "ruleTriggered": true,
    "ruleId": "...",
    "ruleName": "...",
    "sourceEventId": "...",
    "sourceEventType": "motion"
  }
}
```
This appears instantly in the browser event feed.

---

## 17. AI Detection

**Provider:** OpenAI Vision API (GPT-4o)
**Source:** `services/gateway/src/services/ai-detection.service.ts`

### Trigger

Fires fire-and-forget after any **motion** event is created (if `AI_PROVIDER=openai`):
1. Fetch JPEG frame from go2rtc `/api/frame.jpeg?src={cameraId}`
2. Post frame as base64 to OpenAI Vision
3. Parse response: extract detections `[{type, confidence, label, boundingBox}]`
4. Types: `person`, `vehicle`, `animal`, `unknown`
5. Update event `metadata.detections` in DB
6. For detections with `confidence > 0.7`: create typed sub-events:
   - `event.type = "person"` → separate event row
   - `event.type = "vehicle"` → separate event row
   - etc.

### Configuration

```env
AI_PROVIDER=openai        # or 'none' (default) to disable
OPENAI_API_KEY=sk-...
```

### Graceful degradation

If `AI_PROVIDER=none` or `OPENAI_API_KEY` absent: the AI service returns empty
detections silently. API responses never blocked.

### AI event badges

The web event feed shows colored badges (`AI: Person`, `AI: Vehicle`) when
`event.metadata.detections` is populated.

---

## 18. License Plate Recognition

**Provider:** PlateRecognizer API (platerecognizer.com)
**Free tier:** 2500 API calls/month
**Source:** `services/gateway/src/services/lpr.service.ts`

### Trigger

Fires fire-and-forget after any **motion** event, if LPR is configured:
1. Fetch JPEG frame from go2rtc
2. POST multipart form to `https://api.platerecognizer.com/v1/plate-reader/`
3. Optional `LPR_REGIONS` param for region-specific accuracy (e.g. `us,gb`)
4. 8 s timeout on API call
5. Parse results: plate (normalized uppercase), confidence, region code, vehicle type, bounding box
6. Store detections in `event.metadata.lprDetections`
7. Check each detected plate against `lpr_watchlist` for tenant
8. If match with `alert_on_detect=true`: create `lpr.alert` event with camera, plate, watchlist label

### Configuration

```env
LPR_PROVIDER=platerecognizer
LPR_API_KEY=<token from platerecognizer.com>
LPR_REGIONS=us,gb              # optional, improves accuracy
```

### Watchlist management

Via `Settings → License Plates` or API:
- `POST /api/v1/lpr/watchlist` — add plate (normalized to uppercase, e.g. "ABC1234")
- Toggle `alert_on_detect` per entry
- `GET /api/v1/lpr/detections` — recent detection events

---

## 19. Analytics (ClickHouse)

**Source:** `services/gateway/src/lib/clickhouse.ts`
**Schema:** `infra/clickhouse/schema.sql`

### Tables

**`events_analytics`** — Append-only event tracking
```sql
camera_id    UUID,  tenant_id   UUID,  event_type  LowCardinality(String),
severity     LowCardinality(String),  occurred_at DateTime,  hour DateTime
```

**`recordings_analytics`** — Recording metadata
```sql
camera_id UUID, tenant_id UUID, trigger LowCardinality(String),
duration_sec UInt32, size_bytes UInt64, recorded_at DateTime
```

**Materialized view:** Hourly aggregation pre-computed for fast dashboard queries.

### Client

`clickhouse.ts` — lightweight HTTP client using ClickHouse's native HTTP interface
(`POST /?query=`). Graceful degradation: if ClickHouse is down, all tracking calls
silently no-op. API responses never blocked by analytics.

### Tracking

Every call to `POST /events` fires `analytics.trackEvent(tenantId, cameraId, type, severity)`
as fire-and-forget (never awaited in the request handler).

### API queries

| Endpoint | ClickHouse query |
|----------|-----------------|
| `/timeseries` | `GROUP BY hour ORDER BY hour` with interval bucketing |
| `/heatmap` | `GROUP BY toDayOfWeek(occurred_at), toHour(occurred_at)` |
| `/breakdown` | `GROUP BY event_type` or `severity` |
| `/camera-activity` | `WHERE camera_id = ? GROUP BY hour` |
| `/recordings-summary` | `GROUP BY toDate(recorded_at)` |

---

## 20. Extension System

### Architecture

```
Extension SDK (packages/sdk/)
        ↓ developer writes extension
Extension Marketplace (extensions table)
        ↓ tenant admin installs
Tenant Extension (tenant_extensions table)
        ↓ event fires
Extension Hook → extension-runner.ts (Node.js vm)
        ↓ result
Event metadata update / custom action
```

### Extension manifest

Declared in extension's `manifest.json`:
```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "hooks": ["event.motion", "event.person"],
  "permissions": ["read:cameras", "write:events"],
  "config_schema": {
    "sensitivity": { "type": "number", "default": 5 }
  }
}
```

### Hooks

Extensions respond to named hooks. Built-in hooks:
- `event.motion`, `event.person`, `event.vehicle`, `event.animal`
- `recording.complete`, `recording.start`
- `camera.online`, `camera.offline`

### Execution sandbox

`extension-runner.ts`:
- Node.js `vm.runInContext()` with restricted context
- `codeGeneration: {strings: false, wasm: false}` — no `eval()` or `new Function()`
- Configurable timeout (default 5 s)
- Guard: `EXTENSION_ALLOW_INLINE_SOURCE=true` required to run extensions
- Phase 3: migrate to `isolated-vm` for true V8 isolation

### Demo extensions

8 pre-installed demo extensions in seed data:
1. **Motion Heatmap** — generates heatmap overlay from motion intensity
2. **People Counter** — counts persons in frame over time
3. **ANPR / ALPR** — alternative LPR (wraps LPR service)
4. **Slack Alerts** — webhook to Slack channel
5. **Microsoft Teams** — webhook to Teams channel
6. **PagerDuty** — creates incidents on high-severity events
7. **SMS Alerts** — Twilio SMS
8. **Custom Webhook** — generic webhook with template

---

## 21. Infrastructure

### Docker Compose (development)

File: `infra/docker/docker-compose.yml`

| Service | Image | Ports | Description |
|---------|-------|-------|-------------|
| `redis` | `redis:7-alpine` | 6379 | Cache + pub/sub |
| `go2rtc` | `alexxit/go2rtc` | 1984, 8554, 8555 | Camera proxy + WebRTC |
| `clickhouse` | `clickhouse/clickhouse-server:23` | 8123, 9000 | Analytics DB |
| `camera-ingest` | `osp-camera-ingest` (local build) | 50051, 8080 | Go service |
| `video-pipeline` | `osp-video-pipeline` (local build) | 50052, 8081 | Go service |
| `event-engine` | `osp-event-engine` (local build) | 50053, 8082 | Go service |
| `extension-runtime` | `osp-extension-runtime` (local build) | 50054, 8083 | Go service |

**ClickHouse special config** (required for Docker Desktop on Windows):
```yaml
cap_add: [SYS_NICE, IPC_LOCK]
security_opt: [seccomp:unconfined]
# Healthcheck must use 127.0.0.1 not localhost (Alpine IPv6 resolution issue)
```

**Named volumes:**
- `redis-data` — Redis persistence
- `go2rtc-config` — go2rtc stream config
- `recordings-data` — mounted at `/data/recordings` in gateway
- `clickhouse-data` / `clickhouse-logs`

### Kubernetes

File: `infra/k8s/`

```
k8s/
├── base/           Deployments, Services, ConfigMaps for all services
└── overlays/
    ├── staging/    Staging-specific resource limits + replicas
    └── production/ Production resource limits, HPA, PodDisruptionBudgets
```

Apply:
```bash
kubectl apply -k infra/k8s/overlays/production/
```

### Vercel (web app)

- `apps/web/vercel.json` — framework: nextjs, build command, env mapping
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GO2RTC_URL`, `NEXT_PUBLIC_WS_URL` set in Vercel dashboard
- Automatic HTTPS, CDN edge caching

### Fly.io (gateway + Go services)

Each service has a `fly.toml`:
- `osp-gateway` — 3000/3002
- `osp-camera-ingest` — 50051
- `osp-video-pipeline` — 50052
- `osp-event-engine` — 50053
- `osp-extension-runtime` — 50054
- `osp-edge-agent` — 8084 with `/data` persistent volume

Deploy:
```bash
fly secrets set SUPABASE_URL=... -a osp-gateway
bash scripts/deploy-fly.sh gateway
bash scripts/deploy-fly.sh all
```

### CI/CD (GitHub Actions)

`.github/workflows/`:
- Lint + type-check on every push
- Unit + integration tests on PR
- Build check (all packages)
- Deploy to Vercel preview on PR, production on `main`
- Docker image build for Go services on tag

### COTURN (TURN server)

Added to `docker-compose.yml` as optional service. Uses host networking so
TURN credentials can be set via env. Required for WebRTC across symmetric NATs.

```env
TURN_SERVER_URL=turn:your-server:3478
TURN_SERVER_USERNAME=user
TURN_SERVER_CREDENTIAL=pass
```

### Cloudflare R2

- Zero egress fees (video serving is free)
- Bucket: `osp-storage`
- Object path: `{tenantId}/{cameraId}/{timestamp}.mp4`
- Presigned URLs expire in 1 hour
- Configured via `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`

---

## 22. Environment Variables

Complete reference for `services/gateway/.env` (copy `.env.example`):

### Required

```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres.xxx:password@pooler.supabase.com:6543/postgres
```

### Infrastructure (defaults work for local dev)

```env
REDIS_URL=redis://localhost:6379
GO2RTC_URL=http://localhost:1984
GO2RTC_API_URL=http://localhost:1984
GATEWAY_PORT=3000
WS_PORT=3002
GATEWAY_CORS_ORIGINS=http://localhost:3001
WEB_URL=http://localhost:3001
GATEWAY_PUBLIC_URL=http://localhost:3000
```

### gRPC service endpoints

```env
CAMERA_INGEST_URL=localhost:50051
VIDEO_PIPELINE_URL=localhost:50052
EVENT_ENGINE_URL=localhost:50053
EXTENSION_RUNTIME_URL=localhost:50054
```

### Cloudflare R2 (video storage)

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=osp-storage
R2_ENDPOINT=https://{accountId}.r2.cloudflarestorage.com
```

### Local storage

```env
RECORDINGS_DIR=./recordings
```

### WebRTC TURN server

```env
TURN_SERVER_URL=turn:your-server:3478
TURN_SERVER_USERNAME=user
TURN_SERVER_CREDENTIAL=pass
```

### AI detection

```env
AI_PROVIDER=none          # none | openai
OPENAI_API_KEY=sk-...
```

### License plate recognition

```env
LPR_PROVIDER=platerecognizer
LPR_API_KEY=<token>
LPR_REGIONS=us,gb         # optional
```

### Email

```env
SENDGRID_API_KEY=SG.xxx
EMAIL_FROM=alerts@yourdomain.com
```

### Error monitoring

```env
SENTRY_DSN=https://xxx@sentry.io/yyy      # gateway
NEXT_PUBLIC_SENTRY_DSN=...                 # web app
SENTRY_AUTH_TOKEN=...                      # source maps upload
SENTRY_ORG=your-org
SENTRY_PROJECT=osp-gateway
```

### Security

```env
OSP_ENCRYPTION_KEY=<openssl rand -hex 32>  # config_secrets encryption
API_TOKEN=<shared service token>            # internal service-to-service auth
```

### Rate limiting

```env
RATE_LIMIT_FAIL_OPEN=true   # true = allow requests when Redis down; false = block
```

### Analytics

```env
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_DB=osp_analytics
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
```

### Edge agent (in edge-agent service)

```env
EDGE_AGENT_ID=site-01
EDGE_AGENT_NAME=Building A
CLOUD_GATEWAY_URL=https://your-gateway.fly.dev
CLOUD_API_TOKEN=<api-key>
TENANT_ID=<tenant-uuid>
GO2RTC_URL=http://localhost:1984
CAMERA_IDS=cam1,cam2       # comma-separated; empty = auto-discover
SYNC_INTERVAL_SECONDS=30
MOTION_SENSITIVITY=5
MOTION_COOLDOWN_SECONDS=10
DATA_DIR=./data
EDGE_HTTP_PORT=8084
```

### Frontend (apps/web/.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_GO2RTC_URL=http://localhost:1984
NEXT_PUBLIC_WS_URL=ws://localhost:3002
NEXT_PUBLIC_SENTRY_DSN=
```

---

## 23. Development Workflow

### Start everything locally

```bash
# 1. Install dependencies
pnpm install

# 2. Build shared package (required before gateway or web)
pnpm --filter @osp/shared build

# 3. Start infrastructure
docker compose -f infra/docker/docker-compose.yml up -d redis go2rtc

# 4. Optional: start ClickHouse for analytics
docker compose -f infra/docker/docker-compose.yml up -d clickhouse

# 5. Start API gateway (terminal 1)
cd services/gateway && pnpm dev    # API :3000, WS :3002

# 6. Start web app (terminal 2)
cd apps/web && pnpm dev            # Web :3001

# 7. Start mobile app (terminal 3, optional)
cd apps/mobile && pnpm start       # Expo dev server
```

### Service URLs (local dev)

| Service | URL |
|---------|-----|
| Web dashboard | http://localhost:3001 |
| API gateway | http://localhost:3000 |
| API docs (Scalar) | http://localhost:3000/docs |
| WebSocket | ws://localhost:3002 |
| go2rtc API | http://localhost:1984 |
| go2rtc RTSP | rtsp://localhost:8554 |
| ClickHouse HTTP | http://localhost:8123 |
| Redis | localhost:6379 |
| Edge agent | http://localhost:8084 |

### Build Go services

Each Go service builds into a Docker image:
```bash
docker build -t osp-camera-ingest services/camera-ingest/
docker build -t osp-video-pipeline services/video-pipeline/
docker build -t osp-event-engine services/event-engine/
docker build -t osp-extension-runtime services/extension-runtime/
docker build -t osp-edge-agent services/edge-agent/
```

Or use the generic Dockerfile:
```bash
docker build -f infra/docker/go-service.Dockerfile \
  --build-arg SERVICE_NAME=camera-ingest \
  -t osp-camera-ingest services/camera-ingest/
```

### Database migrations

All in `infra/supabase/migrations/`. Apply via Supabase CLI:
```bash
supabase db push
# or paste SQL directly into Supabase SQL Editor
```

Migration order (1–21):
1. Core enums
2. Tenants
3. Users + user_roles
4. Cameras + camera_zones
5. Recordings + snapshots
6. Events
7. Alert rules
8. Notifications
9. Extensions + tenant_extensions + extension_hooks
10. Audit logs
11. Locations
12. Camera tags + assignments
13. Camera status history
14. API keys
15. Push tokens (users.push_token column)
16. Webhook delivery attempts
17. Config secrets
18. ClickHouse integration helpers
19. LPR watchlist
20. SSO configs
21. Edge agents

### Testing

```bash
# Unit tests (all packages)
pnpm test

# Gateway integration tests (requires Redis + Supabase)
cd services/gateway && pnpm test:integration

# E2E tests (requires web app on :3001)
cd apps/web && pnpm test:e2e      # Playwright

# Type check
pnpm type-check

# Lint
pnpm lint
```

### Seed demo data

```bash
bash scripts/seed-dev.sh
# or paste infra/supabase/seed/dev.sql into Supabase SQL Editor
```

### Production deploy

```bash
# Web app → Vercel
bash scripts/deploy-vercel.sh production

# API gateway → Fly.io
bash scripts/deploy-fly.sh gateway

# All Go services → Fly.io
bash scripts/deploy-fly.sh all

# K8s
kubectl apply -k infra/k8s/overlays/production/
```

---

## 24. Security Model

### Multi-tenancy isolation

- **Database:** Every table with tenant data enforces `tenant_id` via PostgreSQL RLS
- **API:** `tenantContext()` middleware validates JWT tenant claim on every request
- **Storage:** R2 paths prefixed with `{tenantId}/` — no cross-tenant access
- **WebSocket:** Connections scoped to one tenant; events never cross tenant boundaries

### Auth levels (defense in depth)

```
Internet → CORS (allowed origins only)
        → Rate limiter (Redis, per tenant)
        → requireAuth() (JWT or API key validation)
        → Role check (owner/admin/operator/viewer)
        → RLS (PostgreSQL row filter)
        → Application logic
```

### Secrets handling

- Passwords: Supabase Auth (bcrypt, never touches our code)
- API keys: SHA-256 hash stored; full key shown once, never logged
- Config secrets: encrypted at rest with `OSP_ENCRYPTION_KEY` (AES-256)
- Service tokens: `API_TOKEN` env var for internal service-to-service calls

### Input validation

All API inputs validated with Zod schemas. Validation errors return structured
`VALIDATION_ERROR` with field-level details. No raw SQL — all DB access via
Supabase JS client (parameterized queries).

### Audit trail

Every write operation (camera create/delete, user invite/remove, rule change,
recording start/stop) writes to `audit_logs` with actor, IP, user-agent.

### Signed URLs

All R2 video URLs are presigned with 1 h expiry. go2rtc stream tokens
validated on every WHEP request.

### Extension sandboxing

Extensions run in Node.js `vm` context with `codeGeneration` disabled.
`EXTENSION_ALLOW_INLINE_SOURCE=true` must be explicitly set (default false in prod).

### Rate limits

Redis sliding-window per `{tenantId}:{route}`. UUID path segments normalized
so `/cameras/abc.../record/start` and `/cameras/def.../record/start` share a
bucket. Fail-open by default (configurable).

### Sentry

Gateway and web app both send errors to Sentry DSN. Source maps uploaded at
build time. Sensitive fields stripped before sending. Web app samples 1% of
sessions, 100% of errors.

---

*Document generated 2026-03-20 · OSP v0.1.0 · 250+ source files · 61 commits*
