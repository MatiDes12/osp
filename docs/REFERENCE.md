# OSP — Complete Technical Reference

**Open Surveillance Platform** · Version 0.1.0

Single authoritative reference for OSP. Covers product vision, architecture, database schema, API design and versioning, microservices, video pipeline, event system, auth model, extension SDK, infrastructure, environment variables, development workflow, testing, observability, and implementation status.

See also: [PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md) · [CLIENT_SETUP.md](./CLIENT_SETUP.md)

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Personas](#2-personas)
3. [Feature Matrix](#3-feature-matrix)
4. [Product Roadmap](#4-product-roadmap)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Competitive Analysis](#6-competitive-analysis)
7. [High-Level Architecture](#7-high-level-architecture)
8. [Tech Stack](#8-tech-stack)
9. [Monorepo Structure](#9-monorepo-structure)
10. [Database Schema](#10-database-schema)
11. [API Gateway](#11-api-gateway)
12. [API Versioning](#12-api-versioning)
13. [WebSocket Server](#13-websocket-server)
14. [Web Application](#14-web-application)
15. [Mobile Application](#15-mobile-application)
16. [Desktop Application](#16-desktop-application)
17. [Go Microservices](#17-go-microservices)
18. [Edge Agent](#18-edge-agent)
19. [Video Pipeline](#19-video-pipeline)
20. [Real-Time Event System](#20-real-time-event-system)
21. [Authentication & Authorization](#21-authentication--authorization)
22. [Rule Engine & Action Dispatch](#22-rule-engine--action-dispatch)
23. [AI Detection](#23-ai-detection)
24. [License Plate Recognition](#24-license-plate-recognition)
25. [Analytics (ClickHouse)](#25-analytics-clickhouse)
26. [Extension System](#26-extension-system)
27. [Multi-Tenancy](#27-multi-tenancy)
28. [Coding Standards](#28-coding-standards)
29. [Testing Strategy](#29-testing-strategy)
30. [Observability](#30-observability)
31. [Infrastructure](#31-infrastructure)
32. [Environment Variables](#32-environment-variables)
33. [Development Workflow](#33-development-workflow)
34. [Security Model](#34-security-model)
35. [Implementation Status](#35-implementation-status)
36. [Plan Tiers](#36-plan-tiers)

---

## 1. Product Vision

OSP is a **complete, standalone surveillance platform** — not just a framework or extension system. Out of the box it provides professional-grade camera management, live monitoring, recording, motion detection, and alerting for any scale from a single home camera to thousands across enterprise sites.

What makes OSP unique: beyond being a fully-featured product it is also an **open platform**. Customers can customize it through extensions, custom rules, and white-label theming. Developers can build and sell plugins in the marketplace. This dual nature — **product + platform** — means OSP competes with closed products like Ring and Verkada while offering the flexibility of open systems like Frigate.

**OSP is for**:
- **End users** who want a powerful, vendor-agnostic surveillance system that works immediately
- **Businesses** who need multi-tenant, role-based camera management across locations
- **Developers** who want to build custom integrations, AI models, or white-label solutions

---

## 2. Personas

### 2.1 Homeowner — "Sarah"

1–8 cameras, home/property use.

**Must-have**: Mobile-first live view (<2s), push notifications with snapshot, RTSP/ONVIF, 7-day recording, Viewer role sharing, motion zones.

### 2.2 Small Business Owner — "Marcus"

5–30 cameras, needs remote monitoring and access control.

**Must-have**: Unified view for all camera brands, RBAC, zone alerts with schedule, 30-day retention, clip export.

### 2.3 Retail Chain Manager — "Diana"

12 stores × 15–50 cameras. Loss prevention + compliance.

**Must-have**: Multi-location management, cross-store event search, heat map analytics, exportable reports.

### 2.4 Mall / Enterprise — "James"

500–1 000+ cameras, 24/7 command center.

**Must-have**: Sub-tenant architecture, audit log, 90-day retention, federated search, SLA-backed uptime, RBAC with sub-tenant roles.

---

## 3. Feature Matrix

| Feature                     | Home         | Business   | Retail     | Enterprise          |
| --------------------------- | ------------ | ---------- | ---------- | ------------------- |
| Live View                   | Core         | Core       | Core       | Core                |
| Playback / Timeline         | Core         | Core       | Core       | Core                |
| Motion-Triggered Recording  | Core         | Core       | Core       | Core                |
| Continuous Recording        | Extension    | Core       | Core       | Core                |
| Motion Detection            | Core         | Core       | Core       | Core                |
| Person Detection            | Extension    | Extension  | Core       | Core                |
| Vehicle Detection           | Extension    | Extension  | Extension  | Core                |
| Custom Alert Rules          | Core (basic) | Core       | Core       | Core (advanced)     |
| Push / Email / Webhook      | Core/Core/—  | All        | All        | All                 |
| Role-Based Access           | Basic        | Core       | Core       | Core (sub-tenants)  |
| Multi-Location              | —            | Extension  | Core       | Core                |
| Analytics Dashboard         | —            | Basic      | Core       | Core + custom       |
| White-Label                 | —            | —          | Extension  | Core                |
| Audit Log                   | —            | —          | Core       | Core                |
| SSO / SAML                  | —            | —          | —          | Core                |
| LPR                         | —            | Extension  | Extension  | Core                |

---

## 4. Product Roadmap

### Phase 1 — MVP (done)
- [x] Multi-tenant auth, Camera CRUD, Live WebRTC, Motion detection
- [x] Alert rules (webhook, email, push), Recording (R2)
- [x] Web dashboard, Desktop app (Tauri + go2rtc sidecar), Docker agent

### Phase 2 — Growth
- [ ] React Native mobile app
- [ ] ClickHouse analytics (heat maps, counts)
- [ ] Extension marketplace + SDK v2
- [ ] LPR, AI person/vehicle detection
- [ ] Multi-location sub-tenant, Audit log, SSO/SAML

### Phase 3 — Enterprise
- [ ] Command center layout, Access control integration SDK
- [ ] Custom AI model hosting, Federated search, SLA dashboard

---

## 5. Non-Functional Requirements

| Requirement         | Target                                           |
| ------------------- | ------------------------------------------------ |
| Live view latency   | < 200 ms (WebRTC) / < 3 s (HLS)                 |
| Stream start time   | < 2 s from grid click                            |
| Concurrent streams  | 100 (Phase 1), 1 000 (Phase 2)                   |
| API p99 latency     | < 200 ms                                         |
| Uptime              | 99.9% (Phase 1), 99.99% (Enterprise)             |
| Event delivery      | < 500 ms from detection to browser push          |
| RLS enforcement     | 100% — no cross-tenant data leakage              |
| Auth token lifetime | Access: 1 h, Refresh: 7 d                        |

---

## 6. Competitive Analysis

| Product            | Weaknesses vs OSP                              |
| ------------------ | ---------------------------------------------- |
| Ring / Arlo        | Closed, vendor lock-in, no enterprise/self-host |
| Milestone XProtect | On-premise only, Windows, high cost            |
| Frigate            | Self-host only, no SaaS, no multi-tenancy      |
| Verkada            | Proprietary hardware required, very expensive  |
| Unifi Protect      | Hardware lock-in, limited cloud                |
| **OSP**            | Any camera, extensible, multi-tenant SaaS      |

---

## 7. High-Level Architecture

```
Browser / Mobile / Desktop
         |  HTTPS  |  WebSocket(:3002)
         v
  +----------------------------------+
  |     API Gateway (Hono/Bun)       |  :3000
  +--+-------+-------+---------------+
     | gRPC  | gRPC  | gRPC
     v       v       v
 camera-  video-   event-    extension-
 ingest   pipeline  engine    runtime
 :50051   :50052   :50053    :50054
     |
     v
  go2rtc --- cameras (RTSP / ONVIF / USB / WebRTC)
  :1984 / :8554 / :8555

  Supabase (PostgreSQL + Auth) | Redis | Cloudflare R2 | ClickHouse

  Edge Agent (on-premise) :8084 | BoltDB -> syncs to Gateway
```

### Data flows

| Flow               | Path                                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| Browser live video | Browser -> Gateway /whep -> go2rtc WHEP -> camera RTSP                        |
| Motion event       | camera-ingest -> Redis events:{tenantId} -> WS server -> browser              |
| Rule trigger       | Event -> rule-evaluator -> action-executor -> webhook/email/push/recording    |
| Recording upload   | video-pipeline HLS segments -> R2 -> Gateway signs URL                        |
| Analytics write    | event-engine -> ClickHouse (batch async)                                      |
| Edge sync          | BoltDB buffer -> POST batch to Gateway on reconnect                           |

---

## 8. Tech Stack

| Layer            | Technology                                         |
| ---------------- | -------------------------------------------------- |
| Web              | Next.js 15 (App Router) + Tailwind CSS + shadcn/ui |
| Mobile           | React Native + Expo                                |
| Desktop          | Tauri v2 (bundled go2rtc sidecar)                  |
| State            | Zustand + TanStack Query                           |
| API Gateway      | Hono on Bun (TypeScript)                           |
| Go services      | camera-ingest, video-pipeline, event-engine, ext-runtime |
| Camera proxy     | go2rtc                                             |
| Primary DB       | Supabase (PostgreSQL + Auth + RLS)                 |
| Cache / pub-sub  | Redis (Upstash)                                    |
| Object storage   | Cloudflare R2                                      |
| Analytics DB     | ClickHouse                                         |
| Monorepo         | pnpm workspaces + Turborepo                        |

---

## 9. Monorepo Structure

```
osp/
├── apps/
│   ├── web/               # Next.js 15 dashboard
│   ├── mobile/            # React Native + Expo
│   └── desktop/           # Tauri v2
├── packages/
│   ├── shared/            # TS types, utils, API client
│   ├── ui/                # shadcn/ui components
│   └── sdk/               # Extension SDK
├── services/
│   ├── gateway/           # Hono/Bun API gateway
│   ├── camera-ingest/     # Go
│   ├── video-pipeline/    # Go + FFmpeg
│   ├── event-engine/      # Go
│   └── extension-runtime/ # Go (sandboxed)
├── infra/
│   ├── docker/            # docker-compose files
│   ├── k8s/
│   ├── supabase/          # Migrations, RLS policies
│   └── clickhouse/
└── docs/
```

---

## 10. Database Schema

All tables: `tenant_id uuid NOT NULL` for RLS. FK convention: `fk_{table}_{ref}`.

### tenants

`id` uuid PK, `name` text, `plan` (home/business/enterprise), `status` (active/suspended), `created_at`

### profiles

`id` uuid PK FK->auth.users, `tenant_id`, `role` (owner/admin/operator/viewer), `full_name`, `avatar_url`

### cameras

| Column          | Type        | Notes                                     |
| --------------- | ----------- | ----------------------------------------- |
| `id`            | uuid PK     |                                           |
| `tenant_id`     | uuid FK     |                                           |
| `name`          | text        |                                           |
| `stream_url`    | text        | Encrypted RTSP/ONVIF URL                  |
| `protocol`      | text        | rtsp / onvif / webrtc / hls / mjpeg       |
| `status`        | text        | online / offline / error / connecting     |
| `location`      | text        |                                           |
| `go2rtc_stream` | text        | Stream key in go2rtc                      |
| `snapshot_url`  | text        |                                           |
| `settings`      | jsonb       | resolution, fps, retention, etc.          |
| `created_at`    | timestamptz |                                           |
| `updated_at`    | timestamptz |                                           |

### events

`id`, `tenant_id`, `camera_id`, `type` (motion/person/vehicle/animal/lpr/custom), `confidence` float 0-1, `snapshot_url` (R2 signed URL), `metadata` jsonb (bounding boxes, plate, zone), `rule_id` (nullable), `created_at`

### recordings

`id`, `tenant_id`, `camera_id`, `start_time`, `end_time`, `duration_s`, `size_bytes`, `storage_path` (R2 key), `trigger` (motion/continuous/manual/rule), `status` (recording/complete/failed), `created_at`

### alert_rules

`id`, `tenant_id`, `name`, `enabled`, `conditions` jsonb, `actions` jsonb, `schedule` jsonb, `cooldown_s` int, `created_at`

### api_keys

`id`, `tenant_id`, `name`, `key_hash` (bcrypt), `key_prefix` (8 chars for display), `last_used`, `created_by`, `created_at`

### edge_agents

`id`, `tenant_id`, `name`, `status` (online/offline), `version`, `last_seen_at`, `metadata` jsonb (go2rtc URL, camera count, platform), `created_at`

### Other tables

`camera_zones`, `webhook_deliveries`, `webhook_delivery_attempts`, `notification_tokens`, `tenant_invites`, `audit_log`, `extensions`, `extension_configs`, `lpr_entries`, `analytics_summaries`

---

## 11. API Gateway

**Base URL**: `/api/v1/`
**Auth**: `Authorization: Bearer <jwt>` or `X-API-Key: <key>`
**Tenant**: `X-Tenant-Id: <id>` (validated against JWT)

### Routes

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET/POST | `/api/v1/cameras` | List / create cameras |
| GET/PATCH/DELETE | `/api/v1/cameras/:id` | Get / update / delete |
| GET | `/api/v1/cameras/:id/stream` | WHEP/HLS stream info |
| GET | `/api/v1/cameras/:id/snapshot` | Latest snapshot URL |
| GET | `/api/v1/events` | List events (filters: type, cameraId, date) |
| GET | `/api/v1/events/:id` | Single event |
| GET/DELETE | `/api/v1/recordings` | List / delete recordings |
| GET | `/api/v1/recordings/:id/url` | Signed playback URL |
| CRUD | `/api/v1/alert-rules` | Alert rule management |
| CRUD | `/api/v1/api-keys` | API key management |
| GET | `/api/v1/edge/agents` | List edge agents |
| POST | `/api/v1/edge/heartbeat` | Agent heartbeat |
| POST | `/api/v1/edge/events` | Bulk event sync |
| GET | `/api/v1/analytics/summary` | Events by camera/day |
| GET | `/api/v1/analytics/heatmap` | Hourly distribution |
| GET/PATCH | `/api/v1/admin/tenants` | (Admin only) tenant management |

### Error envelope

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

Prefixes: `AUTH_*` · `CAMERA_*` · `VIDEO_*` · `RULE_*` · `EXT_*` · `TENANT_*`

---

## 12. API Versioning

All routes: `/api/v1/*`. Every response: `API-Version: 1`.

**Non-breaking** (no bump): adding optional fields, new endpoints, bug fixes.

**Breaking** (requires v2): removing/renaming fields, type changes, URL changes, error envelope changes.

### Deprecation lifecycle

6-month window when v2 ships:

```
Deprecation: true
Sunset: Mon, 31 Dec 2026 00:00:00 GMT
```

```typescript
import { deprecated } from "../middleware/api-version.js";
router.get("/old-endpoint", deprecated("2026-12-31"), handler);
```

After sunset: `410 Gone`.

**Client**: send `Accept-Version: 1` to pin. Watch for `Deprecation: true` header.

Implemented in `services/gateway/src/middleware/api-version.ts`.

---

## 13. WebSocket Server

Port: `3002`. Auth: JWT in `Authorization` header or `?token=` on upgrade.

Event shape: `{ type, tenantId, payload: { id, cameraId, type, confidence, snapshotUrl, createdAt } }`

Message types: `event`, `camera.status`, `recording.start`, `recording.end`, `agent.online`, `agent.offline`, `ping` (reply pong).

---

## 14. Web Application

**Next.js 15 App Router** · URL: `https://osp-web-eight.vercel.app`

| Route | Description |
| ----- | ----------- |
| `/` | Redirects to /login or /cameras |
| `/login` | Supabase magic link + password auth |
| `/(dashboard)/cameras` | Camera grid + setup wizards |
| `/(dashboard)/cameras/[id]` | Live view + events |
| `/(dashboard)/recordings` | Recording library + playback |
| `/(dashboard)/events` | Event feed |
| `/(dashboard)/rules` | Alert rule builder |
| `/(dashboard)/analytics` | ClickHouse charts |
| `/(dashboard)/settings` | Users, API keys, tenant settings |
| `/(dashboard)/admin` | Super-admin panel |

Key components: `CameraGrid`, `LiveViewPlayer`, `DesktopSetupWizard`, `WebAgentSetupWizard`, `Sidebar`, `AuthGuard`

---

## 15. Mobile Application

React Native + Expo · iOS 16+ / Android 13+

Screens: Camera list -> Live view (WebRTC) -> Event feed -> Push notification deep-link -> Settings.
Push: FCM (Android) + APNS (iOS) via `notification_tokens` table.

---

## 16. Desktop Application

Tauri v2 · Windows 10+ / macOS 12+ / Ubuntu 20.04+

go2rtc bundled as Tauri sidecar. Rust spawns it on launch — no Docker needed.

```
Tauri (Rust) -> spawns go2rtc sidecar (:1984 / :8554 / :8555)
  -> Next.js frontend (Vercel URL)
    -> isTauri() -> use http://localhost:1984 for all streams
```

**Tauri command** `get_go2rtc_status`: returns true if go2rtc is responding.

**First-launch wizard**: `DesktopSetupWizard` shown when `osp_desktop_setup_complete` key is missing. Polls `:1984/api/streams` up to 20s.

**Binary**: `apps/desktop/scripts/download-go2rtc.sh` -> `src-tauri/binaries/`

---

## 17. Go Microservices

### camera-ingest (:50051)

gRPC: `AddStream`, `RemoveStream`, `GetStreamStatus`, `ListStreams`.
Background goroutine per camera -> frame comparison -> publishes MotionEvent to Redis.

### video-pipeline (:50052)

gRPC: `StartRecording`, `StopRecording`, `GetRecordingStatus`, `TriggerSnapshot`.
HLS segments -> assembled .mp4 -> uploaded to R2.

### event-engine (:50053)

Subscribes to Redis `events:{tenantId}` -> evaluates rules -> dispatches: webhook, email (Resend), push (FCM/APNS), recording, ClickHouse write.

### extension-runtime (:50054)

V8 isolate per extension, CPU/memory limits enforced, restricted API surface.

---

## 18. Edge Agent

Image: `ghcr.io/matides12/osp-camera-ingest:latest`

- Buffers events in BoltDB when offline
- Syncs on reconnect: `POST /api/v1/edge/events`
- Heartbeat: `POST /api/v1/edge/heartbeat` every 30s
- **Online**: status="online" AND last_seen_at within 3 minutes

```bash
# Linux (--network host)
docker run -d --name osp-go2rtc --network host --restart unless-stopped alexxit/go2rtc

docker run -d --name osp-agent --network host --restart unless-stopped \
  -e GATEWAY_URL=https://osp-gateway.fly.dev \
  -e TENANT_ID=YOUR_TENANT_ID -e API_TOKEN=YOUR_API_TOKEN \
  -e GO2RTC_URL=http://localhost:1984 \
  ghcr.io/matides12/osp-camera-ingest:latest

# Windows/macOS: replace --network host with -p 1984:1984 -p 8554:8554 -p 8555:8555/udp
```

---

## 19. Video Pipeline

### Protocols (go2rtc)

RTSP, ONVIF, WebRTC, HLS, MJPEG, RTMP, USB — all supported as input and re-stream.

### Viewer delivery

| Viewer  | Protocol      | Latency  |
| ------- | ------------- | -------- |
| Browser | WHEP (WebRTC) | < 200 ms |
| Browser | HLS fallback  | 3–6 s    |
| Mobile  | WebRTC        | < 200 ms |
| Desktop | WHEP local    | < 100 ms |

### Recording

HLS segments -> assembled .mp4 -> R2 at `{tenant_id}/{camera_id}/{timestamp}.mp4` -> recordings row with signed URL.

---

## 20. Real-Time Event System

1. Detect (camera-ingest motion / AI inference)
2. `PUBLISH events:{tenantId}` to Redis
3. WS server fans out to all connected browsers for that tenant
4. event-engine inserts to `events` table
5. Evaluates matching `alert_rules` -> dispatches actions

---

## 21. Authentication & Authorization

**Flow**: Supabase Auth -> JWT with `tenant_id` + `role` claims -> Gateway verifies -> RLS enforces.

| Role     | Permissions                                    |
| -------- | ---------------------------------------------- |
| owner    | Full access, billing, delete tenant            |
| admin    | All data, user management, no billing          |
| operator | Cameras, events, recordings, rules (no users)  |
| viewer   | Read-only cameras and events                   |

**API Key auth**: bcrypt-hashed in DB; gateway hashes incoming key and compares.

**Password policy**: >= 8 chars, uppercase + lowercase + digit, common passwords rejected.

---

## 22. Rule Engine & Action Dispatch

### Conditions (jsonb)

```json
{
  "eventTypes": ["motion", "person"],
  "cameraIds": ["uuid"],
  "zoneIds": ["zone-uuid"],
  "minConfidence": 0.7,
  "schedule": {
    "timezone": "America/New_York",
    "windows": [{"days": [1,2,3,4,5], "start": "22:00", "end": "06:00"}]
  }
}
```

### Actions (jsonb)

```json
{
  "webhook": {"url": "https://...", "secret": "..."},
  "email": {"to": ["user@example.com"]},
  "push": {"userIds": ["uuid"]},
  "record": {"durationS": 30},
  "snapshot": true
}
```

**Cooldown**: `cooldown_s` field; `last_triggered_at` tracked per rule in Redis.

---

## 23. AI Detection

| Model            | Provider        | Output                      |
| ---------------- | --------------- | --------------------------- |
| Object detection | OpenAI GPT-4o   | Labels + bounding boxes     |
| LPR              | PlateRecognizer | Plate text + region + score |

Results in `events.metadata` jsonb. AI labels can trigger label-specific rules.

---

## 24. License Plate Recognition

Motion -> snapshot -> POST to PlateRecognizer -> store in `events.metadata` + `lpr_entries` -> rules can match on `metadata.plate` patterns.

---

## 25. Analytics (ClickHouse)

```sql
CREATE TABLE motion_events (
  tenant_id UUID, camera_id UUID,
  event_type LowCardinality(String), confidence Float32,
  zone_id Nullable(UUID), ts DateTime
) ENGINE = MergeTree() PARTITION BY toYYYYMM(ts)
  ORDER BY (tenant_id, camera_id, ts);
```

Endpoints: `GET /api/v1/analytics/summary`, `GET /api/v1/analytics/heatmap`, `GET /api/v1/analytics/counts`

---

## 26. Extension System

TypeScript modules executed in V8 sandbox (extension-runtime).

```typescript
import { OSP } from "@osp/sdk";
export default {
  name: "my-extension", version: "1.0.0",
  onEvent(event: OSP.Event): OSP.ActionResult {
    if (event.type === "motion" && event.confidence > 0.8)
      return { action: "notify", message: "High confidence motion" };
  }
};
```

**Capabilities**: `onEvent`, `onSchedule`, `addRule`, `addWidget`, `fetchAllowed`

**Manifest** (`extension.json`): name, version, permissions (`events:read`, `cameras:read`, `fetch:<host>`), settings array.

---

## 27. Multi-Tenancy

- All tables: `tenant_id uuid NOT NULL`
- RLS: `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`
- Storage paths: `{tenant_id}/{camera_id}/{timestamp}.mp4`
- Redis namespaced: `events:{tenantId}`, `rate:{tenantId}:{route}`

```sql
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON cameras
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

---

## 28. Coding Standards

| Scope             | Convention                      |
| ----------------- | ------------------------------- |
| DB tables         | snake_case, plural              |
| DB columns        | snake_case                      |
| DB indexes        | idx_{table}_{columns}           |
| DB foreign keys   | fk_{table}_{ref_table}          |
| API routes        | kebab-case, plural              |
| JSON / query      | camelCase                       |
| TS files          | kebab-case                      |
| TS components     | PascalCase                      |
| TS constants      | SCREAMING_SNAKE_CASE            |
| TS types          | PascalCase, no I-prefix         |
| Go files          | snake_case                      |
| Go packages       | lowercase, single word          |

File sizes: components <= 300 lines · services <= 500 lines · functions <= 50 lines.

Rules: no hardcoded secrets · no `console.log` in prod · TypeScript strict mode · no `any` without comment.

---

## 29. Testing Strategy

| Layer             | Tool               | Target         |
| ----------------- | ------------------ | -------------- |
| Unit (TS)         | Vitest             | 80%            |
| Unit (Go)         | go test            | 80%            |
| Integration (API) | Vitest + Supertest | Key routes     |
| Integration (DB)  | Real Supabase      | All migrations |
| E2E               | Playwright         | Core flows     |
| Load              | k6                 | 100/1000/10000 streams |

Core E2E flows: login -> camera grid · add camera -> live view · create rule -> notification · record -> playback.

---

## 30. Observability

**Logs**: structured JSON to stdout — `level`, `ts`, `service`, `requestId`, `tenantId`, `msg`.

**Metrics**: `http_request_duration_ms`, `ws_connections_active`, `streams_active`, `events_per_second`, `recordings_active`.

**Health**: `GET /health` (Gateway) · `GET http://localhost:1984/` (go2rtc) · `GET http://localhost:8084/health` (Edge agent).

**Alerting**: Sentry (`SENTRY_DSN`) + Fly.io built-in metrics.

---

## 31. Infrastructure

**Dev**: `infra/docker/docker-compose.yml` — Supabase local stack, Redis, ClickHouse, go2rtc.

**Edge agent**: `infra/docker/docker-compose.agent.yml` — go2rtc + ngrok + osp-agent. **Production client install (no repo):** [`infra/docker/edge/README.md`](../infra/docker/edge/README.md) · [`docs/CLIENT_SETUP.md`](CLIENT_SETUP.md) Option B.

**Prod**: `infra/k8s/` — HPA, resource limits, pod disruption budgets.

**CI/CD** (GitHub Actions):

| Pipeline             | Trigger           | Steps                             |
| -------------------- | ----------------- | --------------------------------- |
| ci.yml               | PR / push main    | Lint, type-check, unit tests      |
| docker-build.yml     | Push main         | Build + push to GHCR              |
| e2e.yml              | Push main         | Playwright E2E                    |
| deploy-gateway.yml   | Push main         | fly deploy to Fly.io              |

**Deployments**: Web -> Vercel (`osp-web-eight.vercel.app`) · Gateway -> Fly.io (`osp-gateway.fly.dev`)

---

## 32. Environment Variables

Copy `.env.example` to `.env` for local dev.

### Supabase (Required)

| Variable                    | Default                                                   | Description                  |
| --------------------------- | --------------------------------------------------------- | ---------------------------- |
| `SUPABASE_URL`              | http://localhost:54321                                    | Supabase API endpoint        |
| `SUPABASE_ANON_KEY`         | —                                                         | Public key (browser/mobile)  |
| `SUPABASE_SERVICE_ROLE_KEY` | —                                                         | Private key (backend only)   |
| `DATABASE_URL`              | postgresql://postgres:postgres@localhost:54322/postgres   | Direct PostgreSQL connection |

Use direct port 5432 (not pooler 6543): `postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres?sslmode=require`

### Redis

`REDIS_URL` = `redis://localhost:6379`

### Cloudflare R2

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (osp-storage), `R2_ENDPOINT` (https://{account}.r2.cloudflarestorage.com)

Storage path: `{tenant_id}/{camera_id}/{timestamp}.mp4`

### API Gateway

| Variable               | Default                 | Notes                                |
| ---------------------- | ----------------------- | ------------------------------------ |
| `GATEWAY_PORT`         | 3000                    | REST + WebSocket                     |
| `GATEWAY_CORS_ORIGINS` | http://localhost:3001   | Comma-separated origins              |
| `RATE_LIMIT_FAIL_OPEN` | true                    | Allow when Redis is down             |
| `API_URL`              | http://localhost:3000   | Internal gateway URL                 |
| `API_TOKEN`            | —                       | Service-to-service secret (required) |

### gRPC Ports

`INGEST_GRPC_PORT`=50051 · `VIDEO_GRPC_PORT`=50052 · `EVENT_GRPC_PORT`=50053 · `EXTENSION_GRPC_PORT`=50054

### go2rtc

`GO2RTC_API_URL`=http://localhost:1984 · `GO2RTC_RTSP_PORT`=8554 · `GO2RTC_WEBRTC_PORT`=8555

### TURN

`TURN_SERVER_URL`=turn:localhost:3478 · `TURN_SERVER_USERNAME`=osp · `TURN_SERVER_CREDENTIAL`=osp

Options: coturn (self-hosted), Cloudflare TURN, Twilio TURN. Leave empty for local-only.

### Security

`OSP_ENCRYPTION_KEY` — 32-byte key for encrypting RTSP URLs + API keys in DB. Generate: `openssl rand -hex 32`. Never commit.

### Notifications

`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_CONTENT` (.p8), `FCM_SERVER_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `SENTRY_DSN` (empty to disable).

### Frontend

```env
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3002
NEXT_PUBLIC_GO2RTC_URL=http://localhost:1984
```

### Required (fail if missing)

`SUPABASE_URL` · `SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `DATABASE_URL` · `REDIS_URL` · `OSP_ENCRYPTION_KEY` · `API_TOKEN`

### Rotating secrets

- `API_TOKEN`: generate new, update all services, redeploy
- `OSP_ENCRYPTION_KEY`: cannot rotate without re-encrypting stored data
- `R2_SECRET_ACCESS_KEY`: rotate in Cloudflare, update everywhere
- DB password: Supabase -> Database -> Settings, update `DATABASE_URL`

---

## 33. Development Workflow

```bash
pnpm dev           # Start all services
pnpm build         # Build all packages
pnpm lint          # Lint all
pnpm type-check    # TS type check
pnpm test          # Run all tests
pnpm format        # Prettier
```

**Local stack**:
```bash
docker compose -f infra/docker/docker-compose.yml up -d
pnpm supabase db push
pnpm dev
```

**DB change**: add migration to `infra/supabase/migrations/{ts}_{desc}.sql` + RLS policy + update `@osp/shared` types.

**API change**: update route in `services/gateway/src/routes/` + types in `packages/shared/src/types/` + `pnpm --filter @osp/shared build`.

**Pre-commit**: no secrets · RLS on new tables · input validation · signed video URLs · rate limiting · audit logging.

---

## 34. Security Model

| Layer          | Mechanism                                              |
| -------------- | ------------------------------------------------------ |
| Transport      | TLS (Cloudflare terminates at edge)                    |
| Authentication | Supabase JWT (HS256) + API key (bcrypt)                |
| Authorization  | RBAC + Supabase RLS                                    |
| Data isolation | Row-level security on all tenant tables                |
| Storage        | Signed URLs (15-min expiry) for R2 objects             |
| Input          | Zod validation on all API inputs                       |
| Rate limiting  | Per-tenant per-route in Redis                          |
| Secrets        | Encrypted at rest with `OSP_ENCRYPTION_KEY`            |
| Headers        | HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy |

**Mitigations**: SQL injection (parameterized queries) · XSS (Next.js escaping) · CSRF (SameSite + token auth) · Path traversal (path.resolve + allowlist) · SSRF (camera URL validation + private IP blocklist) · Token theft (1h expiry + refresh rotation).

---

## 35. Implementation Status

### Phase 1 — Complete

Supabase auth + RLS · Camera CRUD · go2rtc integration · Live WebRTC · Motion detection · Event storage · Alert rules (webhook/email/push) · Recording (R2) · Web dashboard · Desktop app (Tauri) · Desktop setup wizard · Docker edge agent · Web agent setup wizard · API versioning · Admin panel

### Phase 2 — In Progress / Planned

React Native mobile · ClickHouse analytics (in progress) · Extension marketplace · LPR · AI person/vehicle detection · Multi-location (sub-tenant) · Audit log · SSO/SAML

---

## 36. Plan Tiers

| Feature       | Home ($0/mo) | Business ($29/mo) | Enterprise (custom) |
| ------------- | ------------ | ----------------- | ------------------- |
| Cameras       | Up to 5      | Up to 50          | Unlimited           |
| Retention     | 7 days       | 30 days           | 90+ days            |
| Users         | 3            | 25                | Unlimited           |
| Alert rules   | 3            | Unlimited         | Unlimited           |
| Extensions    | 1            | 10                | Unlimited           |
| Analytics     | —            | Basic             | Advanced + custom   |
| White-label   | —            | —                 | Yes                 |
| SSO / SAML    | —            | —                 | Yes                 |
| SLA           | —            | 99.9%             | 99.99%              |
| Support       | Community    | Email (48h)       | Dedicated CSM       |
