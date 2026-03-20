# OSP — Technical Reference

Complete technical documentation for the Open Surveillance Platform.

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Personas](#2-personas)
3. [Feature Matrix](#3-feature-matrix)
4. [Product Roadmap](#4-product-roadmap)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Competitive Analysis](#6-competitive-analysis)
7. [System Architecture](#7-system-architecture)
8. [Data Models](#8-data-models)
9. [API Design](#9-api-design)
10. [Video Pipeline](#10-video-pipeline)
11. [Event System & Alert Rules](#11-event-system--alert-rules)
12. [Motion Detection](#12-motion-detection)
13. [Extension SDK](#13-extension-sdk)
14. [Multi-Tenancy](#14-multi-tenancy)
15. [Authentication & Authorization](#15-authentication--authorization)
16. [Coding Standards](#16-coding-standards)
17. [Testing Strategy](#17-testing-strategy)
18. [Observability](#18-observability)
19. [Implementation Status](#19-implementation-status)
20. [Phase 2 Changelog](#20-phase-2-changelog)
21. [Plan Tiers](#21-plan-tiers)

---

## 1. Product Vision

OSP is a **complete, standalone surveillance platform** — not just a framework or extension system. Out of the box it provides professional-grade camera management, live monitoring, recording, motion detection, and alerting for any scale from a single home camera to thousands across enterprise sites.

What makes OSP unique: beyond being a fully-featured product it's also an **open platform**. Customers can customize it through extensions, custom rules, and white-label theming. Developers can build and sell plugins in the marketplace. This dual nature — **product + platform** — means OSP competes with closed products like Ring and Verkada while offering the flexibility of open systems like Frigate.

**OSP is for**:
- **End users** who want a powerful, vendor-agnostic surveillance system that works immediately
- **Businesses** who need multi-tenant, role-based camera management across locations
- **Developers** who want to build custom integrations, AI models, or white-label solutions on a proven platform

---

## 2. Personas

### 2.1 Homeowner — "Sarah"

1–8 cameras, home/property use. Wants peace of mind without complexity.

**Must-have**: Mobile-first live view (<2s), push notifications with snapshot, RTSP/ONVIF setup, 7-day recording, family sharing (Viewer role), configurable motion zones.

**Nice-to-have**: Person vs animal vs vehicle detection, two-way audio, time-based alert schedules (night mode), smart home integration.

---

### 2.2 Small Business Owner — "Marcus"

5–30 cameras, coffee shop + warehouse. Needs remote monitoring with access control.

**Must-have**: Unified view for all camera brands, role-based access (Shift Manager sees floor only), zone alerts with schedule, 30-day retention with search, clip export, RTSP/ONVIF support.

**Nice-to-have**: People counting, custom alert rules, basic analytics, multi-location support.

---

### 2.3 Retail Chain Manager — "Diana"

12 stores × 15–50 cameras. Loss prevention + compliance.

**Must-have**: Multi-location management, centralized user management, cross-store event search, scheduled recording policies, heat map analytics, incident workflow, exportable reports.

**Nice-to-have**: AI person detection with analytics, LPR in parking lots, POS integration, white-label dashboard.

---

### 2.4 Mall / Enterprise — "James"

500–1,000+ cameras, 24/7 command center.

**Must-have**: Real-time situational awareness, command center multi-monitor layout, sub-tenant architecture (tenants manage own cameras, mall security has override), compliance features (audit log, privacy zone masking), 90-day retention, federated search, SLA-backed uptime, RBAC with sub-tenant roles.

**Nice-to-have**: AI crowd density, abandoned object detection, LPR, integration SDK for access control / fire panel / PA, custom AI model hosting, map-based navigation, automated compliance reporting, SSO/SAML.

---

## 3. Feature Matrix

| Feature | Home | Business | Retail | Enterprise |
|---------|------|----------|--------|------------|
| Live View | Core | Core | Core | Core |
| Playback / Timeline | Core | Core | Core | Core |
| Motion-Triggered Recording | Core | Core | Core | Core |
| Continuous Recording | Extension | Core | Core | Core |
| Motion Detection | Core | Core | Core | Core |
| Person Detection | Extension | Extension | Core | Core |
| Vehicle Detection | Extension | Extension | Extension | Core |
| Custom Alert Rules | Core (basic) | Core | Core | Core (advanced) |
| Alert Schedules | Core | Core | Core | Core |
| Multi-Location Management | N/A | Extension | Core | Core |
| User Roles & Permissions | Core (2 roles) | Core (3 roles) | Core (full RBAC) | Core (full RBAC + sub-tenant) |
| Two-Way Audio | Core | Core | Extension | Extension |
| PTZ Control | Core | Core | Core | Core |
| Analytics Dashboard | N/A | Extension | Core | Core |
| Heat Maps | N/A | N/A | Extension | Core |
| License Plate Recognition | N/A | Extension | Extension | Extension |
| White-Label / Custom Branding | N/A | N/A | Extension | Core |
| API Access | N/A | Extension | Core | Core |
| Custom AI Model Support | N/A | N/A | Extension | Extension |
| Compliance / Audit Logs | N/A | Extension | Core | Core |
| Privacy Zone Masking | Extension | Extension | Core | Core |
| Camera Health Monitoring | Core (basic) | Core | Core | Core (SLA-backed) |
| Mobile App | Core | Core | Core | Core |
| Desktop App | Extension | Extension | Core | Core |
| Extension Marketplace | Extension | Extension | Core | Core |
| Webhook / Integration | N/A | Extension | Core | Core |
| SSO / SAML | N/A | N/A | Extension | Core |
| Command Center (Multi-Monitor) | N/A | N/A | Extension | Core |
| Sub-Tenant Architecture | N/A | N/A | N/A | Core |

**Legend**: **Core** = built in · **Extension** = plugin/add-on · **N/A** = not available

---

## 4. Product Roadmap

### Phase 1: Core Platform (Months 1–4) ✅ Done
**Theme**: "See your cameras anywhere"

- Foundation + Auth + Camera CRUD
- go2rtc integration, WebRTC live view, ONVIF discovery, PTZ
- Motion detection, recording pipeline, HLS playback, push notifications, motion zones
- Mobile app, alert schedules, user roles, clip export

---

### Phase 2: Intelligence & Extensibility (Months 5–8) ✅ Done
**Theme**: "Make cameras smart"

- AI detection (OpenAI Vision API, person/vehicle/animal events)
- Extension SDK v1 (TypeScript), sandboxed runtime, example extensions
- Visual rule builder (trigger → condition → action)
- Extension marketplace (browse, install, rate)
- Tauri desktop app
- ClickHouse analytics
- Two-way audio (go2rtc backchannel)
- Continuous recording (30-min auto-segmentation)

---

### Phase 3: Enterprise & Analytics (Months 9–12)
**Theme**: "Scale to the enterprise"

- Multi-location management with cross-location search
- ClickHouse heatmaps, people counting, dwell time, traffic patterns
- Compliance: audit logs, privacy zone masking, configurable retention, SSO/SAML
- White-label theming, sub-tenant architecture, command center view

---

### Phase 4: Edge & Advanced AI (Months 13–18)
**Theme**: "Intelligence at the edge"

- Lightweight Go edge agent (on-premise deployment, cloud sync)
- Bring-your-own-model (ONNX), model marketplace, LPR
- Access control integration, fire/alarm panel, PA system, POS, map-based navigation

---

## 5. Non-Functional Requirements

### Performance

| Metric | Target |
|--------|--------|
| Live view latency (LAN) | <500ms |
| Live view latency (remote) | <2s |
| Video playback start (clip) | <1s |
| Push notification delivery | <3s from detection |
| API response (p95) | <200ms |
| API response cached (p95) | <50ms |
| Camera grid render (16 cams) | <2s |
| ONVIF discovery | <10s |
| Motion detection latency | <500ms |

### Reliability

| Metric | Target |
|--------|--------|
| Cloud service uptime | 99.9% (8.7h/year) |
| Video pipeline uptime | 99.5% |
| Camera reconnection | Auto within 30s (exponential backoff: 1→2→4→8→16→30s) |
| Data durability (recordings) | 99.999999999% (S3/R2) |

### Scalability

| Metric | MVP | Scale (Phase 3+) |
|--------|-----|-----------------|
| Cameras per tenant | 50 | 10,000+ |
| Concurrent streams/user | 4 | 16 |
| Concurrent streams/tenant | 50 | 1,000 |
| Events per second | 100 | 10,000 |

### Security

| Requirement | Implementation |
|-------------|---------------|
| Data in transit | TLS 1.3 everywhere (HTTPS, WSS, gRPC) |
| Data at rest | AES-256 on S3/R2, PostgreSQL encryption |
| Authentication | Supabase Auth (bcrypt, OAuth, JWT 15min expiry) |
| Authorization | RBAC at gateway + RLS at database |
| Multi-tenant isolation | RLS on every table + S3 prefix isolation |
| Rate limiting | Per-tenant, per-endpoint via Redis |
| Input validation | Zod schemas on every API endpoint |
| Secrets | Environment variables only, never in code |
| CORS | Strict origin allowlist per tenant |
| OWASP compliance | Top 10 audit before each phase launch |

---

## 6. Competitive Analysis

| Competitor | Strengths | Weaknesses | OSP Advantage |
|------------|-----------|------------|---------------|
| **Ring** | Brand recognition, Alexa integration, affordable | Proprietary ecosystem, mandatory subscription, no self-host, consumer-only | Any camera brand, self-host, no per-camera subscription, scales beyond consumer |
| **Arlo** | Best-in-class AI detection, wire-free cameras | $150–400/camera, $13–18/mo subscription, no RTSP on newer models | Bring your own cameras, AI as extensible plugin, no hardware lock-in |
| **Milestone XProtect** | Extremely mature, 10,000+ cameras, 150+ integrations | $30–100+/camera license, Windows Server only, requires IT team, dated UI | Cloud-native, modern UI, Linux/Docker, no per-camera licensing, 10x lower TCO |
| **Verkada** | Modern cloud-first, excellent UI, built-in AI | Requires Verkada hardware ($300–1,500+), $200+/camera/year, 2021 breach | BYOC (any RTSP/ONVIF camera), open source, self-host, transparent pricing |
| **Frigate** | Free + open source, excellent AI (Coral TPU), local privacy | Technical setup, no mobile app, single-node, no multi-tenancy, basic UI | Native mobile apps, multi-tenant, cloud+self-host hybrid, visual config, user management |

**OSP's unique position**: The only **complete product** spanning consumer to enterprise — functional out of the box like Ring/Verkada, yet open and extensible like Frigate. Bridges all segments with a single platform, shared extension ecosystem, and consistent UX across web, mobile, and desktop.

---

## 7. System Architecture

### High-Level Diagram

```
┌────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Next.js  │  │  React   │  │ Tauri v2 │             │
│  │ Web App  │  │  Native  │  │ Desktop  │             │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
└───────┼─────────────┼─────────────┼────────────────────┘
        ▼             ▼             ▼
┌────────────────────────────────────────────────────────┐
│              API GATEWAY (Hono / Bun)                  │
│   REST API · WebSocket · Auth Middleware · Rate Limiter│
└──────┬────────────┬──────────────┬──────────┬──────────┘
       ▼            ▼              ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│ Camera   │ │ Video    │ │ Event /  │ │ Extension    │
│ Ingest   │ │ Pipeline │ │ Rule     │ │ Runtime      │
│ (Go)     │ │ (Go)     │ │ Engine   │ │ (Go sandbox) │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └──────────────┘
     │            │             │
     ▼            ▼             ▼
┌────────────────────────────────────────────────────────┐
│                     DATA LAYER                         │
│  Supabase (PostgreSQL + Auth + Realtime + RLS)         │
│  Redis (Cache · Rate Limiting · Pub/Sub)               │
│  Cloudflare R2 (Video clips · Snapshots · Recordings)  │
│  ClickHouse (Analytics — Phase 2)                      │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│                 VIDEO INFRASTRUCTURE                   │
│  go2rtc (RTSP/ONVIF proxy) → FFmpeg → HLS/WebRTC      │
└────────────────────────────────────────────────────────┘
```

### Service Responsibilities

| Service | Language | Responsibility |
|---------|----------|---------------|
| **API Gateway** | TypeScript (Hono/Bun) | REST/WS, auth, routing, rate limiting, BFF for all clients |
| **Camera Ingest** | Go | RTSP/ONVIF connection management, stream multiplexing, health monitoring, PTZ |
| **Video Pipeline** | Go | FFmpeg orchestration, transcoding, thumbnail generation, HLS packaging, R2 upload |
| **Event Engine** | Go | Motion events, rule evaluation, notification dispatch, Redis pub/sub |
| **Extension Runtime** | Go | Sandboxed plugin execution (Node.js `vm`), hook dispatch, resource limits |

### Inter-Service Communication

- **Synchronous**: gRPC between API Gateway ↔ Go services (typed contracts, low latency)
- **Asynchronous**: Redis pub/sub for event fan-out (motion detected → rule engine → notifications)
- **Real-time to clients**: WebSocket from API Gateway, Supabase Realtime for DB changes

### Tech Stack Rationale

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Web | Next.js 15 | SSR performance, App Router, React Server Components |
| Mobile | React Native + Expo | Single codebase iOS/Android, OTA updates |
| Desktop | Tauri v2 | 10x lighter than Electron, Rust backend |
| Core backend | Go | High concurrency, low memory per stream connection |
| API layer | Hono/Bun | Fast DX, TypeScript shared types with frontend |
| Database | Supabase (PostgreSQL) | RLS for multi-tenancy, built-in auth, realtime |
| Video | go2rtc + FFmpeg | Universal protocol support (RTSP, ONVIF, WebRTC) |
| Storage | Cloudflare R2 | S3-compatible, zero egress fees for video serving |
| Cache | Redis | Rate limiting, pub/sub, KV cache |
| Analytics | ClickHouse | Time-series event aggregation, heatmaps |

### Scalability Tiers

| Scale | Architecture |
|-------|-------------|
| 1–50 cameras | Single server, Docker Compose |
| 50–500 cameras | Multi-server, load balanced, separate video pipeline from API |
| 500–5,000 cameras | Kubernetes, auto-scaling pods, regional go2rtc instances |
| 5,000–10,000+ | Multi-region, edge nodes per site, cloud for storage/API |

---

## 8. Data Models

### Entity Relationship

```
tenants ──< cameras ──< recordings
        ──< users   ──< user_roles
        ──< events
        ──< rules
        ──< extensions
        ──< locations
        ──< webhook_delivery_attempts
```

### Key Tables

**tenants**
```
id (uuid PK) · name · slug · plan (enum) · settings (jsonb) · theme (jsonb) · logo_url · domain
```

**cameras**
```
id · tenant_id (FK) · name · type (enum) · stream_url · protocol (enum)
status (enum) · config (jsonb) · location_id (FK) · zones (jsonb[])
ptz_capable · audio_capable · recording_mode · created_at · updated_at
```

**recordings**
```
id · camera_id · tenant_id · start_time · end_time · duration_sec
storage_path · size_bytes · format · trigger (enum) · metadata (jsonb) · created_at
```

**events**
```
id · camera_id · tenant_id · type (enum) · severity (enum)
metadata (jsonb) · thumbnail_url · clip_path · detectedAt · acknowledged_at
```

**rules**
```
id · tenant_id · name · enabled · trigger_event · conditions (jsonb)
actions (jsonb) · schedule (jsonb) · camera_ids[] · cooldown_seconds
last_triggered_at · created_at · updated_at
```

**webhook_delivery_attempts**
```
id · rule_id · event_id · tenant_id · url · status · http_status_code
attempt_number · response_body · error_message · created_at
```

### Enums

```
camera_type:       rtsp | onvif | webrtc | usb | ip
camera_status:     online | offline | connecting | error
event_type:        motion | person | vehicle | animal | camera_offline | camera_online | custom
event_severity:    low | medium | high | critical
user_role:         owner | admin | operator | viewer
recording_trigger: continuous | motion | manual | rule
tenant_plan:       free | pro | business | enterprise
```

---

## 9. API Design

### REST Endpoints

```
# Auth
POST   /api/v1/auth/login
POST   /api/v1/auth/register
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

# Cameras
GET    /api/v1/cameras
POST   /api/v1/cameras
GET    /api/v1/cameras/:id
PATCH  /api/v1/cameras/:id
DELETE /api/v1/cameras/:id
POST   /api/v1/cameras/:id/ptz
GET    /api/v1/cameras/:id/snapshot
POST   /api/v1/cameras/:id/record/start
POST   /api/v1/cameras/:id/record/stop
GET    /api/v1/cameras/:id/record/status
GET    /api/v1/cameras/:id/zones
PATCH  /api/v1/cameras/:id/zones/:zoneId
PATCH  /api/v1/cameras/:id/capabilities
POST   /api/v1/cameras/discover

# Recordings
GET    /api/v1/recordings
GET    /api/v1/recordings/:id
DELETE /api/v1/recordings/:id
GET    /api/v1/recordings/:id/play        # serve file with Range support
GET    /api/v1/recordings/:id/download

# Events
GET    /api/v1/events
GET    /api/v1/events/:id
PATCH  /api/v1/events/:id/acknowledge
GET    /api/v1/events/:id/clip
GET    /api/v1/events/:id/thumbnail

# Rules
GET    /api/v1/rules
POST   /api/v1/rules
GET    /api/v1/rules/:id
PATCH  /api/v1/rules/:id
DELETE /api/v1/rules/:id
POST   /api/v1/rules/:id/test
GET    /api/v1/rules/webhook-attempts

# Users & Roles
GET    /api/v1/users
POST   /api/v1/users/invite
PATCH  /api/v1/users/:id/role
PATCH  /api/v1/users/push-token
DELETE /api/v1/users/:id

# Extensions
GET    /api/v1/extensions
POST   /api/v1/extensions
GET    /api/v1/extensions/:id
PATCH  /api/v1/extensions/:id/config
DELETE /api/v1/extensions/:id
GET    /api/v1/extensions/marketplace

# Streams
POST   /api/v1/streams/test              # test connection — returns snapshot + codec

# Analytics (Phase 2)
GET    /api/v1/analytics/timeseries
GET    /api/v1/analytics/heatmap
GET    /api/v1/analytics/breakdown
GET    /api/v1/analytics/camera-activity
GET    /api/v1/analytics/recordings-summary

# Locations
GET/POST/PATCH/DELETE /api/v1/locations/*
GET/POST/DELETE       /api/v1/tags/*

# Health
GET    /health
GET    /health/detailed
GET    /health/metrics                   # Prometheus metrics
GET    /docs                             # Swagger UI
```

### Response Envelope

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": { "total": 100, "page": 1, "limit": 20 }
}
```

### Error Format

```json
{
  "error": {
    "code": "CAMERA_CONNECTION_FAILED",
    "message": "Unable to connect to camera",
    "details": "RTSP handshake timeout after 10s",
    "requestId": "req_abc123"
  }
}
```

Error code prefixes: `AUTH_*` · `CAMERA_*` · `VIDEO_*` · `RULE_*` · `EXT_*` · `TENANT_*`

### WebSocket Events

```
Client → Server:
  { type: "subscribe", channels: ["events:tenant-123", "camera:cam-456"] }
  { type: "unsubscribe", channels: [...] }
  { type: "ping" }

Server → Client:
  { type: "event.new", data: { id, type, camera_id, severity, ... } }
  { type: "camera.status", data: { id, status, timestamp } }
  { type: "recording.complete", data: { id, camera_id, duration, ... } }
  { type: "rule.triggered", data: { ruleId, ruleName, eventId, ... } }
  { type: "pong" }
```

### Headers

- `X-Tenant-Id` — required on all authenticated requests (validated against JWT)
- `X-Request-Id` — optional, echoed in error responses

---

## 10. Video Pipeline

### Flow

```
Camera (RTSP/ONVIF/WebRTC)
    │
    ▼
go2rtc (Protocol normalization)
    │
    ├──▶ WebRTC (WHEP) → Client          live view, <500ms
    │
    ├──▶ FFmpeg → HLS segments → R2      recording
    │
    ├──▶ FFmpeg → JPEG snapshot → R2     thumbnails, every 10s
    │
    └──▶ Motion frame diff → Event Engine
```

### Storage Layout (R2 / local)

```
{tenant_id}/
  videos/
    {camera_id}/
      {year}/{month}/{day}/
        segment-001.ts
        playlist.m3u8
  snapshots/
    {camera_id}/
      latest.jpg
      {year}/{month}/{day}/
        {unix_ts}.jpg
  clips/
    {event_id}.mp4
    {event_id}.jpg    ← thumbnail (first frame, FFmpeg -frames:v 1)
```

### Recording Modes

| Mode | Behaviour |
|------|-----------|
| `continuous` | Starts automatically on camera connect; auto-segments every 30 minutes |
| `motion` | Starts on motion event; stops after configurable duration |
| `manual` | Started by user via `POST /cameras/:id/record/start` |
| `rule` | Started by rule engine action |

### go2rtc Integration

- Cameras registered on add/startup via `PUT /api/streams`
- `syncStreamsOnStartup()` re-registers all non-disabled cameras on health-checker start
- Two-way audio: ONVIF URIs include `?backchannel=1` when `twoWayAudio` capability enabled
- Test connection: register temp stream → wait for producers → grab JPEG snapshot → remove stream
- Stream gap on startup: fixed by startup sync before first health check cycle

### TURN Server (Production WebRTC)

For WebRTC across NAT (remote access), configure coturn or Cloudflare Calls:
```env
TURN_SERVER_URL=turn:your-server:3478
TURN_SERVER_USERNAME=user
TURN_SERVER_CREDENTIAL=pass
```
The gateway includes TURN credentials in the `iceServers` response when env vars are set.

---

## 11. Event System & Alert Rules

### Event Flow

```
Motion Frame Diff / go2rtc frame analysis
    │
    ▼
Event created (POST /api/v1/events)
    │
    ├──▶ Saved to PostgreSQL
    │
    ├──▶ Published to Redis pub/sub  →  WebSocket broadcast to clients
    │
    ├──▶ AI analysis (fire-and-forget):
    │       fetch frame from go2rtc → OpenAI Vision API
    │       attach detections to event metadata
    │       create typed sub-events (person/vehicle/animal) if confidence > 0.7
    │
    └──▶ Async rule evaluation:
            fetch all enabled rules for tenant
            evaluate each rule against the event
            execute matched actions
            update rule.last_triggered_at
            publish rule.triggered to WebSocket
```

### Rule Evaluation Engine

**Trigger matching**: Filters events by type (motion, person, vehicle, etc.)
**Camera scoping**: Restricts rules to specific cameras or all cameras
**Cooldown enforcement**: Minimum time between triggers (default configurable)
**Condition evaluation**: Recursive AND/OR tree

**Supported operators**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `not_contains`, `in`

**Supported fields**:
- Direct: `intensity`, `severity`, `type`, `cameraId`, `cameraName`, `zoneId`, `zoneName`
- Aliases: `confidence`, `object_count`, `zone_name`, `time_of_day`
- Nested: `metadata.X`, `data.X` (dotted paths)

### Actions

| Action | Implementation |
|--------|---------------|
| **push_notification** | Creates record in `notifications` table; delivers to device via Expo Push API |
| **email** | Sends via Resend API with HTML template and snapshot preview (requires `RESEND_API_KEY`) |
| **webhook** | POSTs JSON payload with exponential-backoff retry (1–5 attempts); logs every attempt to `webhook_delivery_attempts` |
| **start_recording** | Creates recording entry; starts go2rtc MP4 capture; auto-stops after configured duration (default 60s) |
| **extension_hook** | Dispatches to extension runtime |

**Template interpolation** — action subject/body support `{{cameraName}}`, `{{severity}}`, `{{eventType}}`, `{{intensity}}`, `{{detectedAt}}`, etc.

### Webhook Payload

```json
{
  "ruleId": "uuid",
  "ruleName": "After-Hours Motion",
  "event": {
    "id": "event-uuid",
    "type": "motion",
    "severity": "high",
    "cameraId": "cam-uuid",
    "cameraName": "Front Door",
    "intensity": 85,
    "detectedAt": "2026-03-18T10:30:00Z",
    "metadata": { "snapshotUrl": "/path/to/snapshot.jpg" }
  },
  "tenantId": "tenant-uuid",
  "triggeredAt": "2026-03-18T10:30:01Z"
}
```

---

## 12. Motion Detection

The gateway's `CameraHealthChecker` samples frames from go2rtc at 1fps and runs a pixel-diff algorithm (`motion-diff.ts`).

### Severity Mapping

| Intensity | Severity |
|-----------|----------|
| 0–49 | `low` |
| 50–79 | `medium` |
| 80–100 | `high` |

### Configuration (env vars)

```env
MOTION_SENSITIVITY=7           # 1–10, higher = more sensitive
MOTION_MIN_AREA=500            # minimum pixel area to trigger
MOTION_FRAME_SKIP=3            # process every Nth frame
MOTION_COOLDOWN_SECONDS=10     # minimum seconds between events per camera
```

### Event Payload

```json
{
  "cameraId": "uuid",
  "type": "motion",
  "severity": "medium",
  "detectedAt": "2026-03-19T10:30:00Z",
  "intensity": 75,
  "metadata": {
    "snapshotUrl": "/snapshots/camera-uuid_20260319_103000.jpg",
    "boundingBox": { "x": 120, "y": 80, "width": 200, "height": 150 },
    "autoDetected": true
  }
}
```

### Clip Retention

`CameraHealthChecker` runs a cleanup job every hour that:
1. Queries events with `clip_path != null` and `created_at < now() - 7 days`
2. Deletes local clip files with `rmSync`
3. Clears `clip_path` in the database

---

## 13. Extension SDK

### Architecture

```
Extension SDK (TypeScript)
├── Hooks:
│   ├── onMotionDetected(event, context)
│   ├── onPersonDetected(event, context)
│   ├── onCameraOffline(event, context)
│   ├── onRecordingComplete(event, context)
│   └── onAlertTriggered(event, context)
└── APIs:
    ├── cameras.list() / cameras.get(id)
    ├── events.query(filters)
    ├── notifications.send(channel, message)
    ├── storage.get(key) / storage.set(key, val)
    └── ui.registerWidget(component)

Extension Runtime (Go + Node.js vm sandbox)
├── Sandboxed execution (Node.js vm module)
├── Resource limits (CPU, memory, time)
├── Tenant-scoped data access
└── Audit logging for all extension actions
```

### Extension Manifest

```typescript
interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  hooks: HookRegistration[];
  widgets?: WidgetRegistration[];
  permissions: Permission[];  // "cameras:read" | "notifications:send" | ...
}
```

### Example Extension

```typescript
export default {
  manifest: {
    id: "after-hours-alert",
    name: "After Hours Alert",
    version: "1.0.0",
    hooks: [{ event: "onMotionDetected", handler: "onMotion" }],
    permissions: ["cameras:read", "notifications:send"],
  },
  async onMotion(event: MotionEvent, ctx: ExtensionContext) {
    const hour = new Date(event.timestamp).getHours();
    if (hour >= 22 || hour < 6) {
      await ctx.notifications.send("slack", {
        channel: "#security",
        text: `After-hours motion on ${event.cameraName}`,
        imageUrl: event.snapshotUrl,
      });
    }
  },
};
```

### Security

- Inline source execution requires `EXTENSION_ALLOW_INLINE_SOURCE=true` (blocked in production by default)
- `codeGeneration: { strings: false, wasm: false }` prevents dynamic code execution
- Phase 3: migrate to `isolated-vm` for stronger V8 isolation

---

## 14. Multi-Tenancy

- **Shared infrastructure**: All tenants share the same database cluster, API servers, video pipeline
- **Isolated data**: RLS on every table, `tenant_id` column on all rows
- **Isolated storage**: R2 prefix per tenant — `{tenant_id}/videos/`, `{tenant_id}/snapshots/`
- **Isolated extensions**: Each tenant's extensions run in their own sandbox
- **Plan-based limits**: Feature flags and quotas per plan (cameras, users, retention, API rate)

### RLS Policy Pattern

```sql
CREATE POLICY "tenant_isolation" ON cameras
  FOR ALL
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');
```

All tables with tenant data have this policy. The service role key bypasses RLS for server-side operations.

---

## 15. Authentication & Authorization

### Auth Flow

1. User logs in → Supabase Auth validates credentials → issues JWT (15min) + refresh token (7d)
2. JWT stored: `localStorage` (web), `SecureStore` (mobile)
3. API Gateway validates JWT on every request, extracts `tenant_id` and `role`
4. On 401: client calls `POST /api/v1/auth/refresh` → gets new JWT
5. WebSocket close code `4001` = auth failure → refresh before reconnecting (max 3 attempts)

### RBAC Matrix

| Role | Cameras | Live View | Playback | Rules | Users | Extensions | Billing |
|------|---------|-----------|----------|-------|-------|------------|---------|
| **Owner** | CRUD | Yes | Yes | CRUD | CRUD | CRUD | Yes |
| **Admin** | CRUD | Yes | Yes | CRUD | CRU | CRUD | No |
| **Operator** | Read | Yes | Yes | Read | No | No | No |
| **Viewer** | Scoped | Scoped | Scoped | No | No | No | No |

Viewer role can be scoped to specific cameras via `camera_ids[]` in `user_roles`.

---

## 16. Coding Standards

### Naming Conventions

| Domain | Convention | Example |
|--------|-----------|---------|
| API routes | kebab-case, plural nouns | `/api/v1/alert-rules/:id` |
| Database tables | snake_case, plural | `cameras`, `user_roles`, `alert_rules` |
| Database columns | snake_case | `tenant_id`, `created_at`, `stream_url` |
| Database indexes | `idx_{table}_{columns}` | `idx_cameras_tenant_id` |
| Database foreign keys | `fk_{table}_{ref_table}` | `fk_cameras_tenants` |
| TypeScript types/interfaces | PascalCase, no `I` prefix | `Camera`, `EventType`, `UserRole` |
| TypeScript variables/functions | camelCase | `getCamera`, `handleMotionEvent` |
| TypeScript files | kebab-case | `camera-service.ts`, `use-live-feed.ts` |
| TypeScript components | PascalCase | `CameraGrid.tsx` |
| TypeScript constants | SCREAMING_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Go types | PascalCase | `CameraService`, `EventHandler` |
| Go exported | PascalCase | `HandleStream` |
| Go unexported | camelCase | `parseConfig` |
| Go files | snake_case | `camera_service.go` |
| Go packages | lowercase, single word | `ingest`, `transcode`, `events` |

### Query Parameters

Use camelCase: `?startDate=&cameraId=&pageSize=`

### Error Handling

**Go**: Always wrap errors with context:
```go
fmt.Errorf("connecting to camera %s: %w", id, err)
```
Never panic in library code. Use typed errors for known conditions.

**TypeScript**: API client throws typed `ApiError` with `code`, `message`, `status`. Components show user-friendly messages, log technical details.

### Commit Format

```
feat: add ONVIF camera auto-discovery
fix: prevent WebSocket reconnect loop on expired JWT
refactor: extract motion detection into separate service
```

Branch naming: `feat/camera-discovery`, `fix/stream-reconnect`, `refactor/event-pipeline`

---

## 17. Testing Strategy

| Type | Coverage Target | Tools |
|------|----------------|-------|
| Unit | 80%+ | Vitest (TS), go test (Go) |
| Integration | Key API paths | Vitest + Supertest, real Supabase |
| E2E | Critical flows | Playwright (web), Detox (mobile) |
| Load | Benchmarks | k6 — 100/1000/10000 concurrent streams |

### Security Checklist (before every PR)

- [ ] No hardcoded secrets
- [ ] RLS policies on new tables
- [ ] Input validation on new endpoints
- [ ] Signed URLs for video streams
- [ ] Rate limiting on public endpoints
- [ ] Audit logging for sensitive operations

---

## 18. Observability

### Log Format (Structured JSON)

```json
{
  "level": "info",
  "timestamp": "2026-03-16T12:00:00Z",
  "service": "camera-ingestion",
  "tenant_id": "tenant-123",
  "camera_id": "cam-456",
  "message": "Stream connected",
  "duration_ms": 142
}
```

### Log Levels

| Level | Usage |
|-------|-------|
| `error` | Failures requiring attention |
| `warn` | Degraded but functional |
| `info` | Significant business events |
| `debug` | Development troubleshooting (off in prod) |

### Key Metrics (Prometheus)

- `camera_streams_active` — gauge, per tenant
- `stream_latency_ms` — histogram
- `events_processed_total` — counter, per type
- `api_request_duration_ms` — histogram, per endpoint
- `recording_storage_bytes` — gauge, per tenant

Metrics exposed at `GET /health/metrics` in Prometheus format.

---

## 19. Implementation Status

**Last audited**: 2026-03-20

### Web Dashboard

| Page / Feature | Status |
|----------------|--------|
| Login / Register | ✅ Complete |
| Forgot password + reset | ✅ Complete |
| Camera list — search, filter, location | ✅ Complete |
| Camera grid — 1×1, 2×2, 3×3, 4×4 layouts | ✅ Complete |
| Add Camera — manual + network scan + USB | ✅ Complete |
| Camera detail — live WebRTC view | ✅ Complete |
| PTZ controls | ✅ Complete |
| Zone drawing (canvas polygon editor) | ✅ Complete |
| Timeline scrubber with playback seeking | ✅ Complete |
| Recording start/stop + REC badge + timer | ✅ Complete |
| Two-way audio — mic toggle + volume | ✅ Complete |
| Events — filters, acknowledge, bulk, real-time | ✅ Complete |
| Rules — visual pipeline editor (trigger→condition→action) | ✅ Complete |
| Webhook delivery log | ✅ Complete |
| Settings — all tabs | ✅ Complete |
| Settings → Desktop App tab (Tauri only) | ✅ Complete |
| Extensions marketplace (8 demo) | ✅ Complete |
| Camera discovery — network scan + USB | ✅ Complete |
| Multi-location management + floor plan editor | ✅ Complete |
| Camera tags + bulk actions | ✅ Complete |
| Dark/light theme toggle | ✅ Complete |
| Keyboard shortcuts (Cmd+K, ?, 1–6) | ✅ Complete |
| Onboarding wizard | ✅ Complete |
| CSV/JSON export | ✅ Complete |
| Responsive mobile web | ✅ Complete |
| Health monitoring dashboard + Prometheus metrics | ✅ Complete |
| API docs at /docs (Swagger UI) | ✅ Complete |
| Analytics dashboard (ClickHouse) | ✅ Complete |
| Camera wall (/wall) — 8 layouts, auto-rotate, keyboard nav | ✅ Complete |
| AI detection badges (person/vehicle/animal) | ✅ Complete |

### Mobile App

| Feature | Status |
|---------|--------|
| Auth flow (login/register) | ✅ Complete |
| Camera grid with MJPEG thumbnails | ✅ Complete |
| Camera detail with WebRTC live view + MJPEG fallback | ✅ Complete |
| Events list with severity colours | ✅ Complete |
| Recordings list — offline cache (last 20) | ✅ Complete |
| Motion zone toggles per camera | ✅ Complete |
| PTZ controls | ✅ Complete |
| Recording start/stop screen | ✅ Complete |
| Push notification token registration (Expo) | ✅ Complete |
| Offline detection banner | ✅ Complete |

### Backend (Go Services)

| Service | Status |
|---------|--------|
| camera-ingest: gRPC server, go2rtc client, ONVIF discovery, health monitor, PTZ | ✅ Complete |
| video-pipeline: FFmpeg recording, R2 storage, spool, snapshots, retention | ✅ Complete |
| event-engine: Redis pub/sub, rule evaluator (condition trees), dispatch, audit | ✅ Complete |
| extension-runtime: gRPC server scaffold | ✅ Complete |
| All services: go.mod with correct dependencies | ✅ Written (go mod tidy needs Go 1.22+) |

### Known Gaps

| Gap | Priority |
|-----|----------|
| Go services need `go mod tidy` + `go build` run on a machine with Go 1.22+ | 🟠 High |
| Production deployment (Vercel + Fly.io) untested end-to-end | 🟠 High |
| Email sending needs `RESEND_API_KEY` in `.env` | 🟠 High |
| Sentry error monitoring needs `SENTRY_DSN` in `.env` | 🟡 Medium |
| Google OAuth button exists but handler not connected | 🟢 Low |
| Recording download button may not be wired to signed URL | 🟢 Low |

---

## 20. Phase 2 Changelog

### Camera Detection

- **USB cameras**: Probes go2rtc for ffmpeg device sources at indices 0–4
- **Wired cameras**: Extended network scan (ports 37777, 34567, 8000 for Dahua, XMEye, Hikvision)
- **Test Connection**: Registers temp stream, waits for producers, grabs JPEG snapshot — real codec/resolution shown

### AI Detection

- `ai-detection.service.ts` analyzes JPEG frames via OpenAI Vision API
- Graceful degradation: returns empty results if `AI_PROVIDER=none`
- Motion events auto-trigger AI analysis (fire-and-forget, doesn't block API response)
- Person/vehicle/animal badges on events page
- Confidence threshold: 0.7

### Recording

- Continuous mode: auto-starts on camera connect, segments every 30 minutes
- Real MP4 capture from go2rtc; Range header support for seeking
- R2 upload when video-pipeline unavailable (direct mode)

### Extensions

- `extension-runner.ts`: Node.js `vm` sandbox with `codeGeneration: {strings: false, wasm: false}`
- Wired into action executor for `extension_hook` actions
- 8 demo extensions seeded in marketplace

### Bug Fixes

| Bug | Fix |
|-----|-----|
| Docker recording paths | Named volume `recordings-data` at `/data/recordings` + `RECORDINGS_DIR` env var |
| WebSocket reconnect loop | Intercept close code 4001, refresh token before retry (max 3 failures) |
| JWT refresh race | Guard proactive refresh with `!isRefreshing` |
| go2rtc stream gap on startup | `syncStreamsOnStartup()` on health-checker `start()` |
| Event clip retention | Hourly cleanup: delete files + clear `clip_path` older than 7 days |
| Mobile TypeScript `any` | `Record<string, unknown>` + typed helpers (`str`, `num`, `bool`, `pick`) |
| Zone drawing on mobile | Motion zone toggles with `PATCH /cameras/:id/zones/:zoneId` + optimistic update |

### New Features (Phase 2)

- **Mobile offline cache** — AsyncStorage, last 20 recordings, amber "Offline — cached Xm ago" banner
- **Tauri desktop app** — system tray, native notifications, auto-start, minimize-to-tray, connection screen
- **ClickHouse analytics** — `events_analytics` + `recordings_analytics` tables, timeseries/heatmap/breakdown endpoints, analytics dashboard
- **Camera wall** — fullscreen `/wall` page, 8 layouts (1×1 to 1+7), auto-rotate, URL param bookmarking, keyboard shortcuts
- **Webhook delivery tracking** — exponential-backoff retry (1–5 attempts), `webhook_delivery_attempts` table, delivery log panel in rules page
- **Rate limiting** — Redis-backed middleware + integration tests (9/9 passing)
- **Two-way audio** — go2rtc backchannel (`?backchannel=1`), `PATCH /cameras/:id/capabilities` endpoint
- **PTZ (real ONVIF)** — forwarded to camera-ingest gRPC, real ONVIF SOAP commands
- **TURN server** — coturn service in docker-compose, `TURN_SERVER_*` env vars
- **Push notifications (server-side)** — Expo Push API delivery from action-executor

---

## 21. Plan Tiers

| Feature | Free | Pro ($10/mo) | Business ($50/mo) | Enterprise (Custom) |
|---------|------|-------------|-------------------|-------------------|
| Cameras | 4 | 16 | 100 | Unlimited |
| Users | 2 | 5 | 25 | Unlimited |
| Retention | 7 days | 30 days | 90 days | Custom |
| Concurrent streams | 2 | 4 | 8 | 16 |
| Motion detection | Yes | Yes | Yes | Yes |
| AI detection | No | Basic (person) | Full | Full + custom models |
| Locations | 1 | 1 | 10 | Unlimited |
| Extensions | 2 | 10 | Unlimited | Unlimited |
| API access | No | Read-only | Full | Full |
| White-label | No | No | No | Yes |
| SSO / SAML | No | No | No | Yes |
| SLA | None | None | 99.5% | 99.9% |
| Support | Community | Email | Priority email | Dedicated + SLA |
