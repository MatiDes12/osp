# Open Surveillance Platform (OSP) — Planning & Architecture

## Overview

Full-stack, cross-platform surveillance camera application that connects to any camera type (Ring, Arlo, Wyze, Hikvision, Dahua, ONVIF-compatible, RTSP streams, USB/IP cameras). Core differentiator: an **extension layer** that lets any customer (home user, retail store, mall, enterprise) customize the platform through plugins, custom rules, and white-label theming.

---

## Phase 0: Planning & Architecture (NO CODE YET)

All 4 documents below must be reviewed and approved before any implementation begins.

---

# Document 1: Product Requirements Document (PRD)

## 1.1 Target Personas

| Persona | Description | Camera Count | Key Needs |
|---------|-------------|-------------|-----------|
| **Homeowner** | Individual monitoring home/property | 1–8 | Easy setup, mobile alerts, clip review, affordable |
| **Small Business** | Shop, restaurant, office | 4–32 | Employee access control, zone alerts, basic analytics |
| **Retail Chain** | Multi-location retail | 32–500 per location | Centralized management, loss prevention, people counting |
| **Mall / Enterprise** | Large campus, warehouse, mall | 500–10,000+ | Multi-tenant, RBAC, SLA, custom integrations, AI analytics |

## 1.2 Core Features (MVP — Phase 1)

- **Camera Management**: Add/remove cameras (RTSP, ONVIF, WebRTC, USB/IP), auto-discovery on LAN
- **Live View**: Low-latency (<500ms) live streaming, grid layout, full-screen, PTZ controls
- **Recording & Playback**: Continuous and motion-triggered recording, timeline scrubber, clip export
- **Motion Detection**: Built-in motion detection with configurable sensitivity and zones
- **Alerts & Notifications**: Push notifications (mobile), email, webhook for motion/offline events
- **User Management**: Multi-user with roles (Admin, Viewer, Operator)
- **Multi-Tenant**: Tenant isolation, tenant-scoped cameras/users/data
- **Web + Mobile**: Next.js web dashboard, React Native mobile app (iOS + Android)

## 1.3 Extension Features (Phase 2+)

- Visual rule builder (trigger → condition → action)
- Extension SDK (TypeScript) with hook points
- Custom AI model integration (person/vehicle/animal detection, LPR)
- White-label theming (logo, colors, custom domain)
- Extension marketplace
- Custom analytics widgets
- Custom notification channels (Slack, PagerDuty, custom webhook)
- Desktop app (Tauri v2)
- ClickHouse analytics (heatmaps, people counting, dwell time)

## 1.4 Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Live view latency | <500ms end-to-end |
| Uptime | 99.9% (8.7h downtime/year) |
| Concurrent streams per user | Up to 16 simultaneous |
| Concurrent streams per tenant | Up to 1,000 (enterprise) |
| Storage retention | Configurable: 7d (free), 30d (pro), 90d+ (enterprise) |
| API response time | p95 <200ms for CRUD, p95 <100ms for cached |
| Video start time | <2s from tap to first frame |
| Push notification delivery | <3s from event detection |

## 1.5 MVP Scope vs Roadmap

### Phase 1 (MVP) — Months 1–4
- RTSP + ONVIF camera support
- Live view (WebRTC)
- Motion-triggered recording + playback (HLS)
- Basic alerts (push + email)
- Web dashboard (Next.js)
- Mobile app (React Native / Expo)
- Multi-user RBAC
- Multi-tenant with Supabase RLS

### Phase 2 — Months 5–8
- Visual rule engine
- Extension SDK v1
- AI detection (person/vehicle/animal)
- Desktop app (Tauri)
- ClickHouse analytics
- White-label theming

### Phase 3 — Months 9–12
- Extension marketplace
- Custom AI model hosting
- License plate recognition
- Advanced analytics (heatmaps, people counting)
- SSO / SAML for enterprise
- Edge processing support

---

# Document 2: System Architecture

## 2.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │
│  │ Next.js  │  │ React    │  │ Tauri v2 │  │ Shared TS Pkg    │    │
│  │ Web App  │  │ Native   │  │ Desktop  │  │ (types, API      │    │
│  │          │  │ Mobile   │  │ App      │  │  client, state)  │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────────┘    │
│       │              │              │                                 │
└───────┼──────────────┼──────────────┼────────────────────────────────┘
        │              │              │
        ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       API GATEWAY (Hono/Bun)                         │
│                                                                      │
│  REST API ─── WebSocket Server ─── Auth Middleware ─── Rate Limiter  │
│                                                                      │
└──────┬──────────────┬───────────────┬────────────────┬───────────────┘
       │              │               │                │
       ▼              ▼               ▼                ▼
┌────────────┐ ┌────────────┐ ┌────────────────┐ ┌──────────────┐
│ Camera     │ │ Video      │ │ Event / Rule   │ │ Extension    │
│ Ingestion  │ │ Processing │ │ Engine         │ │ Runtime      │
│ Service    │ │ Pipeline   │ │                │ │ (Sandbox)    │
│ (Go)       │ │ (Go)       │ │ (Go)           │ │ (Go)         │
└──────┬─────┘ └──────┬─────┘ └──────┬─────────┘ └──────┬───────┘
       │              │               │                   │
       ▼              ▼               ▼                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                    │
│                                                                      │
│  ┌──────────────┐  ┌─────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Supabase     │  │ Redis   │  │ S3/R2        │  │ ClickHouse  │  │
│  │ (PostgreSQL  │  │ (Cache, │  │ (Video/Image │  │ (Analytics) │  │
│  │  + Auth +    │  │  PubSub,│  │  Storage)    │  │ Phase 2     │  │
│  │  Realtime)   │  │  Rate)  │  │              │  │             │  │
│  └──────────────┘  └─────────┘  └──────────────┘  └─────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                     VIDEO INFRASTRUCTURE                             │
│                                                                      │
│  ┌──────────┐     ┌──────────┐     ┌──────────────┐                 │
│  │ go2rtc   │────▶│ FFmpeg   │────▶│ HLS/WebRTC   │                 │
│  │ (RTSP/   │     │ (Trans-  │     │ Delivery     │                 │
│  │  ONVIF   │     │  code)   │     │              │                 │
│  │  Proxy)  │     │          │     │              │                 │
│  └──────────┘     └──────────┘     └──────────────┘                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## 2.2 Service Boundaries & Communication

| Service | Language | Responsibility | Communication |
|---------|----------|---------------|---------------|
| **API Gateway** | TypeScript (Hono/Bun) | REST/WS, auth, routing, BFF | HTTP/WS to clients, gRPC to Go services |
| **Camera Ingestion** | Go | RTSP/ONVIF connection management, stream multiplexing | gRPC from gateway, direct to go2rtc |
| **Video Processing** | Go | FFmpeg orchestration, transcoding, thumbnail gen, HLS packaging | gRPC, reads/writes to S3 |
| **Event Engine** | Go | Motion detection events, rule evaluation, notification dispatch | Redis pub/sub, gRPC |
| **Extension Runtime** | Go | Sandboxed plugin execution, hook dispatch | gRPC, Wasm sandbox |

### Inter-Service Communication

- **Synchronous**: gRPC between API Gateway ↔ Go services (low latency, typed contracts)
- **Asynchronous**: Redis pub/sub for event fan-out (motion detected → rule engine → notifications)
- **Real-time to clients**: WebSocket from API Gateway, Supabase Realtime for DB changes

## 2.3 Camera Ingestion Pipeline

```
Camera (RTSP/ONVIF/WebRTC)
    │
    ▼
go2rtc (Protocol Normalization)
    │
    ├──▶ WebRTC → Client (live view, <500ms)
    │
    ├──▶ FFmpeg → HLS segments → S3/R2 (recording)
    │
    ├──▶ FFmpeg → JPEG snapshot → S3/R2 (thumbnails)
    │
    └──▶ Motion Detection → Event Engine → Alerts
```

## 2.4 Extension / Plugin Architecture

```
┌─────────────────────────────────────────────┐
│              Extension SDK (TypeScript)       │
│                                               │
│  Hooks:                                       │
│  ├── onMotionDetected(event, context)        │
│  ├── onPersonDetected(event, context)        │
│  ├── onCameraOffline(event, context)         │
│  ├── onRecordingComplete(event, context)     │
│  └── onAlertTriggered(event, context)        │
│                                               │
│  APIs:                                        │
│  ├── cameras.list() / cameras.get(id)        │
│  ├── events.query(filters)                   │
│  ├── notifications.send(channel, message)    │
│  ├── storage.get(key) / storage.set(key,val) │
│  └── ui.registerWidget(component)            │
│                                               │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│         Extension Runtime (Go + Wasm)        │
│                                               │
│  - Sandboxed execution (Wasm/V8 isolate)     │
│  - Resource limits (CPU, memory, time)        │
│  - Tenant-scoped data access                  │
│  - Audit logging for all extension actions    │
│                                               │
└─────────────────────────────────────────────┘
```

## 2.5 Multi-Tenancy Model

- **Shared infrastructure**: All tenants share the same database cluster, API servers, video pipeline
- **Isolated data**: Row-Level Security (RLS) on every table, tenant_id column on all rows
- **Isolated storage**: S3 prefix per tenant (`/tenant-{id}/videos/`, `/tenant-{id}/snapshots/`)
- **Isolated extensions**: Each tenant's extensions run in their own sandbox
- **Plan-based limits**: Feature flags and quotas per tenant plan (cameras, users, retention, API rate)

## 2.6 Edge vs Cloud Processing Decision Matrix

| Capability | Edge | Cloud | Decision Criteria |
|-----------|------|-------|-------------------|
| Live stream relay | Yes (go2rtc local) | Yes (cloud relay) | Edge preferred for LAN; cloud for remote access |
| Motion detection | Yes (lightweight) | Yes (GPU-accelerated) | Edge for basic; cloud for AI-based |
| Recording | Yes (local NVR mode) | Yes (cloud storage) | User preference / plan tier |
| AI detection | Phase 3 (edge device) | Phase 2 (cloud GPU) | Cloud first, edge for privacy-conscious |
| Transcoding | Yes (if hardware encode) | Yes (always) | Cloud for consistency; edge for bandwidth savings |

---

# Document 3: Technical Design

## 3.1 Data Models (ERD)

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     tenants      │       │      users       │       │   user_roles     │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK, uuid)   │◄──┐   │ id (PK, uuid)   │──────▶│ id (PK, uuid)   │
│ name             │   │   │ tenant_id (FK)   │       │ user_id (FK)    │
│ slug             │   │   │ email            │       │ role (enum)     │
│ plan             │   │   │ display_name     │       │ tenant_id (FK)  │
│ settings (jsonb) │   │   │ avatar_url       │       │ camera_ids[]    │
│ theme (jsonb)    │   │   │ auth_provider    │       │ created_at      │
│ logo_url         │   │   │ created_at       │       └─────────────────┘
│ domain           │   │   │ updated_at       │
│ created_at       │   │   └─────────────────┘
│ updated_at       │   │
└─────────────────┘   │
                      │
┌─────────────────┐   │   ┌─────────────────┐       ┌─────────────────┐
│    cameras       │   │   │    recordings    │       │     events       │
├─────────────────┤   │   ├─────────────────┤       ├─────────────────┤
│ id (PK, uuid)   │   │   │ id (PK, uuid)   │       │ id (PK, uuid)   │
│ tenant_id (FK)  ├───┘   │ camera_id (FK)  │       │ camera_id (FK)  │
│ name             │       │ tenant_id (FK)  │       │ tenant_id (FK)  │
│ type (enum)      │       │ start_time      │       │ type (enum)     │
│ stream_url       │       │ end_time        │       │ severity (enum) │
│ protocol (enum)  │       │ duration_sec    │       │ metadata (jsonb)│
│ status (enum)    │       │ storage_path    │       │ thumbnail_url   │
│ config (jsonb)   │       │ size_bytes      │       │ clip_url        │
│ location (jsonb) │       │ format          │       │ created_at      │
│ zones (jsonb[])  │       │ trigger (enum)  │       │ acknowledged_at │
│ ptz_capable      │       │ created_at      │       └─────────────────┘
│ audio_capable    │       └─────────────────┘
│ created_at       │
│ updated_at       │       ┌─────────────────┐       ┌─────────────────┐
└─────────────────┘       │     rules        │       │   extensions     │
                          ├─────────────────┤       ├─────────────────┤
                          │ id (PK, uuid)   │       │ id (PK, uuid)   │
                          │ tenant_id (FK)  │       │ tenant_id (FK)  │
                          │ name             │       │ name             │
                          │ enabled          │       │ version          │
                          │ trigger (jsonb)  │       │ manifest (jsonb)│
                          │ conditions (jsonb)│      │ config (jsonb)  │
                          │ actions (jsonb)  │       │ enabled          │
                          │ schedule (jsonb) │       │ sandbox_config  │
                          │ camera_ids[]     │       │ hooks[]          │
                          │ created_at       │       │ created_at       │
                          │ updated_at       │       │ updated_at       │
                          └─────────────────┘       └─────────────────┘

Enums:
  camera_type:    rtsp, onvif, webrtc, usb, ip
  camera_status:  online, offline, connecting, error
  event_type:     motion, person, vehicle, animal, camera_offline, camera_online, custom
  event_severity: low, medium, high, critical
  user_role:      owner, admin, operator, viewer
  recording_trigger: continuous, motion, manual, rule
  tenant_plan:    free, pro, business, enterprise
```

## 3.2 API Design

### REST Endpoints

```
# Authentication
POST   /api/v1/auth/login
POST   /api/v1/auth/register
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

# Tenants
GET    /api/v1/tenants/:id
PATCH  /api/v1/tenants/:id
GET    /api/v1/tenants/:id/settings

# Cameras
GET    /api/v1/cameras                    # List (paginated, filterable)
POST   /api/v1/cameras                    # Add camera
GET    /api/v1/cameras/:id                # Get camera details
PATCH  /api/v1/cameras/:id                # Update camera
DELETE /api/v1/cameras/:id                # Remove camera
POST   /api/v1/cameras/:id/ptz           # PTZ control
GET    /api/v1/cameras/:id/snapshot       # Current snapshot
GET    /api/v1/cameras/:id/stream         # Stream URL (WebRTC offer/answer)
POST   /api/v1/cameras/discover           # Auto-discover on network

# Recordings
GET    /api/v1/recordings                 # List (paginated, filterable by camera, date range)
GET    /api/v1/recordings/:id             # Get recording details + playback URL
DELETE /api/v1/recordings/:id             # Delete recording
GET    /api/v1/recordings/:id/download    # Download clip

# Events
GET    /api/v1/events                     # List (paginated, filterable)
GET    /api/v1/events/:id                 # Get event details
PATCH  /api/v1/events/:id/acknowledge     # Acknowledge event

# Rules
GET    /api/v1/rules                      # List rules
POST   /api/v1/rules                      # Create rule
GET    /api/v1/rules/:id
PATCH  /api/v1/rules/:id
DELETE /api/v1/rules/:id

# Users & Roles
GET    /api/v1/users                      # List tenant users
POST   /api/v1/users/invite               # Invite user
PATCH  /api/v1/users/:id/role             # Update role
DELETE /api/v1/users/:id                  # Remove user

# Extensions
GET    /api/v1/extensions                 # List installed extensions
POST   /api/v1/extensions                 # Install extension
GET    /api/v1/extensions/:id
PATCH  /api/v1/extensions/:id/config      # Update extension config
DELETE /api/v1/extensions/:id             # Uninstall
GET    /api/v1/extensions/marketplace     # Browse marketplace
```

### WebSocket Events

```
# Client → Server
ws://api/v1/ws

Messages:
  { type: "subscribe", channels: ["events:tenant-123", "camera:cam-456"] }
  { type: "unsubscribe", channels: ["events:tenant-123"] }
  { type: "ping" }

# Server → Client
  { type: "event.new", data: { id, type, camera_id, severity, ... } }
  { type: "camera.status", data: { id, status, timestamp } }
  { type: "recording.complete", data: { id, camera_id, duration, ... } }
  { type: "pong" }
```

### API Response Envelope

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

## 3.3 Authentication & Authorization

### Auth Flow
- **Supabase Auth** handles identity: email/password, OAuth (Google, GitHub), SSO/SAML (enterprise)
- **JWT tokens** issued by Supabase, validated by API Gateway
- **Refresh tokens** stored in httpOnly cookies (web) or secure storage (mobile)

### RBAC Model

| Role | Cameras | Live View | Playback | Rules | Users | Extensions | Billing |
|------|---------|-----------|----------|-------|-------|------------|---------|
| **Owner** | CRUD | Yes | Yes | CRUD | CRUD | CRUD | Yes |
| **Admin** | CRUD | Yes | Yes | CRUD | CRU | CRUD | No |
| **Operator** | Read | Yes | Yes | Read | No | No | No |
| **Viewer** | Scoped | Scoped | Scoped | No | No | No | No |

- Viewer role can be scoped to specific cameras (via `camera_ids[]` in user_roles)
- All data access enforced via Supabase RLS policies with `tenant_id` check

### RLS Policy Example

```sql
CREATE POLICY "tenant_isolation" ON cameras
  FOR ALL
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');
```

## 3.4 Video Pipeline

```
┌──────────┐    RTSP/ONVIF     ┌──────────┐
│  Camera   │──────────────────▶│  go2rtc   │
└──────────┘                    └─────┬────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                  │
                    ▼                 ▼                  ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │ WebRTC Relay │  │ FFmpeg       │  │ Motion       │
            │ (Live View)  │  │ Transcoder   │  │ Detector     │
            │              │  │              │  │              │
            │ WHEP/WHIP    │  │ → HLS (.m3u8)│  │ → Event      │
            │ signaling    │  │ → Thumbnails │  │   Engine     │
            └──────────────┘  └──────┬───────┘  └──────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │ S3/R2 Storage │
                              │              │
                              │ /tenant-id/  │
                              │   /videos/   │
                              │   /thumbs/   │
                              └──────────────┘
```

### Storage Layout

```
/tenant-{id}/
  /videos/
    /camera-{id}/
      /2026/03/16/
        segment-001.ts
        segment-002.ts
        playlist.m3u8
  /snapshots/
    /camera-{id}/
      latest.jpg
      /2026/03/16/
        1710600000.jpg
  /clips/
    /event-{id}.mp4
```

## 3.5 Event System

```
Motion Frame Diff
    │
    ▼
Motion Detection Service
    │
    ├── Threshold check (sensitivity per zone)
    │
    ▼
Redis Pub/Sub: "events:{tenant_id}"
    │
    ├──▶ Rule Engine (evaluate all active rules)
    │       │
    │       ├── Match? → Execute actions:
    │       │     ├── Send push notification
    │       │     ├── Send email
    │       │     ├── Trigger webhook
    │       │     ├── Start recording
    │       │     └── Run extension hook
    │       │
    │       └── No match? → Log & discard
    │
    ├──▶ WebSocket broadcast to subscribed clients
    │
    ├──▶ Extension hooks (onMotionDetected)
    │
    └──▶ Event store (PostgreSQL + optional ClickHouse)
```

## 3.6 Extension SDK

```typescript
// extension-sdk/types.ts

interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  hooks: HookRegistration[];
  widgets?: WidgetRegistration[];
  permissions: Permission[];
}

interface HookRegistration {
  event: "onMotionDetected" | "onPersonDetected" | "onCameraOffline"
       | "onRecordingComplete" | "onAlertTriggered";
  handler: string; // file path to handler function
}

interface ExtensionContext {
  tenantId: string;
  cameras: CameraAPI;
  events: EventAPI;
  notifications: NotificationAPI;
  storage: KeyValueAPI;   // tenant-scoped KV store
  logger: Logger;
}

// Example extension
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

---

# Document 4: Consistency & Standards

## 4.1 Naming Conventions

| Domain | Convention | Examples |
|--------|-----------|----------|
| API routes | kebab-case, plural nouns | `/api/v1/cameras`, `/api/v1/user-roles` |
| DB tables | snake_case, plural | `cameras`, `user_roles`, `tenant_settings` |
| DB columns | snake_case | `tenant_id`, `created_at`, `stream_url` |
| TS types/interfaces | PascalCase | `Camera`, `EventType`, `UserRole` |
| TS variables/functions | camelCase | `getCamera`, `handleMotionEvent` |
| Go types | PascalCase | `CameraService`, `EventHandler` |
| Go functions | PascalCase (exported), camelCase (unexported) | `HandleStream`, `parseConfig` |
| React components | PascalCase | `CameraGrid`, `EventTimeline` |
| Files (TS) | kebab-case | `camera-service.ts`, `use-camera.ts` |
| Files (Go) | snake_case | `camera_service.go`, `event_handler.go` |
| Env vars | SCREAMING_SNAKE_CASE | `DATABASE_URL`, `REDIS_URL` |

## 4.2 Error Handling

### API Errors

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "CAMERA_NOT_FOUND",
    "message": "Camera with ID 'abc-123' not found",
    "details": null
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 422 | Invalid request body |
| `RATE_LIMITED` | 429 | Too many requests |
| `CAMERA_OFFLINE` | 503 | Camera not reachable |
| `STREAM_ERROR` | 502 | Stream connection failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Go Error Handling

- Always wrap errors with context: `fmt.Errorf("connecting to camera %s: %w", id, err)`
- Use typed errors for known conditions
- Never panic in library code

### TypeScript Error Handling

- Use Result types or try/catch with typed errors
- API client throws typed `ApiError` with code, message, status
- Components show user-friendly messages, log technical details

## 4.3 Logging & Observability

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

### Observability Stack

- **Metrics**: Prometheus + Grafana (stream count, latency, error rates)
- **Logs**: Structured JSON → aggregator (Loki, CloudWatch, or Datadog)
- **Traces**: OpenTelemetry for request tracing across services
- **Health checks**: `/healthz` and `/readyz` on every service

### Key Metrics

- `camera_streams_active` (gauge, by tenant)
- `stream_latency_ms` (histogram)
- `events_processed_total` (counter, by type)
- `api_request_duration_ms` (histogram, by endpoint)
- `recording_storage_bytes` (gauge, by tenant)

## 4.4 Testing Strategy

| Type | Coverage Target | Tools | Scope |
|------|----------------|-------|-------|
| **Unit** | 80%+ | Jest/Vitest (TS), Go testing | Functions, utilities, hooks |
| **Integration** | Key paths | Supertest (API), testcontainers | API endpoints, DB operations |
| **E2E** | Critical flows | Playwright (web), Detox (mobile) | Login → view camera → receive alert |
| **Load** | Benchmarks | k6, vegeta | Concurrent streams, API throughput |

### Test Organization

```
/packages/api/
  /src/
    /cameras/
      cameras.service.ts
      cameras.service.test.ts      # Unit tests co-located
  /test/
    /integration/
      cameras.integration.test.ts  # Integration tests
/apps/web/
  /e2e/
    dashboard.spec.ts              # E2E tests
```

## 4.5 Git Workflow & PR Conventions

- **Branch naming**: `feat/camera-discovery`, `fix/stream-reconnect`, `refactor/event-pipeline`
- **Commit format**: `feat: add ONVIF camera auto-discovery`
- **PR requirements**: Description with summary + test plan, passing CI, 1+ reviewer approval
- **Main branch**: `main` (protected, no direct push)
- **Release**: Tag-based releases (`v1.0.0`, `v1.1.0`)

---

## Tech Stack Summary

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Mobile | React Native + Expo | Single codebase for iOS/Android, massive ecosystem, OTA updates |
| Web | Next.js 15 | SSR for dashboard performance, App Router, React Server Components |
| Desktop | Tauri v2 | 10x lighter than Electron, Rust backend for local camera discovery |
| Core Backend | Go | Best for concurrent stream handling, low memory per connection, FFmpeg orchestration |
| API Layer | Hono/Bun | Fast DX for REST/WebSocket, TypeScript shared types with frontend |
| Database | Supabase (PostgreSQL) | RLS for multi-tenancy, built-in auth, realtime subscriptions, generous free tier |
| Video | go2rtc + FFmpeg | Universal camera protocol support (RTSP, ONVIF, WebRTC), battle-tested |
| Storage | Cloudflare R2 | S3-compatible, zero egress fees (critical for video serving) |
| Cache | Redis (Upstash) | Caching, rate limiting, pub/sub for events |
| Analytics | ClickHouse (Phase 2) | Time-series event aggregation, heatmaps |
| AI/ML | ONNX Runtime / Cloud APIs (Phase 2+) | Person/vehicle detection, LPR |
| Infrastructure | Docker Compose (dev), Kubernetes/Fly.io (prod) | Container orchestration |
| CDN | Cloudflare | DDoS protection, video delivery, edge caching |

---

## Security Considerations

- **Data in transit**: TLS everywhere (HTTPS, WSS, encrypted RTSP where supported)
- **Data at rest**: S3 server-side encryption, PostgreSQL encryption
- **Auth**: JWT with short expiry (15min access, 7d refresh), httpOnly cookies
- **RLS**: Every table has tenant_id-based row-level security
- **Extension sandbox**: Wasm/V8 isolate with resource limits, no filesystem access
- **Rate limiting**: Per-tenant, per-endpoint rate limits via Redis
- **Input validation**: Zod schemas on all API inputs
- **Secrets**: Environment variables only, never in code or config files
- **CORS**: Strict origin allowlist per tenant
- **Audit log**: All admin actions logged with actor, action, timestamp

## Scalability Notes (10 → 10,000 cameras)

| Scale | Architecture | Notes |
|-------|-------------|-------|
| 1–50 cameras | Single server, Docker Compose | go2rtc + all services on one machine |
| 50–500 cameras | Multi-server, load balanced | Separate video pipeline from API, horizontal scale API |
| 500–5,000 cameras | Kubernetes cluster | Auto-scaling pods per service, regional go2rtc instances |
| 5,000–10,000+ | Multi-region, edge nodes | Edge go2rtc per site, cloud for storage/API, ClickHouse for analytics |

## Cost Estimation Approach

| Component | Free Tier | Scaling Cost Driver |
|-----------|-----------|-------------------|
| Supabase | 500MB DB, 1GB storage, 50k auth users | DB size, realtime connections |
| Cloudflare R2 | 10GB storage, 1M reads/month | Storage GB, Class A operations |
| Redis (Upstash) | 10k commands/day | Commands/day, storage |
| go2rtc | Self-hosted (compute cost) | CPU per concurrent stream (~0.1 core per stream) |
| FFmpeg | Self-hosted (compute cost) | CPU per transcode job (~0.5 core per stream) |
| Fly.io / K8s | ~$5/mo per small VM | VM count × size |

**Estimated MVP cost** (100 cameras, 10 users): ~$50–150/month
**Estimated scale cost** (1,000 cameras, 100 users): ~$500–1,500/month
