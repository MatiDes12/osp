# Open Surveillance Platform (OSP)

## Project Overview

Multi-platform surveillance camera application with an extensible plugin architecture.
Connects to any camera type (Ring, Arlo, Wyze, Hikvision, Dahua, ONVIF, RTSP, USB/IP).
Core differentiator: extension layer for custom rules, AI models, and white-label theming.

## Tech Stack

### Frontend
- **Web**: Next.js 15 (App Router) + Tailwind CSS + shadcn/ui
- **Mobile**: React Native + Expo (iOS + Android)
- **Desktop**: Tauri v2 (Phase 2)
- **State**: Zustand (client) + TanStack Query (server)
- **Real-time**: WebSocket (alerts) + WebRTC (live camera feeds)

### Backend
- **API Gateway**: Hono on Bun (TypeScript)
- **Core Services**: Go (camera ingest, video pipeline, event engine, extension runtime)
- **Video**: go2rtc + FFmpeg (RTSP/ONVIF/WebRTC proxy, transcoding, HLS)

### Database & Storage
- **Primary DB**: Supabase (PostgreSQL + Auth + Realtime + RLS)
- **Cache**: Redis (Upstash)
- **Object Storage**: Cloudflare R2 (video clips, snapshots)
- **Analytics**: ClickHouse (Phase 2)

### Infrastructure
- **Monorepo**: pnpm workspaces + Turborepo
- **Container**: Docker Compose (dev), Kubernetes (prod)
- **CI/CD**: GitHub Actions
- **CDN**: Cloudflare

## Monorepo Structure

```
osp/
├── apps/
│   ├── web/              # Next.js 15 dashboard
│   ├── mobile/           # React Native + Expo
│   └── desktop/          # Tauri v2 (Phase 2)
├── packages/
│   ├── shared/           # Shared TS types, utils, API client
│   ├── ui/               # Shared UI components (shadcn/ui based)
│   └── sdk/              # Extension SDK
├── services/
│   ├── gateway/          # Hono/Bun API gateway
│   ├── camera-ingest/    # Go — camera connection management
│   ├── video-pipeline/   # Go — transcoding, recording, storage
│   ├── event-engine/     # Go — rule evaluation, notifications
│   └── extension-runtime/# Go — sandboxed extension execution
├── infra/
│   ├── docker/
│   ├── k8s/
│   └── supabase/         # Migrations, RLS policies, seed data
└── docs/
```

## Naming Conventions

### Database
- Tables: `snake_case`, plural (`users`, `camera_zones`, `alert_rules`)
- Columns: `snake_case` (`created_at`, `tenant_id`)
- Indexes: `idx_{table}_{columns}`
- Foreign keys: `fk_{table}_{ref_table}`

### API
- Routes: kebab-case, plural (`/api/v1/alert-rules/:id`)
- Query params: camelCase (`?startDate=&cameraId=`)
- Request/Response: camelCase JSON
- Headers: `X-Tenant-Id`, `X-Request-Id`

### TypeScript Code
- Files: kebab-case (`camera-service.ts`, `use-live-feed.ts`)
- Components: PascalCase (`CameraGrid.tsx`)
- Functions/variables: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Types/Interfaces: PascalCase, no I-prefix

### Go Code
- Files: snake_case (`camera_ingestion.go`)
- Packages: lowercase, single word (`ingest`, `transcode`, `events`)
- Exported: PascalCase / Unexported: camelCase

## Error Format

All API errors use this envelope:
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

Error code prefixes: `AUTH_*`, `CAMERA_*`, `VIDEO_*`, `RULE_*`, `EXT_*`, `TENANT_*`

## Multi-Tenancy

- All data is tenant-scoped via Supabase RLS
- Every table with tenant data has a `tenant_id` column
- Storage paths: `{tenant_id}/{camera_id}/{timestamp}.mp4`
- API requests require `X-Tenant-Id` header (validated against JWT)

## Key Architecture Decisions

1. **Go for video services** — High concurrency for stream handling, low memory per connection
2. **Hono/Bun for API gateway** — Fast DX, shared TypeScript types with frontend
3. **Supabase over self-hosted Postgres** — Built-in auth, realtime, RLS, faster MVP
4. **go2rtc for camera proxy** — Universal protocol support (RTSP, ONVIF, WebRTC)
5. **Cloudflare R2 over S3** — Zero egress fees for video serving
6. **Extension SDK in TypeScript** — Largest developer ecosystem, shared with frontend

## Development Commands

```bash
pnpm dev           # Start all services (Turborepo)
pnpm build         # Build all packages
pnpm lint          # Lint all packages
pnpm type-check    # Type check all packages
pnpm test          # Run all tests
pnpm format        # Format with Prettier
```

## Testing Requirements

- Unit tests: Vitest (TS), go test (Go) — 80% coverage minimum
- Integration tests: Vitest + Supertest (API), real Supabase (DB)
- E2E tests: Playwright — login, add camera, live view, create rule
- Load tests: k6 — 100/1000/10000 concurrent streams

## Security Checklist (before every PR)

- [ ] No hardcoded secrets
- [ ] RLS policies on new tables
- [ ] Input validation on new endpoints
- [ ] Signed URLs for video streams
- [ ] Rate limiting on public endpoints
- [ ] Audit logging for sensitive operations

## Planning Reference

See `PLANNING.md` for the full PRD, architecture, technical design, and standards.
See `docs/` for additional architecture diagrams and API specs.
