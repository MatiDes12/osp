# OSP — Master Handoff Document

**Project**: Open Surveillance Platform (OSP)
**Repo**: https://github.com/MatiDes12/osp
**Stack**: Next.js 15 · Hono/Bun · Go microservices · Supabase · Redis · go2rtc · React Native/Expo
**Current stats**: 250+ source files · 60+ commits · Phase 1 + Phase 2 complete · Phase 3 ready

---

## How to use this document

This is the master handoff checklist for any agent or developer continuing OSP.
Each item has enough context to start immediately.

**Status**: ✅ Done · 🚧 Partial · ❌ Not started

---

## Quick context for a new agent

Before starting, read these files in order:

1. `CLAUDE.md` — project overview and tech stack
2. `docs/PRD.md` — product requirements
3. `docs/SYSTEM-ARCHITECTURE.md` — system architecture
4. `docs/TECHNICAL-DESIGN.md` — data models, API design
5. `docs/CONSISTENCY-STANDARDS.md` — naming, error handling, testing standards
6. `docs/PRODUCTION-CHECKLIST.md` — pre-launch checklist

**Running locally**:

```bash
pnpm install
pnpm --filter @osp/shared build
docker compose -f infra/docker/docker-compose.yml up -d redis go2rtc
# Terminal 1:
cd services/gateway && pnpm dev          # API on :3000, WS on :3002
# Terminal 2:
cd apps/web && pnpm dev                  # Web on :3001
```

---

## ✅ COMPLETED — Phase 1 + Phase 2

### Core Platform

- ✅ Auth: register, login, logout, JWT guards, role-based access (owner/admin/operator/viewer)
- ✅ Multi-tenant with Supabase RLS (row-level security on all tables, verified)
- ✅ Camera CRUD + go2rtc integration + status monitoring
- ✅ Live WebRTC video (WHEP proxy) + MP4 fallback
- ✅ Motion-triggered recording (saves real MP4 to disk)
- ✅ Continuous recording with 30-min auto-segmentation
- ✅ Event creation + rule evaluation + action dispatch
- ✅ Browser push notifications + WebSocket real-time
- ✅ USB + wired camera detection via go2rtc device probing
- ✅ Real "Test Connection" with live snapshot preview

### Web Dashboard (Next.js 15)

- ✅ 16 pages fully designed with design system
- ✅ Live camera grid with MJPEG thumbnails (10s refresh)
- ✅ WebRTC live view with HLS/MP4 fallback
- ✅ Zone drawing on camera (canvas polygon editor)
- ✅ PTZ controls (wired to API and real ONVIF SOAP)
- ✅ Two-way audio (mic toggle + volume, ONVIF backchannel)
- ✅ Recording: start/stop + REC badge + duration timer
- ✅ Events: filters, acknowledge, bulk-acknowledge, real-time feed
- ✅ Rules: visual pipeline editor (Trigger→Conditions→Actions)
- ✅ Settings: tenant/users/cameras/notifications/extensions
- ✅ Extensions marketplace with 8 demo extensions
- ✅ Camera discovery with network scan + USB detection
- ✅ Multi-location management + floor plan editor
- ✅ Camera tags + bulk actions
- ✅ Dark/light theme toggle
- ✅ Keyboard shortcuts (Cmd+K, ?, 1-6)
- ✅ Onboarding wizard for first-time users
- ✅ CSV/JSON export for events and recordings
- ✅ Responsive mobile web (bottom nav, sidebar drawer)
- ✅ Health monitoring dashboard + Prometheus metrics
- ✅ API docs at /docs (Swagger UI)
- ✅ Forgot password + reset password flow
- ✅ Error boundaries + toast notifications
- ✅ Event clip thumbnails endpoint and generation
- ✅ R2 recording storage in gateway direct mode (upload + presigned playback)
- ✅ Landing page with Windows download + mobile coming soon
- ✅ Eye-in-shield favicon (SVG + PNG at all sizes)

### Mobile App (React Native/Expo)

- ✅ Auth flow (login/register) wired to real API
- ✅ Camera grid with live MJPEG thumbnails (5s refresh)
- ✅ Camera detail with live WebRTC view (+ MJPEG fallback)
- ✅ Events list with severity colors
- ✅ Recordings list grouped by date (with offline cache)
- ✅ Settings with real user/tenant data
- ✅ Push notification token registration (Expo)
- ✅ Offline detection banner
- ✅ Recording controls screen (start/stop/timer)
- ✅ Motion zone display with sensitivity toggle

### Backend (Go services)

- ✅ camera-ingest: gRPC server, go2rtc client, ONVIF discovery, health monitor, PTZ — 33s build
- ✅ video-pipeline: FFmpeg recording, R2 storage, spool, snapshots, retention — 51s build
- ✅ event-engine: Redis pub/sub, rule evaluator (condition trees), dispatch, audit — 37s build
- ✅ extension-runtime: gRPC server scaffold — 25s build
- ✅ edge-agent: standalone Go binary, BoltDB offline buffer, cloud sync, motion detection

### Infrastructure

- ✅ Docker Compose (Redis + go2rtc + coturn TURN server)
- ✅ Production Docker Compose with resource limits
- ✅ Supabase: 23 migrations, RLS on all tables (verified), seed data
- ✅ GitHub Actions CI (lint, type-check, tests, build, Playwright E2E)
- ✅ GitHub Actions deploy (Fly.io services + Vercel web, path-filter change detection)
- ✅ GitHub Actions production (release-triggered, DB migration, health checks, Slack notify)
- ✅ Vercel config for web app (standalone Next.js output, build env vars)
- ✅ Fly.io configs for all Go services + gateway
- ✅ K8s manifests (base + staging/production overlays)
- ✅ Production Docker image for web (standalone + placeholder env vars at build time)
- ✅ Tauri desktop app: system tray, auto-start, native notifications, connection screen

### AI & Advanced Features

- ✅ AI detection: OpenAI Vision API, graceful degradation (AI_PROVIDER=none)
- ✅ Motion detection: pixel-diff frame analysis, 1fps sampling, per-zone sensitivity
- ✅ License plate recognition: PlateRecognizer HTTP API, watchlist with alert toggle
- ✅ SSO: Google, Microsoft/Azure AD, GitHub OAuth via Supabase
- ✅ ClickHouse analytics: events/recordings tables, hourly MV, 5 query endpoints, dashboard
- ✅ Rate limiting: Redis sliding window, 429 + Retry-After, fail-open mode
- ✅ TURN server: coturn in Docker Compose, configured via env vars
- ✅ Email: SendGrid HTTP API v3, graceful no-op when key absent
- ✅ Webhook retry: exponential backoff, delivery log UI in rules page
- ✅ Push notifications: Expo Push API, server-side delivery on rule trigger
- ✅ API versioning: v1 prefix, Deprecation/Sunset headers, strategy doc
- ✅ Extension runtime: Node.js vm sandbox, timeout clamping, inline source guard
- ✅ Two-way audio: ONVIF backchannel, Opus negotiation, capability toggle in settings
- ✅ Camera wall: /wall fullscreen page, 8 layouts, auto-rotate, keyboard shortcuts
- ✅ Timeline scrubber: seek to recording by click, calculates offset, auth token appended
- ✅ Sentry: full error monitoring on web + gateway (source maps, tunnel route, replay)
- ✅ Security hardening: Zod password policy, path traversal guard, security headers (CSP, HSTS, X-Frame-Options), rate-limited auth endpoints
- ✅ JWT auth hardening: base64url decode, proactive token refresh, WS reconnect with refresh

---

## 🚧 PARTIALLY DONE

### TODO-3: Production deployment — configure secrets and run end-to-end

**Status**: CI/CD pipelines are correct and passing. Secrets need to be added to GitHub.

**What's done**:

- Vercel deploy workflow fixed (removed `--cwd` double-path, uses `VERCEL_PROJECT_ID` + `VERCEL_ORG_ID`)
- Fly.io deploy workflow correct (uses `FLY_API_TOKEN`)
- Production workflow correct (Slack uses `vars.SLACK_ENABLED`, not secrets in `if:` condition)
- Docker web image fixed (`output: standalone` + placeholder env vars)
- GitHub Actions CI all green locally

**What's needed — add to GitHub → Settings → Secrets and variables → Actions**:

| Secret                   | How to get                                                |
| ------------------------ | --------------------------------------------------------- |
| `FLY_API_TOKEN`          | `fly tokens create deploy` or Fly.io dashboard            |
| `VERCEL_TOKEN`           | vercel.com → Account Settings → Tokens                    |
| `VERCEL_ORG_ID`          | `.vercel/project.json` after `vercel link` in `apps/web/` |
| `VERCEL_PROJECT_ID`      | Same as above                                             |
| `SLACK_WEBHOOK_URL`      | Slack app → Incoming Webhooks                             |
| `SUPABASE_ACCESS_TOKEN`  | supabase.com → Account → Access Tokens                    |
| `SUPABASE_DB_PASSWORD`   | Supabase project → Settings → Database                    |
| `PRODUCTION_GATEWAY_URL` | Your Fly.io gateway URL                                   |
| `PRODUCTION_WEB_URL`     | Your Vercel web URL                                       |
| `STAGING_GATEWAY_URL`    | Staging gateway URL                                       |
| `STAGING_WEB_URL`        | Staging web URL                                           |

**Variable** (Settings → Secrets and variables → Variables):

| Variable        | Value  |
| --------------- | ------ |
| `SLACK_ENABLED` | `true` |

**Steps to complete**:

1. Add all secrets above
2. Create Fly.io app: `fly apps create osp-gateway`
3. Set Fly secrets: `fly secrets set SUPABASE_URL=... REDIS_URL=... -a osp-gateway`
4. Push a commit to `main` to trigger the deploy workflow, or run it manually via Actions → Deploy → Run workflow
5. Verify health at `https://osp-gateway.fly.dev/health`

**Files**:

- `.github/workflows/deploy.yml`
- `.github/workflows/production.yml`
- `services/gateway/fly.toml`
- `apps/web/vercel.json`

---

## Known Bugs — All Resolved

| #   | Bug                                       | Fix                                                                         |
| --- | ----------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Recording file paths in Docker            | Named volume `recordings-data` mounted at `/data/recordings`                |
| 2   | WebSocket reconnect loop on expired token | Token refresh attempted before reconnect; stops after 3 auth failures       |
| 3   | JWT expiry race condition                 | `!isRefreshing` guard prevents concurrent refresh calls                     |
| 4   | go2rtc stream persistence on restart      | `syncStreamsOnStartup()` re-registers all cameras before first health check |
| 5   | Camera status stuck on "connecting"       | Same startup sync runs health check immediately on start                    |
| 6   | Event clips growing unbounded             | Hourly cleanup job deletes local clips older than 7 days                    |
| 7   | Mobile app TypeScript `any` types         | `transforms.ts` uses `Record<string, unknown>` with typed helpers           |
| 8   | Zone drawing on mobile                    | Zones fetched and shown with sensitivity/alert toggle                       |

---

## Environment Variables Reference

```env
# Required (must set before running)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres.xxx:password@pooler.supabase.com:6543/postgres

# Infrastructure (defaults work for local dev)
REDIS_URL=redis://localhost:6379
GO2RTC_URL=http://localhost:1984
GO2RTC_API_URL=http://localhost:1984
GATEWAY_PORT=3000
WS_PORT=3002

# Storage (needed for R2 recording upload)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=osp-storage

# AI Detection (optional)
AI_PROVIDER=none          # none | openai
OPENAI_API_KEY=

# License plate recognition (optional)
LPR_PROVIDER=             # platerecognizer
LPR_API_KEY=

# Error monitoring (optional)
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=

# Email (optional, logs to console if not set)
SENDGRID_API_KEY=
EMAIL_FROM=alerts@yourdomain.com

# Encryption (generate: openssl rand -hex 32)
OSP_ENCRYPTION_KEY=

# Recordings
RECORDINGS_DIR=./recordings

# TURN server (optional, enables remote WebRTC)
TURN_SERVER_URL=turn:localhost:3478
TURN_SERVER_USERNAME=
TURN_SERVER_CREDENTIAL=

# Rate limiting
RATE_LIMIT_FAIL_OPEN=true   # false = block on Redis failure

# Extension runtime security
EXTENSION_ALLOW_INLINE_SOURCE=false  # true only in dev

# Production URLs
WEB_URL=http://localhost:3001
GATEWAY_PUBLIC_URL=http://localhost:3000
GATEWAY_CORS_ORIGINS=http://localhost:3001
```

---

## File Structure Quick Reference

```
osp/
├── apps/
│   ├── web/src/
│   │   ├── app/                    ← Next.js App Router
│   │   │   ├── (auth)/             ← login, register, forgot-password, callback
│   │   │   ├── (dashboard)/        ← All dashboard pages
│   │   │   ├── wall/               ← Fullscreen camera wall
│   │   │   ├── icon.svg            ← App favicon (eye-in-shield)
│   │   │   └── page.tsx            ← Landing page
│   │   ├── components/
│   │   │   ├── camera/             ← LiveViewPlayer, CameraCard, ZoneDrawer
│   │   │   ├── events/             ← LiveEventFeed
│   │   │   ├── layout/             ← Sidebar, TopBar, MobileNav
│   │   │   └── ui/                 ← Toast, VirtualList, ShortcutsModal
│   │   ├── hooks/                  ← use-cameras, use-events, use-recordings...
│   │   ├── lib/                    ← api.ts, jwt.ts, transforms.ts, export.ts, tauri.ts
│   │   └── stores/                 ← sidebar.ts, toast.ts, theme.ts
│   ├── mobile/                     ← Expo React Native app
│   └── desktop/                    ← Tauri v2 desktop wrapper
├── packages/
│   ├── shared/src/                 ← Types, Zod schemas, API client
│   ├── ui/                         ← StatusIndicator, cn()
│   └── sdk/                        ← Extension SDK types
├── services/
│   ├── gateway/src/
│   │   ├── routes/                 ← All Hono API routes
│   │   ├── services/               ← stream, recording, ai-detection, analytics, lpr
│   │   ├── lib/                    ← supabase, redis, logger, env, email, r2, clickhouse
│   │   ├── grpc/                   ← gRPC clients for Go services
│   │   └── ws/                     ← WebSocket server
│   ├── camera-ingest/              ← Go: ONVIF, go2rtc, health monitor, PTZ
│   ├── video-pipeline/             ← Go: FFmpeg, R2, recording service
│   ├── event-engine/               ← Go: Redis sub, rule evaluator, dispatch
│   ├── extension-runtime/          ← Go: gRPC server (phase 3: Wasm sandbox)
│   └── edge-agent/                 ← Go: standalone on-prem agent, BoltDB buffer
├── infra/
│   ├── docker/                     ← docker-compose.yml, Dockerfiles, go2rtc.yaml
│   ├── k8s/                        ← Kubernetes manifests (base + overlays)
│   ├── clickhouse/                 ← schema.sql
│   └── supabase/migrations/        ← 23 SQL migrations + RLS policies
├── docs/
│   ├── HANDOFF.md                  ← This file
│   ├── PRD.md
│   ├── SYSTEM-ARCHITECTURE.md
│   ├── TECHNICAL-DESIGN.md
│   ├── CONSISTENCY-STANDARDS.md
│   ├── SETUP-GUIDE.md
│   ├── PRODUCTION-CHECKLIST.md
│   ├── API-VERSIONING.md
│   └── RUNBOOK.md
└── .github/workflows/
    ├── ci.yml                      ← lint, type-check, test, build on PR
    ├── deploy.yml                  ← Fly.io + Vercel on push to main
    ├── e2e.yml                     ← Playwright on push/PR to main
    └── production.yml              ← Release-triggered full production deploy
```

---

## Phase 3 — What's Left

The platform is production-ready. Phase 3 options:

| Feature                     | Effort | Notes                                                      |
| --------------------------- | ------ | ---------------------------------------------------------- |
| Wasm sandbox for extensions | 40h    | Replace Node.js vm with `isolated-vm` or Wasm              |
| SAML 2.0 SSO                | —      | Requires Supabase Enterprise plan                          |
| ClickHouse deeper analytics | 20h    | More query types, ML anomaly detection                     |
| Mobile app store submission | 10h    | Expo EAS build, App Store / Play Store                     |
| Windows MSI installer       | —      | Tauri builds `.msi` via `pnpm --filter @osp/desktop build` |
| k6 load tests               | 8h     | 100/1000/10000 concurrent stream targets                   |
