# Open Surveillance Platform (OSP) — Consistency & Standards Document

**Version**: 1.0
**Date**: 2026-03-16
**Status**: Draft — Pending Review
**Depends on**: [PRD](./PRD.md), [System Architecture](./SYSTEM-ARCHITECTURE.md), [Technical Design](./TECHNICAL-DESIGN.md) (All Approved)

**Audience**: Every developer working on OSP. This document is mandatory reading before first commit.

---

## Table of Contents

1. [Naming Conventions](#1-naming-conventions)
2. [Project Structure](#2-project-structure)
3. [Error Handling Standard](#3-error-handling-standard)
4. [Logging & Observability](#4-logging--observability)
5. [Testing Strategy](#5-testing-strategy)
6. [Git Workflow](#6-git-workflow)
7. [Code Review Checklist](#7-code-review-checklist)

---

## 1. Naming Conventions

### 1.1 Database

| Element | Convention | Examples |
|---------|-----------|----------|
| **Tables** | snake_case, plural | `users`, `camera_zones`, `alert_rules`, `tenant_extensions` |
| **Columns** | snake_case | `created_at`, `tenant_id`, `storage_path`, `last_seen_at` |
| **Primary keys** | Always `id` (uuid) | `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
| **Foreign keys** | `{referenced_table_singular}_id` | `tenant_id`, `camera_id`, `user_id`, `extension_id` |
| **FK constraints** | `fk_{table}_{ref_table}` | `fk_cameras_tenants`, `fk_events_cameras`, `fk_user_roles_users` |
| **Indexes** | `idx_{table}_{columns}` | `idx_events_camera_id_detected_at`, `idx_recordings_tenant_id_start_time` |
| **Unique indexes** | `idx_{table}_{columns}_unique` | `idx_users_email_unique`, `idx_tenants_slug_unique` |
| **Partial indexes** | `idx_{table}_{columns}_{filter}` | `idx_events_unacknowledged`, `idx_rules_enabled` |
| **Enums** | snake_case singular | `camera_status`, `event_type`, `tenant_plan`, `user_role` |
| **Enum values** | snake_case | `motion_triggered`, `in_progress`, `camera_offline` |
| **JSON columns** | snake_case, describe shape in comment | `settings jsonb -- { timezone, retention_days, ... }` |
| **Boolean columns** | Positive phrasing, no `is_` prefix | `enabled`, `acknowledged`, `ptz_capable` (not `is_enabled`) |
| **Timestamp columns** | `{event}_at` or `{action}_at` | `created_at`, `updated_at`, `last_seen_at`, `acknowledged_at` |

### 1.2 API

| Element | Convention | Examples |
|---------|-----------|----------|
| **Route paths** | kebab-case, plural nouns | `/api/v1/cameras`, `/api/v1/alert-rules`, `/api/v1/camera-zones` |
| **Route params** | camelCase | `/api/v1/cameras/:cameraId/zones/:zoneId` |
| **Query params** | camelCase | `?startDate=2026-03-16&cameraId=abc&sortBy=createdAt` |
| **Request bodies** | camelCase JSON | `{ "connectionUri": "rtsp://...", "motionSensitivity": 5 }` |
| **Response bodies** | camelCase JSON | `{ "cameraId": "...", "createdAt": "...", "storageBytes": 1024 }` |
| **Custom headers** | X-prefixed PascalCase | `X-Tenant-Id`, `X-Request-Id`, `X-Rate-Limit-Remaining` |
| **Error codes** | SCREAMING_SNAKE_CASE | `CAMERA_NOT_FOUND`, `AUTH_TOKEN_EXPIRED`, `RATE_LIMIT_EXCEEDED` |
| **Pagination** | `page` + `limit` params | `?page=1&limit=20` → response includes `meta.total`, `meta.hasMore` |
| **Filtering** | Field name as param | `?status=online&type=motion&severity=high` |
| **Sorting** | `sortBy` + `sortOrder` | `?sortBy=createdAt&sortOrder=desc` |
| **Date/time** | ISO 8601 (UTC) | `"2026-03-16T22:15:03.421Z"` |
| **Versioning** | Path prefix | `/api/v1/`, `/api/v2/` (when breaking changes) |

**DB-to-API field name conversion**: Database `snake_case` is automatically converted to `camelCase` in API responses and vice versa. A single serialization layer handles this — never manually convert field names in business logic.

### 1.3 TypeScript Code

| Element | Convention | Examples |
|---------|-----------|----------|
| **Files (general)** | kebab-case `.ts` | `camera-service.ts`, `use-live-feed.ts`, `event-types.ts` |
| **Files (components)** | PascalCase `.tsx` | `CameraGrid.tsx`, `AlertRuleBuilder.tsx`, `EventTimeline.tsx` |
| **Files (tests)** | Same name + `.test.ts` | `camera-service.test.ts`, `CameraGrid.test.tsx` |
| **Functions** | camelCase verb-first | `createCamera()`, `handleMotionEvent()`, `validateRuleConfig()` |
| **Variables** | camelCase | `cameraList`, `motionThreshold`, `tenantSettings` |
| **Constants** | SCREAMING_SNAKE_CASE | `MAX_CONCURRENT_STREAMS`, `DEFAULT_RETENTION_DAYS`, `API_VERSION` |
| **Types / Interfaces** | PascalCase, no `I` prefix | `Camera`, `EventType`, `CreateCameraRequest` (not `ICamera`) |
| **Enums** | PascalCase name, PascalCase members | `enum CameraStatus { Online, Offline, Connecting }` |
| **React hooks** | `use` prefix | `useLiveFeed()`, `useCameraList()`, `useEventStream()` |
| **React components** | PascalCase | `CameraGrid`, `LiveViewPlayer`, `ZoneDrawer` |
| **Props interfaces** | `{Component}Props` | `CameraGridProps`, `LiveViewPlayerProps` |
| **Event handlers** | `on{Event}` or `handle{Event}` | `onMotionDetected`, `handleCameraSelect` |
| **Boolean variables** | Positive, `is/has/can/should` prefix | `isOnline`, `hasPermission`, `canPTZ`, `shouldRecord` |
| **Async functions** | No special suffix | `fetchCameras()` not `fetchCamerasAsync()` |
| **Zod schemas** | `{Name}Schema` | `CreateCameraSchema`, `LoginRequestSchema` |

### 1.4 Go Code

| Element | Convention | Examples |
|---------|-----------|----------|
| **Files** | snake_case `.go` | `camera_ingestion.go`, `event_handler.go`, `rtsp_client.go` |
| **Files (tests)** | `_test.go` suffix | `camera_ingestion_test.go`, `event_handler_test.go` |
| **Packages** | lowercase, single word, no underscore | `ingest`, `transcode`, `events`, `rules`, `extensions` |
| **Exported types** | PascalCase | `CameraService`, `EventHandler`, `StreamConfig` |
| **Unexported types** | camelCase | `streamWorker`, `connectionPool`, `frameBuffer` |
| **Exported functions** | PascalCase verb-first | `HandleStream()`, `EvaluateRules()`, `ParseConfig()` |
| **Unexported functions** | camelCase | `handleStream()`, `parseONVIFResponse()`, `retryConnect()` |
| **Interfaces** | PascalCase, `-er` suffix when single-method | `Streamer`, `RuleEvaluator`, `CameraRepository` |
| **Constants** | PascalCase (exported), camelCase (unexported) | `MaxRetries`, `DefaultTimeout` / `maxBufferSize` |
| **Errors** | `Err` prefix | `ErrCameraOffline`, `ErrStreamTimeout`, `ErrUnauthorized` |
| **Context keys** | Unexported custom type | `type ctxKey string; const tenantIDKey ctxKey = "tenantID"` |
| **Protobuf files** | snake_case `.proto` | `camera_service.proto`, `event_types.proto` |
| **gRPC services** | PascalCase `Service` suffix | `CameraIngestService`, `VideoProcessingService` |

### 1.5 Environment Variables

| Convention | Examples |
|-----------|----------|
| SCREAMING_SNAKE_CASE | `DATABASE_URL`, `REDIS_URL`, `R2_ACCESS_KEY_ID` |
| Prefixed by service | `GATEWAY_PORT`, `INGEST_GRPC_PORT`, `EVENT_REDIS_URL` |
| Boolean as `true/false` | `GATEWAY_CORS_ENABLED=true` |
| Duration with unit suffix | `INGEST_HEALTH_CHECK_INTERVAL=30s`, `GATEWAY_JWT_EXPIRY=15m` |
| Secrets clearly named | `SUPABASE_SERVICE_ROLE_KEY`, `R2_SECRET_ACCESS_KEY`, `OSP_ENCRYPTION_KEY` |

---

## 2. Project Structure

### 2.1 Monorepo Root

```
osp/
├── apps/                       # Deployable applications
│   ├── web/                    # Next.js 15 web dashboard
│   ├── mobile/                 # React Native + Expo mobile app
│   └── desktop/                # Tauri v2 desktop app (Phase 2)
├── packages/                   # Shared TypeScript packages
│   ├── shared/                 # Types, validation, API client, constants
│   ├── ui/                     # Shared React UI components
│   └── sdk/                    # Extension SDK
├── services/                   # Go backend services
│   ├── gateway/                # Hono/Bun API gateway + WebSocket
│   ├── camera-ingest/          # Camera connection management
│   ├── video-pipeline/         # FFmpeg orchestration, recording, storage
│   ├── event-engine/           # Motion detection, rule evaluation, notifications
│   └── extension-runtime/      # Wasm sandbox, hook dispatch
├── infra/                      # Infrastructure configuration
│   ├── docker/                 # Docker Compose, Dockerfiles
│   ├── k8s/                    # Kubernetes manifests
│   └── supabase/               # Migrations, seed data, RLS policies
├── docs/                       # Project documentation
│   ├── PRD.md
│   ├── SYSTEM-ARCHITECTURE.md
│   ├── TECHNICAL-DESIGN.md
│   └── CONSISTENCY-STANDARDS.md
├── scripts/                    # Dev/CI scripts
├── .github/                    # GitHub Actions workflows
├── turbo.json                  # Turborepo configuration
├── package.json                # Root workspace config
├── pnpm-workspace.yaml         # pnpm workspace definition
├── .env.example                # Environment variable template
├── .gitignore
└── README.md
```

### 2.2 `apps/web/` — Next.js 15 Web Dashboard

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/             # Auth route group (login, register)
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (dashboard)/        # Main dashboard route group
│   │   │   ├── layout.tsx      # Sidebar + header layout
│   │   │   ├── page.tsx        # Dashboard home (camera grid)
│   │   │   ├── cameras/
│   │   │   │   ├── page.tsx            # Camera list
│   │   │   │   ├── [id]/page.tsx       # Camera detail + live view
│   │   │   │   └── [id]/zones/page.tsx # Zone editor
│   │   │   ├── events/
│   │   │   │   ├── page.tsx            # Event timeline
│   │   │   │   └── [id]/page.tsx       # Event detail
│   │   │   ├── recordings/
│   │   │   │   └── page.tsx            # Playback + timeline scrubber
│   │   │   ├── rules/
│   │   │   │   ├── page.tsx            # Rule list
│   │   │   │   └── [id]/page.tsx       # Rule editor
│   │   │   ├── extensions/
│   │   │   │   ├── page.tsx            # Installed extensions
│   │   │   │   └── marketplace/page.tsx
│   │   │   └── settings/
│   │   │       ├── page.tsx            # General settings
│   │   │       ├── users/page.tsx      # User management
│   │   │       └── branding/page.tsx   # White-label config
│   │   ├── layout.tsx          # Root layout
│   │   └── globals.css
│   ├── components/             # App-specific components
│   │   ├── camera/             # CameraGrid, CameraCard, LiveViewPlayer
│   │   ├── events/             # EventTimeline, EventCard, EventFilter
│   │   ├── rules/              # RuleBuilder, ConditionTree, ActionConfig
│   │   ├── recordings/         # TimelineScrubber, HLSPlayer, ClipExport
│   │   ├── zones/              # ZoneDrawer, ZoneOverlay
│   │   └── layout/             # Sidebar, Header, NavigationMenu
│   ├── hooks/                  # Custom React hooks
│   │   ├── use-cameras.ts      # Camera CRUD + live status
│   │   ├── use-live-feed.ts    # WebRTC connection management
│   │   ├── use-events.ts       # Event subscription + queries
│   │   ├── use-recordings.ts   # Recording queries + playback
│   │   └── use-auth.ts         # Auth state + refresh
│   ├── lib/                    # Utilities
│   │   ├── api.ts              # API client instance
│   │   ├── webrtc.ts           # WebRTC helper
│   │   └── constants.ts
│   └── stores/                 # Zustand stores
│       ├── camera-store.ts
│       └── notification-store.ts
├── public/
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

**Purpose**: Primary web interface for all personas. SSR for SEO-irrelevant but performance-critical dashboard pages. React Server Components for settings/config pages. Client components for real-time views (camera grid, events).

**Key dependencies**: `next@15`, `@osp/shared`, `@osp/ui`, `zustand`, `@tanstack/react-query`, `tailwindcss`, `shadcn/ui`, `hls.js`

### 2.3 `apps/mobile/` — React Native + Expo

```
apps/mobile/
├── src/
│   ├── app/                    # Expo Router (file-based routing)
│   │   ├── (auth)/
│   │   │   ├── login.tsx
│   │   │   └── register.tsx
│   │   ├── (tabs)/             # Tab navigator
│   │   │   ├── _layout.tsx     # Tab bar config
│   │   │   ├── index.tsx       # Camera grid (home)
│   │   │   ├── events.tsx      # Event feed
│   │   │   └── settings.tsx    # Settings
│   │   ├── camera/
│   │   │   └── [id].tsx        # Live view + camera detail
│   │   ├── event/
│   │   │   └── [id].tsx        # Event detail
│   │   └── _layout.tsx         # Root layout + auth guard
│   ├── components/
│   │   ├── camera/             # CameraGrid, CameraCard, LiveView
│   │   ├── events/             # EventList, EventCard
│   │   └── common/             # Button, Card, Modal (NativeWind)
│   ├── hooks/                  # Same hook names as web, RN-specific impl
│   ├── lib/
│   │   ├── api.ts
│   │   ├── notifications.ts    # Push notification setup (Expo Notifications)
│   │   └── secure-storage.ts   # Token storage (expo-secure-store)
│   └── stores/
├── app.json                    # Expo config
├── tailwind.config.ts          # NativeWind config
├── tsconfig.json
└── package.json
```

**Purpose**: Mobile-first experience for homeowner and small business personas. Push notifications, quick live view, event review.

**Key dependencies**: `expo@~52`, `expo-router`, `@osp/shared`, `nativewind`, `zustand`, `react-native-webrtc`, `expo-notifications`, `expo-secure-store`

### 2.4 `packages/shared/` — Shared TypeScript Package

```
packages/shared/
├── src/
│   ├── types/                  # All shared TypeScript types
│   │   ├── camera.ts           # Camera, CameraStatus, CameraProtocol, etc.
│   │   ├── event.ts            # Event, EventType, EventSeverity, etc.
│   │   ├── recording.ts        # Recording, RecordingTrigger, etc.
│   │   ├── rule.ts             # AlertRule, ConditionNode, RuleAction, etc.
│   │   ├── user.ts             # User, UserRole, etc.
│   │   ├── tenant.ts           # Tenant, TenantPlan, TenantSettings, etc.
│   │   ├── extension.ts        # Extension, ExtensionManifest, etc.
│   │   ├── api.ts              # ApiResponse, ApiError, PaginationMeta, etc.
│   │   └── index.ts            # Re-exports
│   ├── schemas/                # Zod validation schemas
│   │   ├── camera.schema.ts    # CreateCameraSchema, UpdateCameraSchema
│   │   ├── event.schema.ts
│   │   ├── rule.schema.ts
│   │   └── auth.schema.ts
│   ├── api-client/             # Typed HTTP client
│   │   ├── client.ts           # Base client (fetch wrapper)
│   │   ├── cameras.ts          # cameras.list(), cameras.create(), etc.
│   │   ├── events.ts
│   │   ├── recordings.ts
│   │   ├── rules.ts
│   │   ├── extensions.ts
│   │   └── auth.ts
│   ├── utils/                  # Shared utilities
│   │   ├── date.ts             # Date formatting, timezone helpers
│   │   ├── validation.ts       # Common validators (email, uuid, etc.)
│   │   └── permissions.ts      # Role permission checks
│   └── constants/
│       ├── errors.ts           # Error code constants
│       ├── limits.ts           # Plan limits, rate limits
│       └── defaults.ts         # Default settings values
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

**Purpose**: Single source of truth for types, validation, and API client. Consumed by `web`, `mobile`, `desktop`, and `gateway`.

**Key dependencies**: `zod`, `date-fns` (no React dependency)

### 2.5 `packages/ui/` — Shared UI Components

```
packages/ui/
├── src/
│   ├── components/             # shadcn/ui based components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── table.tsx
│   │   ├── badge.tsx
│   │   ├── toast.tsx
│   │   └── ...
│   ├── primitives/             # Lower-level building blocks
│   │   ├── status-indicator.tsx     # Online/offline dot
│   │   ├── severity-badge.tsx       # Color-coded severity
│   │   ├── camera-thumbnail.tsx     # Lazy-loading camera thumbnail
│   │   └── timeline-bar.tsx         # Horizontal timeline segment
│   └── index.ts
├── tailwind.config.ts          # Design token definitions
├── tsconfig.json
└── package.json
```

**Purpose**: Web-only shared React components. Based on shadcn/ui + Tailwind. Not used by mobile (mobile uses NativeWind equivalents).

### 2.6 `packages/sdk/` — Extension SDK

```
packages/sdk/
├── src/
│   ├── types/                  # SDK types (hooks, context, widgets)
│   │   ├── hooks.ts            # Hook event types, HookResult
│   │   ├── context.ts          # HookContext, CameraAPI, EventAPI, etc.
│   │   ├── manifest.ts         # ExtensionManifest, Permission, ResourceLimits
│   │   ├── widgets.ts          # DashboardWidget, WidgetProps
│   │   └── settings.ts         # SettingsSchema, SettingsField
│   ├── testing/                # Test utilities for extension developers
│   │   ├── mock-context.ts     # Mock HookContext for testing
│   │   ├── mock-events.ts      # Sample event fixtures
│   │   └── test-runner.ts      # Local extension test runner
│   ├── cli/                    # CLI for extension development
│   │   ├── init.ts             # Scaffold new extension
│   │   ├── build.ts            # Compile to Wasm bundle
│   │   ├── test.ts             # Run in local sandbox
│   │   └── publish.ts          # Upload to marketplace
│   └── index.ts
├── tsconfig.json
└── package.json
```

**Purpose**: Published as `@osp/extension-sdk` on npm. Extension developers install this to build extensions.

### 2.7 `services/gateway/` — API Gateway (Hono/Bun)

```
services/gateway/
├── src/
│   ├── index.ts                # Hono app entry point
│   ├── middleware/
│   │   ├── auth.ts             # JWT validation middleware
│   │   ├── rate-limit.ts       # Redis-based rate limiter
│   │   ├── tenant.ts           # Extract tenant context
│   │   ├── request-id.ts       # Generate X-Request-Id
│   │   ├── cors.ts             # Tenant-aware CORS
│   │   └── error-handler.ts    # Global error → standard format
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── camera.routes.ts
│   │   ├── zone.routes.ts
│   │   ├── recording.routes.ts
│   │   ├── event.routes.ts
│   │   ├── rule.routes.ts
│   │   ├── extension.routes.ts
│   │   ├── tenant.routes.ts
│   │   └── health.routes.ts
│   ├── services/               # Business logic (delegates to Go via gRPC)
│   │   ├── camera.service.ts
│   │   ├── recording.service.ts
│   │   ├── event.service.ts
│   │   └── ...
│   ├── grpc/                   # gRPC client stubs
│   │   ├── camera-ingest.client.ts
│   │   ├── video-pipeline.client.ts
│   │   └── event-engine.client.ts
│   ├── ws/                     # WebSocket handlers
│   │   ├── camera-live.ws.ts
│   │   └── events.ws.ts
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client init
│   │   ├── redis.ts            # Redis client init
│   │   └── logger.ts           # Structured logger
│   └── config.ts               # Environment config with validation
├── test/
│   ├── integration/
│   │   ├── auth.test.ts
│   │   ├── camera.test.ts
│   │   └── ...
│   └── helpers/
│       ├── setup.ts            # Test DB setup/teardown
│       └── fixtures.ts         # Test data factories
├── Dockerfile
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

**Purpose**: Single entry point for all client requests. Validates auth, rate limits, routes to Go services via gRPC, manages WebSocket connections.

**Key dependencies**: `hono`, `@osp/shared`, `@supabase/supabase-js`, `@grpc/grpc-js`, `ioredis`

### 2.8 `services/camera-ingest/` — Go Camera Service

```
services/camera-ingest/
├── cmd/
│   └── server/
│       └── main.go             # Entry point, DI wiring
├── internal/
│   ├── server/
│   │   └── grpc.go             # gRPC server setup
│   ├── camera/
│   │   ├── service.go          # CameraService (add, remove, list, config)
│   │   ├── service_test.go
│   │   ├── repository.go       # CameraRepository interface
│   │   └── postgres.go         # PostgreSQL implementation
│   ├── discovery/
│   │   ├── onvif.go            # ONVIF WS-Discovery + probe
│   │   ├── onvif_test.go
│   │   └── scanner.go          # LAN scanner coordinator
│   ├── health/
│   │   ├── monitor.go          # Camera health checker (30s interval)
│   │   └── monitor_test.go
│   ├── stream/
│   │   ├── manager.go          # go2rtc stream lifecycle
│   │   ├── manager_test.go
│   │   └── go2rtc_client.go    # go2rtc HTTP API client
│   └── ptz/
│       ├── controller.go       # PTZ commands via ONVIF
│       └── controller_test.go
├── pkg/
│   └── proto/                  # Generated gRPC stubs
│       └── camera_ingest.pb.go
├── proto/
│   └── camera_ingest.proto     # gRPC service definition
├── Dockerfile
├── go.mod
└── go.sum
```

**Purpose**: Manages all camera connections. Handles ONVIF discovery, RTSP stream lifecycle (via go2rtc), health monitoring, PTZ control.

**Key dependencies**: `google.golang.org/grpc`, `github.com/jackc/pgx/v5`, `github.com/redis/go-redis/v9`

### 2.9 `services/video-pipeline/` — Go Video Service

```
services/video-pipeline/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── server/
│   │   └── grpc.go
│   ├── recording/
│   │   ├── service.go          # Recording lifecycle (start, stop, finalize)
│   │   ├── service_test.go
│   │   ├── ffmpeg.go           # FFmpeg process management
│   │   ├── ffmpeg_test.go
│   │   └── repository.go
│   ├── storage/
│   │   ├── r2.go               # R2 upload/download/delete
│   │   ├── r2_test.go
│   │   ├── spool.go            # Local disk spool for R2 failures
│   │   └── retention.go        # Retention cleanup worker
│   ├── snapshot/
│   │   ├── extractor.go        # Thumbnail/snapshot extraction
│   │   └── extractor_test.go
│   └── playback/
│       ├── service.go          # Signed URL generation, timeline queries
│       └── service_test.go
├── pkg/proto/
├── proto/
│   └── video_pipeline.proto
├── Dockerfile
├── go.mod
└── go.sum
```

**Purpose**: FFmpeg orchestration for recording, HLS packaging, snapshot extraction, R2 storage management, playback URL generation.

### 2.10 `services/event-engine/` — Go Event Service

```
services/event-engine/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── server/
│   │   └── grpc.go
│   ├── motion/
│   │   ├── detector.go         # Frame diff motion detection
│   │   ├── detector_test.go
│   │   └── zone_mask.go        # Zone polygon intersection
│   ├── rules/
│   │   ├── engine.go           # Rule evaluation engine
│   │   ├── engine_test.go
│   │   ├── condition.go        # Condition tree evaluator
│   │   ├── condition_test.go
│   │   └── cache.go            # Compiled rule cache
│   ├── dispatch/
│   │   ├── notifier.go         # Push/email/webhook dispatch
│   │   ├── notifier_test.go
│   │   ├── push.go             # APNs + FCM client
│   │   └── email.go            # SendGrid/SES client
│   ├── events/
│   │   ├── publisher.go        # Redis pub/sub publisher
│   │   ├── subscriber.go       # Redis pub/sub subscriber
│   │   └── repository.go       # Event persistence
│   └── audit/
│       └── logger.go           # Audit log writer
├── pkg/proto/
├── proto/
│   └── event_engine.proto
├── Dockerfile
├── go.mod
└── go.sum
```

**Purpose**: Motion detection, rule evaluation, notification dispatch, event persistence, audit logging.

### 2.11 `services/extension-runtime/` — Go Extension Service

```
services/extension-runtime/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── server/
│   │   └── grpc.go
│   ├── sandbox/
│   │   ├── wasm.go             # Wasm runtime (Extism/Wazero)
│   │   ├── wasm_test.go
│   │   ├── host_functions.go   # SDK API implementations
│   │   └── resource_limiter.go # CPU/memory/API call enforcement
│   ├── hooks/
│   │   ├── dispatcher.go       # Hook chain execution
│   │   ├── dispatcher_test.go
│   │   └── registry.go         # Extension hook registration
│   ├── marketplace/
│   │   ├── service.go          # Browse, install, update
│   │   └── repository.go
│   └── config/
│       ├── encryption.go       # Secret field encrypt/decrypt
│       └── validator.go        # Config schema validation
├── pkg/proto/
├── proto/
│   └── extension_runtime.proto
├── Dockerfile
├── go.mod
└── go.sum
```

**Purpose**: Wasm sandbox execution, extension lifecycle management, hook dispatch, marketplace operations.

### 2.12 `infra/` — Infrastructure

```
infra/
├── docker/
│   ├── docker-compose.yml          # Full local dev stack
│   ├── docker-compose.test.yml     # Test environment (ephemeral DBs)
│   ├── gateway.Dockerfile
│   ├── camera-ingest.Dockerfile
│   ├── video-pipeline.Dockerfile
│   ├── event-engine.Dockerfile
│   └── extension-runtime.Dockerfile
├── k8s/
│   ├── base/                       # Base Kustomize manifests
│   │   ├── gateway/
│   │   ├── camera-ingest/
│   │   ├── video-pipeline/
│   │   ├── event-engine/
│   │   ├── extension-runtime/
│   │   └── go2rtc/
│   ├── overlays/
│   │   ├── staging/
│   │   └── production/
│   └── kustomization.yaml
├── supabase/
│   ├── migrations/                 # Numbered SQL migrations
│   │   ├── 00001_create_tenants.sql
│   │   ├── 00002_create_users.sql
│   │   ├── 00003_create_cameras.sql
│   │   ├── 00004_create_camera_zones.sql
│   │   ├── 00005_create_recordings.sql
│   │   ├── 00006_create_snapshots.sql
│   │   ├── 00007_create_events.sql
│   │   ├── 00008_create_alert_rules.sql
│   │   ├── 00009_create_notifications.sql
│   │   ├── 00010_create_extensions.sql
│   │   ├── 00011_create_tenant_extensions.sql
│   │   ├── 00012_create_extension_hooks.sql
│   │   ├── 00013_create_audit_logs.sql
│   │   ├── 00014_enable_rls.sql
│   │   └── 00015_create_indexes.sql
│   ├── seed/
│   │   ├── dev.sql                 # Dev seed data (test tenant, cameras)
│   │   └── test.sql                # Test seed data (minimal)
│   └── config.toml                 # Supabase local config
└── scripts/
    ├── setup-dev.sh                # One-command dev environment setup
    ├── run-migrations.sh
    └── seed-db.sh
```

---

## 3. Error Handling Standard

### 3.1 Universal Error Response Format

Every API error response follows this exact shape:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "CAMERA_CONNECTION_FAILED",
    "message": "Unable to connect to camera",
    "details": "RTSP handshake timeout after 10s at rtsp://192.168.1.100:554/stream1",
    "requestId": "req_01HZ8XJQK4MVBN3S2RTYP6WDFC",
    "timestamp": "2026-03-16T10:00:00.000Z"
  },
  "meta": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | boolean | Yes | Always `false` for errors |
| `data` | null | Yes | Always `null` for errors |
| `error.code` | string | Yes | Machine-readable error code (SCREAMING_SNAKE) |
| `error.message` | string | Yes | Human-readable description (safe to show to end user) |
| `error.details` | string or object or null | No | Technical details (may contain diagnostics, NOT shown to end user) |
| `error.requestId` | string | Yes | Unique request ID for tracing (also in `X-Request-Id` header) |
| `error.timestamp` | string | Yes | ISO 8601 UTC timestamp |
| `meta` | null | Yes | Always `null` for errors |

### 3.2 Error Code Catalog

#### AUTH — Authentication & Authorization

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_TOKEN_MISSING` | 401 | No Authorization header or token provided |
| `AUTH_TOKEN_INVALID` | 401 | JWT signature invalid or malformed |
| `AUTH_TOKEN_EXPIRED` | 401 | JWT access token has expired |
| `AUTH_REFRESH_INVALID` | 401 | Refresh token invalid or revoked |
| `AUTH_CREDENTIALS_INVALID` | 401 | Email/password combination incorrect |
| `AUTH_ACCOUNT_DISABLED` | 403 | User account has been disabled |
| `AUTH_INSUFFICIENT_ROLE` | 403 | User's role does not have permission for this action |
| `AUTH_CAMERA_ACCESS_DENIED` | 403 | User (viewer) does not have access to this camera |
| `AUTH_TENANT_MISMATCH` | 403 | Resource belongs to a different tenant |
| `AUTH_SSO_FAILED` | 400 | SSO provider returned an error |
| `AUTH_EMAIL_TAKEN` | 409 | Email already registered |
| `AUTH_PASSWORD_WEAK` | 422 | Password does not meet complexity requirements |

#### CAMERA — Camera Connection & Management

| Code | HTTP | Description |
|------|------|-------------|
| `CAMERA_NOT_FOUND` | 404 | Camera ID does not exist or not accessible |
| `CAMERA_CONNECTION_FAILED` | 502 | Could not establish connection to camera |
| `CAMERA_AUTH_FAILED` | 502 | Camera rejected credentials (wrong user/pass) |
| `CAMERA_STREAM_TIMEOUT` | 504 | Camera stream did not respond within timeout |
| `CAMERA_CODEC_UNSUPPORTED` | 422 | Camera stream codec is not supported |
| `CAMERA_OFFLINE` | 503 | Camera is currently offline |
| `CAMERA_ALREADY_EXISTS` | 409 | Camera with this connection URI already added |
| `CAMERA_LIMIT_REACHED` | 403 | Tenant has reached camera limit for their plan |
| `CAMERA_DISCOVERY_TIMEOUT` | 504 | ONVIF discovery scan timed out |
| `CAMERA_DISCOVERY_NONE_FOUND` | 404 | No ONVIF cameras found on the network |
| `CAMERA_PTZ_UNSUPPORTED` | 422 | Camera does not support PTZ commands |
| `CAMERA_PTZ_FAILED` | 502 | PTZ command failed at camera |

#### VIDEO — Recording & Playback

| Code | HTTP | Description |
|------|------|-------------|
| `VIDEO_RECORDING_NOT_FOUND` | 404 | Recording ID does not exist |
| `VIDEO_RECORDING_IN_PROGRESS` | 409 | Cannot delete a recording that is still in progress |
| `VIDEO_PLAYBACK_UNAVAILABLE` | 503 | Recording storage is temporarily unavailable |
| `VIDEO_SEGMENT_MISSING` | 404 | Requested HLS segment not found (may have been cleaned up) |
| `VIDEO_TRANSCODE_FAILED` | 500 | FFmpeg transcoding failed |
| `VIDEO_STORAGE_FULL` | 507 | Storage spool is full, cannot record |
| `VIDEO_UPLOAD_FAILED` | 502 | Failed to upload recording to R2 |
| `VIDEO_RETENTION_EXCEEDED` | 403 | Cannot extend retention beyond plan limit |

#### RULE — Alert Rules

| Code | HTTP | Description |
|------|------|-------------|
| `RULE_NOT_FOUND` | 404 | Rule ID does not exist |
| `RULE_INVALID_CONDITION` | 422 | Condition tree is malformed or references invalid fields |
| `RULE_INVALID_ACTION` | 422 | Action configuration is invalid |
| `RULE_INVALID_SCHEDULE` | 422 | Schedule configuration is invalid (bad timezone, overlapping periods) |
| `RULE_LIMIT_REACHED` | 403 | Tenant has reached rule limit for their plan |
| `RULE_CIRCULAR_DEPENDENCY` | 422 | Rule actions would trigger itself (infinite loop detected) |

#### EXT — Extensions

| Code | HTTP | Description |
|------|------|-------------|
| `EXT_NOT_FOUND` | 404 | Extension not found in marketplace |
| `EXT_NOT_INSTALLED` | 404 | Extension not installed for this tenant |
| `EXT_ALREADY_INSTALLED` | 409 | Extension already installed for this tenant |
| `EXT_INSTALL_FAILED` | 500 | Extension installation failed (Wasm compile error, etc.) |
| `EXT_PERMISSION_DENIED` | 403 | Extension does not have the required permission |
| `EXT_RATE_LIMITED` | 429 | Extension exceeded API call rate limit |
| `EXT_EXECUTION_TIMEOUT` | 504 | Extension handler exceeded execution timeout |
| `EXT_EXECUTION_ERROR` | 500 | Extension handler threw an error |
| `EXT_MEMORY_EXCEEDED` | 500 | Extension exceeded memory limit |
| `EXT_CONFIG_INVALID` | 422 | Extension configuration does not match schema |
| `EXT_VERSION_INCOMPATIBLE` | 422 | Extension requires a newer SDK version |
| `EXT_LIMIT_REACHED` | 403 | Tenant has reached extension limit for their plan |

#### TENANT — Tenant & Billing

| Code | HTTP | Description |
|------|------|-------------|
| `TENANT_NOT_FOUND` | 404 | Tenant does not exist |
| `TENANT_SLUG_TAKEN` | 409 | Tenant slug already in use |
| `TENANT_PLAN_LIMIT` | 403 | Feature not available on current plan |
| `TENANT_USER_LIMIT_REACHED` | 403 | Cannot invite more users on current plan |
| `TENANT_DOMAIN_INVALID` | 422 | Custom domain CNAME not configured correctly |

#### GENERAL — Cross-Cutting

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 422 | Request body failed schema validation (details contains field errors) |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests — try again later |
| `NOT_FOUND` | 404 | Generic resource not found |
| `INTERNAL_ERROR` | 500 | Unexpected server error (logged, alert triggered) |
| `SERVICE_UNAVAILABLE` | 503 | Dependent service is down |
| `REQUEST_TOO_LARGE` | 413 | Request body exceeds size limit |

### 3.3 Go Error Handling

```
Rules for Go services:
1. Always wrap errors with context:
   return fmt.Errorf("connecting to camera %s: %w", cameraID, err)

2. Define sentinel errors for known conditions:
   var ErrCameraOffline = errors.New("camera is offline")

3. Use typed errors for errors that carry data:
   type CameraError struct { CameraID string; Reason string; Err error }

4. Never panic in library/service code. Panics are reserved for truly
   unrecoverable state (programmer error, not runtime error).

5. Log errors at the boundary (gRPC handler), not deep in business logic.
   Business logic returns errors; handlers log them.
```

### 3.4 TypeScript Error Handling

```
Rules for TypeScript services:
1. API routes: catch all errors in global error handler middleware.
   Never let unhandled exceptions reach the client as stack traces.

2. Use typed ApiError class:
   throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404)

3. Validation: use Zod .parse() — throws ZodError on failure.
   Error handler converts ZodError → VALIDATION_ERROR with field details.

4. External service calls: always try/catch, wrap in service-specific error.

5. Client-side: API client throws typed errors.
   Components show error.message to user, log error.details for debugging.
```

---

## 4. Logging & Observability

### 4.1 Structured Log Format

Every log line is a JSON object with these fields:

```json
{
  "timestamp": "2026-03-16T22:15:03.421Z",
  "level": "info",
  "service": "camera-ingest",
  "requestId": "req_01HZ8XJQK4MVBN3S2RTYP6WDFC",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spanId": "00f067aa0ba902b7",
  "tenantId": "tenant_xyz",
  "userId": "user_123",
  "message": "Camera connected successfully",
  "data": {
    "cameraId": "cam_456",
    "protocol": "rtsp",
    "connectTimeMs": 142,
    "codec": "h264",
    "resolution": "1920x1080"
  }
}
```

| Field | Required | Source |
|-------|----------|--------|
| `timestamp` | Yes | ISO 8601 UTC, millisecond precision |
| `level` | Yes | `debug`, `info`, `warn`, `error` |
| `service` | Yes | Service name (from config) |
| `requestId` | When available | From `X-Request-Id` header or generated |
| `traceId` | When available | OpenTelemetry trace ID |
| `spanId` | When available | OpenTelemetry span ID |
| `tenantId` | When available | From auth context |
| `userId` | When available | From auth context |
| `message` | Yes | Human-readable description |
| `data` | No | Structured context (varies per log) |
| `error` | On error | Error message, stack trace (Go: error chain) |

### 4.2 Log Levels

#### DEBUG — Development troubleshooting (disabled in production)

```
When: Detailed internal state, variable values, decision branches
Examples:
  "Evaluating rule conditions" { ruleId, conditionTree, eventData }
  "Redis cache miss for camera status" { cameraId, key }
  "FFmpeg process spawned" { pid, args, cameraId }

NEVER log at DEBUG: Secrets, tokens, full request bodies, raw SQL
```

#### INFO — Significant business events (always on)

```
When: State changes, successful operations, lifecycle events
Examples:
  "Camera connected successfully" { cameraId, protocol, connectTimeMs }
  "Recording started" { cameraId, trigger, recordingId }
  "User logged in" { userId, authProvider }
  "Extension installed" { tenantId, extensionId, version }
  "Rule triggered" { ruleId, eventId, actionsCount }

Rule: If someone on-call would want to see it in a dashboard, it's INFO
```

#### WARN — Degraded but functional (monitored, pager-silent)

```
When: Recoverable errors, fallbacks activated, approaching limits
Examples:
  "Camera reconnecting" { cameraId, attempt: 3, backoffMs: 8000 }
  "WebRTC fallback to HLS" { cameraId, userId, reason: "ICE failure" }
  "R2 upload retry" { recordingId, attempt: 2, error: "timeout" }
  "Rate limit approaching" { tenantId, endpoint, usedPercent: 85 }
  "Recording storage spool at 60%" { usedGB: 6, maxGB: 10 }

Rule: If it resolves itself, WARN. If not, it escalates to ERROR.
```

#### ERROR — Failures requiring attention (monitored, may page)

```
When: Unrecoverable errors, data loss risk, service degradation
Examples:
  "Camera connection failed after max retries" { cameraId, error, attempts: 5 }
  "FFmpeg crashed unexpectedly" { cameraId, exitCode, stderr }
  "R2 upload failed — spooling to disk" { recordingId, error }
  "Extension execution error" { extensionId, hook, error, stack }
  "RLS bypass detected in query" { query, tenantId }

Rule: An engineer should look at this within the next work day.
```

### 4.3 Sensitive Data Redaction

**NEVER log these values** — redact before logging:

| Data | Redaction |
|------|-----------|
| Passwords | Never present in log context |
| JWT tokens | Log last 8 chars only: `"token": "...P6WDFC"` |
| API keys | Log prefix only: `"apiKey": "osp_ext_prod_..."` |
| Camera stream URIs | Mask credentials: `rtsp://***:***@192.168.1.100:554/stream` |
| Extension secret config | Replace with `"***REDACTED***"` |
| Email addresses (in data fields) | Log domain only for DEBUG: `"email": "***@example.com"` |
| User IP addresses | Log for auth events only (audit requirement). Mask in all other contexts |

**Implementation**: Redaction middleware in the logger. All services use the shared logger that automatically scans for known patterns (URLs with credentials, JWT-shaped strings, API key prefixes).

### 4.4 OpenTelemetry Tracing

Every cross-service request carries a trace context:

```
Trace: Client → API Gateway → Camera Ingest Service → go2rtc
       ├─ Span: HTTP GET /api/v1/cameras/:id/stream (Gateway)
       │  ├─ Span: JWT validation
       │  ├─ Span: Redis rate limit check
       │  └─ Span: gRPC CameraIngest.GetStreamURL
       │     ├─ Span: PostgreSQL query (camera lookup)
       │     ├─ Span: go2rtc API call (create stream)
       │     └─ Span: Redis set (stream token)
       └─ Total duration: 142ms
```

Spans include:
- `service.name`, `service.version`
- `http.method`, `http.route`, `http.status_code`
- `rpc.method`, `rpc.service`
- `db.system`, `db.statement` (parameterized, no values)
- `osp.tenant_id`, `osp.camera_id` (custom attributes)

### 4.5 Key Metrics Per Service

#### API Gateway

| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|-----------------|
| `gateway_http_requests_total` | Counter | method, route, status | Error rate >5% for 5min |
| `gateway_http_request_duration_ms` | Histogram | method, route | p95 >500ms for 5min |
| `gateway_ws_connections_active` | Gauge | tenant_id | >80% of plan limit |
| `gateway_rate_limit_hits_total` | Counter | tenant_id, endpoint | >100/min (potential abuse) |

#### Camera Ingest

| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|-----------------|
| `ingest_cameras_active` | Gauge | tenant_id, status | Offline >10% of total for 5min |
| `ingest_camera_connect_duration_ms` | Histogram | protocol | p95 >5s |
| `ingest_camera_reconnects_total` | Counter | camera_id | >10/hour per camera |
| `ingest_discovery_duration_ms` | Histogram | — | p95 >15s |
| `ingest_streams_active` | Gauge | — | >90% of instance capacity |

#### Video Pipeline

| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|-----------------|
| `video_recordings_active` | Gauge | trigger | — |
| `video_ffmpeg_processes` | Gauge | — | >80% of max workers |
| `video_transcode_duration_ms` | Histogram | codec | p95 >2s per segment |
| `video_upload_duration_ms` | Histogram | — | p95 >5s per segment |
| `video_upload_failures_total` | Counter | — | >0 sustained for 5min |
| `video_spool_usage_bytes` | Gauge | — | >80% of spool capacity |
| `video_storage_bytes` | Gauge | tenant_id | — (billing/monitoring) |

#### Event Engine

| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|-----------------|
| `events_processed_total` | Counter | type, severity | — |
| `events_processing_duration_ms` | Histogram | — | p95 >200ms |
| `rules_evaluated_total` | Counter | matched (true/false) | — |
| `rules_evaluation_duration_ms` | Histogram | — | p95 >50ms |
| `notifications_sent_total` | Counter | channel, status | Failure rate >5% for 5min |
| `notifications_delivery_duration_ms` | Histogram | channel | Push p95 >3s |
| `motion_detection_fps` | Gauge | camera_id | Drops below 0.5fps |

#### Extension Runtime

| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|-----------------|
| `ext_hook_invocations_total` | Counter | hook_name, extension_id | — |
| `ext_hook_duration_ms` | Histogram | hook_name, extension_id | p95 >2s |
| `ext_hook_errors_total` | Counter | hook_name, extension_id | >10% error rate |
| `ext_memory_usage_bytes` | Gauge | extension_id | >90% of limit |
| `ext_api_calls_total` | Counter | extension_id, api_method | Near rate limit |

### 4.6 Dashboards

| Dashboard | Metrics Shown | Audience |
|-----------|--------------|----------|
| **System Overview** | Request rate, error rate, latency p50/p95/p99, active cameras, active streams | On-call engineer |
| **Video Pipeline** | FFmpeg workers, transcode queue, upload rate, spool usage, storage growth | Platform team |
| **Tenant Health** | Per-tenant: cameras online, events/hour, storage used, API usage vs limits | Customer success |
| **Extension Performance** | Per-extension: invocations, latency, error rate, resource usage | Extension developer portal |

---

## 5. Testing Strategy

### 5.1 Test Type Matrix

| Type | Tool (TS) | Tool (Go) | Coverage | What to Test | CI Stage |
|------|-----------|-----------|----------|-------------|----------|
| **Unit** | Vitest | `go test` | 80% | Pure functions, utils, hooks, state logic, service methods, rule engine | Every push |
| **Integration** | Vitest + Supertest | `go test` + testcontainers | 70% | API endpoints with real DB, gRPC service with real Redis, DB queries with RLS | Every push |
| **E2E** | Playwright | — | Critical paths | Login → add camera → view live → receive alert → create rule | PR merge to main |
| **Load** | k6 | vegeta | Benchmarks | 100/1000/10000 concurrent streams, API throughput under load | Weekly / pre-release |
| **Contract** | — | — | All gRPC services | Protobuf schema compatibility between gateway and Go services | Every push |

### 5.2 Unit Tests

#### TypeScript (Vitest)

```
File naming:     {name}.test.ts / {Name}.test.tsx (co-located with source)
Location:        Same directory as source file
Mock strategy:   vi.mock() for external deps, manual mocks for API client
Coverage:        vitest --coverage (v8 provider). Minimum 80% lines.

What to unit test:
  - Zod validation schemas (valid + invalid inputs)
  - Utility functions (date formatting, permission checks)
  - Zustand stores (state transitions)
  - React hooks (with @testing-library/react renderHook)
  - API client methods (mock fetch, verify request shape)
  - Rule condition evaluator (pure logic)

What NOT to unit test:
  - React component rendering (test behavior via integration/E2E)
  - External API calls (test via integration)
  - Database queries (test via integration)
```

#### Go (`go test`)

```
File naming:     {name}_test.go (co-located with source)
Location:        Same package as source
Mock strategy:   Interface-based mocking (no mocking library required).
                 Define interfaces, provide test implementations.
Coverage:        go test -coverprofile=coverage.out. Minimum 80%.

What to unit test:
  - Service methods with mocked repositories
  - Rule condition evaluator (table-driven tests)
  - Motion detection algorithm (fixed frame data)
  - Zone polygon intersection
  - Error wrapping and sentinel errors
  - gRPC request/response serialization

What NOT to unit test:
  - Database queries (test via integration)
  - FFmpeg command execution (test via integration with testcontainers)
  - go2rtc API calls (test via integration)
```

### 5.3 Integration Tests

#### TypeScript (Vitest + Supertest)

```
File naming:     {name}.integration.test.ts
Location:        services/gateway/test/integration/
Mock strategy:   Real Supabase (local via supabase start), real Redis (testcontainers).
                 Mock only external services (push notifications, email).
Setup:           beforeAll: run migrations, seed test data. afterAll: cleanup.

What to integration test:
  - Every API endpoint: valid request → correct response
  - Every API endpoint: invalid request → correct error response
  - Auth flow: register → login → access protected route → token refresh
  - RLS: Tenant A cannot access Tenant B's cameras
  - Rate limiting: exceed limit → 429 response
  - WebSocket: subscribe → receive event → unsubscribe
```

#### Go (testcontainers)

```
File naming:     {name}_integration_test.go
Location:        Same package, build tag //go:build integration
Mock strategy:   Real PostgreSQL + Redis via testcontainers.
                 Mock go2rtc and FFmpeg with in-process HTTP servers.

What to integration test:
  - Repository methods with real PostgreSQL
  - Event flow: publish event → rule engine evaluates → actions dispatched
  - Camera health monitor: simulate offline → verify event emitted
  - Storage upload: write to local MinIO container
  - Extension sandbox: load test Wasm module → execute hook → verify result
```

### 5.4 E2E Tests (Playwright)

```
File naming:     {flow-name}.spec.ts
Location:        apps/web/e2e/
Environment:     Full stack via docker-compose.test.yml (all services running)

Critical paths to E2E test:

1. auth-flow.spec.ts
   - Register new account → land on dashboard → logout → login → see dashboard

2. camera-management.spec.ts
   - Add camera (mock RTSP) → see in grid → view live (mock stream) → edit → delete

3. events-and-alerts.spec.ts
   - Trigger motion (mock) → event appears in feed → acknowledge event

4. recording-playback.spec.ts
   - Trigger recording (mock) → navigate to recordings → play clip → timeline scrub

5. rule-builder.spec.ts
   - Create rule (motion + time condition → push notification) → trigger → verify

6. user-management.spec.ts
   - Invite user → login as invited user → verify role restrictions

7. extension-lifecycle.spec.ts
   - Browse marketplace → install extension → configure → verify hook fires → uninstall
```

### 5.5 Load Tests (k6)

```
File naming:     {scenario-name}.k6.js
Location:        tests/load/

Scenarios:
  1. api-throughput.k6.js
     - 100/500/1000 concurrent users hitting GET /cameras, GET /events
     - Target: p95 <200ms at 500 concurrent

  2. websocket-connections.k6.js
     - 100/500/2000 concurrent WebSocket connections
     - Target: all connections stable, events delivered <1s

  3. concurrent-streams.k6.js
     - 10/100/1000 simultaneous WebRTC viewers (via WHEP)
     - Target: 100 viewers on single go2rtc instance with <500ms latency

  4. recording-pipeline.k6.js
     - 10/50/200 simultaneous recordings starting/stopping
     - Target: recording starts <500ms after trigger

CI integration: Run weekly via scheduled GitHub Action. Results stored in Grafana.
Regression alert: p95 increases >20% from baseline.
```

### 5.6 CI Integration

```
GitHub Actions pipeline:

Push to any branch:
  ├── lint          (eslint + golangci-lint)         [parallel]
  ├── type-check    (tsc --noEmit)                   [parallel]
  ├── unit-tests    (vitest + go test)               [parallel]
  ├── integration   (vitest+supertest, go+testcontainers) [parallel, needs DB]
  └── contract      (protobuf compat check)          [parallel]

PR merge to main:
  ├── All above +
  ├── e2e-tests     (Playwright, full docker-compose)
  ├── security-scan (trivy, gosec)
  └── build         (Docker images for all services)

Weekly (scheduled):
  ├── load-tests    (k6 against staging)
  └── dependency-audit (npm audit + govulncheck)
```

---

## 6. Git Workflow

### 6.1 Branch Naming

```
Pattern: {type}/{ticket-id}-{short-description}

Types:
  feat/    - New feature
  fix/     - Bug fix
  refactor/- Code restructuring (no behavior change)
  perf/    - Performance improvement
  test/    - Adding/fixing tests
  docs/    - Documentation only
  chore/   - Build, CI, deps, tooling
  hotfix/  - Emergency production fix

Examples:
  feat/OSP-123-add-camera-zones
  fix/OSP-456-stream-reconnect-loop
  refactor/OSP-789-extract-rule-evaluator
  chore/OSP-101-upgrade-go-1.23
  hotfix/OSP-999-rls-bypass-cameras
```

### 6.2 Commit Message Format

```
Pattern: type(scope): description

type:  feat, fix, refactor, perf, test, docs, chore
scope: camera, video, events, rules, extensions, gateway, auth, infra, ui, mobile
description: imperative mood, lowercase, no period, <72 chars

Examples:
  feat(camera): add ONVIF auto-discovery on LAN
  fix(video): handle FFmpeg crash during recording
  refactor(events): extract rule condition evaluator
  test(gateway): add integration tests for camera CRUD
  perf(ingest): reduce memory per camera connection from 20MB to 5MB
  docs(api): update recording endpoint response types
  chore(infra): add ClickHouse to docker-compose

Multi-line body (when needed):
  fix(events): prevent duplicate motion events within 2s window

  Motion detector was emitting events on every frame that exceeded
  the threshold. Added a 2-second dedup window per camera+zone in
  Redis to prevent notification storms.

  Closes OSP-456
```

### 6.3 PR Template

Every PR uses this template (`.github/pull_request_template.md`):

```markdown
## Summary

<!-- 1-3 sentences describing what this PR does and why -->

## Changes

<!-- Bulleted list of significant changes -->
-
-
-

## Type

<!-- Check one -->
- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Performance
- [ ] Test
- [ ] Documentation
- [ ] Infrastructure / CI

## Affected Services

<!-- Check all that apply -->
- [ ] `apps/web`
- [ ] `apps/mobile`
- [ ] `packages/shared`
- [ ] `packages/ui`
- [ ] `packages/sdk`
- [ ] `services/gateway`
- [ ] `services/camera-ingest`
- [ ] `services/video-pipeline`
- [ ] `services/event-engine`
- [ ] `services/extension-runtime`
- [ ] `infra/`

## Test Plan

<!-- How was this tested? What should reviewers verify? -->
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated (if UI change)
- [ ] Manual testing steps:
  1.
  2.

## Checklist

<!-- All must be checked before merge -->
- [ ] Follows [naming conventions](./docs/CONSISTENCY-STANDARDS.md#1-naming-conventions)
- [ ] Error handling uses [standard error format](./docs/CONSISTENCY-STANDARDS.md#3-error-handling-standard)
- [ ] New endpoints have Zod request validation
- [ ] New DB tables have RLS policies
- [ ] New features have unit + integration tests
- [ ] No hardcoded secrets or connection strings
- [ ] Logging follows [structured format](./docs/CONSISTENCY-STANDARDS.md#4-logging--observability)
- [ ] API changes are backward-compatible (or version bumped)
- [ ] Extension hooks maintain backward compatibility

## Screenshots / Recordings

<!-- For UI changes, include before/after screenshots or a screen recording -->

## Related Issues

<!-- Link to Jira/GitHub issues -->
Closes OSP-XXX
```

### 6.4 Branch Protection Rules

| Rule | `main` branch | Feature branches |
|------|--------------|-----------------|
| Required status checks | lint, type-check, unit-tests, integration, contract, e2e, build | lint, type-check, unit-tests |
| Required reviewers | 2 (1 must be from affected service team) | — |
| Dismiss stale reviews | Yes | — |
| Require linear history | Yes (squash merge only) | — |
| Allow force push | No | Yes (for rebasing) |
| Auto-delete branch after merge | Yes | — |

### 6.5 Review Requirements

| Area Changed | Required Reviewers | Rationale |
|-------------|-------------------|-----------|
| `apps/web/`, `apps/mobile/` | 1 approval | Frontend changes, lower blast radius |
| `packages/shared/` | 2 approvals | Changes affect all consumers |
| `packages/sdk/` | 2 approvals | Public API for extension developers |
| `services/gateway/` | 1 approval | API layer |
| `services/camera-ingest/` | 2 approvals | Critical path, video pipeline |
| `services/video-pipeline/` | 2 approvals | Critical path, data loss risk |
| `services/event-engine/` | 2 approvals | Critical path, notification integrity |
| `services/extension-runtime/` | 2 approvals | Security sandbox |
| `infra/supabase/migrations/` | 2 approvals | Database schema changes |
| `infra/k8s/` | 2 approvals | Production infrastructure |
| `.github/workflows/` | 2 approvals | CI/CD pipeline |

---

## 7. Code Review Checklist

Every reviewer must verify ALL items before approving. Items marked **(blocking)** must pass — PR cannot merge if any blocking item fails.

### 7.1 Standards Compliance

- [ ] **(blocking)** Follows naming conventions (Section 1) — files, functions, DB columns, API routes
- [ ] **(blocking)** Error handling uses standard error format (Section 3) — correct codes, correct HTTP status
- [ ] **(blocking)** Logging follows structured format (Section 4) — correct levels, no sensitive data in logs

### 7.2 Security

- [ ] **(blocking)** No hardcoded secrets, tokens, API keys, or connection strings
- [ ] **(blocking)** New database tables have RLS policies with `tenant_id` isolation
- [ ] **(blocking)** New API endpoints validate input (Zod schema for TS, validate middleware for Go)
- [ ] **(blocking)** New endpoints have appropriate auth role check
- [ ] Camera stream URIs with credentials are encrypted before storage
- [ ] Extension sandbox boundaries are maintained (no raw DB/filesystem access)
- [ ] Signed URLs have appropriate TTL (not overly long)

### 7.3 Testing

- [ ] **(blocking)** New business logic has unit tests
- [ ] **(blocking)** New API endpoints have integration tests (happy path + error cases)
- [ ] RLS policies have cross-tenant access tests (Tenant A cannot read Tenant B)
- [ ] Edge cases are tested (empty input, max limits, concurrent access)
- [ ] Test names describe the scenario, not the implementation

### 7.4 API Design

- [ ] **(blocking)** API changes are backward-compatible OR version is bumped
- [ ] New endpoints follow RESTful conventions (correct HTTP methods, plural nouns)
- [ ] Response shapes match TypeScript types in `packages/shared`
- [ ] Pagination is supported for list endpoints
- [ ] Rate limits are configured for new endpoints

### 7.5 Data Model

- [ ] **(blocking)** New columns have NOT NULL where appropriate
- [ ] **(blocking)** Foreign keys have appropriate ON DELETE behavior (CASCADE, SET NULL, RESTRICT)
- [ ] Indexes exist for columns used in WHERE/ORDER BY clauses
- [ ] New tables include `tenant_id`, `created_at`, `updated_at` where applicable
- [ ] Migrations are reversible (include DOWN migration)

### 7.6 Extension Compatibility

- [ ] **(blocking)** Hook event payload shapes are not changed in breaking ways (fields can be added, never removed or renamed)
- [ ] **(blocking)** Extension SDK types in `packages/sdk` are updated if hook payloads change
- [ ] New hooks are documented with payload shape and trigger conditions
- [ ] Extension resource limits are enforced for new host functions

### 7.7 Performance

- [ ] No N+1 query patterns (use JOINs or batch queries)
- [ ] Large result sets are paginated
- [ ] Expensive operations are cached with appropriate TTL
- [ ] Hot paths avoid unnecessary allocations (especially in Go event processing)
- [ ] Database queries use indexes (check EXPLAIN for new queries)

### 7.8 Code Quality

- [ ] Functions are <50 lines, files are <800 lines
- [ ] No deep nesting (>4 levels) — extract early returns or helper functions
- [ ] Immutable patterns used (new objects, not mutation) unless Go-idiomatic
- [ ] No commented-out code or TODO without a ticket reference
- [ ] Error messages are user-friendly (for UI-facing) and developer-helpful (for logs)

### 7.9 Observability

- [ ] New features emit appropriate metrics
- [ ] New error conditions are logged at correct level
- [ ] Cross-service calls propagate trace context
- [ ] New background workers have health check endpoints
