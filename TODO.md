# OSP — Master TODO & Agent Handoff Document

**Project**: Open Surveillance Platform (OSP)
**Repo**: https://github.com/MatiDes12/osp
**Stack**: Next.js 15 · Hono/Bun · Go microservices · Supabase · Redis · go2rtc · React Native/Expo
**Current stats**: 250+ source files · 61 commits · Phase 1 MVP complete · Phase 2 in progress

---

## How to use this document

This is the master handoff checklist for any agent or developer continuing OSP.
Each item has a priority, effort estimate, and enough context to start immediately.

**Priority levels**: 🔴 Blocker · 🟠 High · 🟡 Medium · 🟢 Nice-to-have
**Status**: ✅ Done · 🚧 Partial · ❌ Not started

---

## Quick context for a new agent

Before starting, read these files in order:
1. `CLAUDE.md` — project overview and tech stack
2. `docs/PRD.md` — product requirements
3. `docs/SYSTEM-ARCHITECTURE.md` — system architecture
4. `docs/TECHNICAL-DESIGN.md` — data models, API design
5. `docs/CONSISTENCY-STANDARDS.md` — naming, error handling, testing standards
6. `docs/PHASE2-CHANGELOG.md` — everything built so far

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

## ✅ COMPLETED (Phase 1 + Phase 2)

### Core Platform
- ✅ Auth: register, login, logout, JWT guards, role-based access (owner/admin/operator/viewer)
- ✅ Multi-tenant with Supabase RLS (row-level security on all tables)
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
- ✅ Zone drawing on camera (canvas polygon editor) — cursor fixed
- ✅ PTZ controls (wired to API)
- ✅ Two-way audio (mic toggle + volume)
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
- ✅ PTZ commands forwarded to camera-ingest gRPC (real ONVIF SOAP)
- ✅ R2 recording storage in gateway direct mode (upload + presigned playback)

### Mobile App (React Native/Expo)
- ✅ Auth flow (login/register) wired to real API
- ✅ Camera grid with live MJPEG thumbnails (5s refresh)
- ✅ Camera detail with live view
- ✅ Events list with severity colors
- ✅ Recordings list grouped by date
- ✅ Settings with real user/tenant data
- ✅ Push notification token registration (Expo)
- ✅ Offline detection banner
- ✅ Recording controls screen (start/stop/timer)

### Backend (Go services)
- ✅ camera-ingest: gRPC server, go2rtc client, ONVIF discovery, health monitor, PTZ
- ✅ video-pipeline: FFmpeg recording, R2 storage, spool, snapshots, retention
- ✅ event-engine: Redis pub/sub, rule evaluator (condition trees), dispatch, audit
- ✅ extension-runtime: gRPC server scaffold
- ✅ All services have go.mod with correct dependencies

### Infrastructure
- ✅ Docker Compose (Redis + go2rtc)
- ✅ Production Docker Compose with resource limits
- ✅ Supabase: 14 migrations, RLS, seed data
- ✅ GitHub Actions CI (lint, type-check, tests, build)
- ✅ Vercel config for web app
- ✅ Fly.io configs for all Go services + gateway
- ✅ K8s manifests (base + staging/production overlays)
- ✅ Deploy scripts
- ✅ Production checklist: `docs/PRODUCTION-CHECKLIST.md`

### AI Detection
- ✅ `ai-detection.service.ts` with OpenAI Vision API
- ✅ Graceful degradation (AI_PROVIDER=none works fine)
- ✅ AI event badges on events page

---

## 🚧 PARTIALLY DONE

### 1. Go Services — need `go.sum` files + compilation test
**Status**: Code written, but `go mod tidy` never run (no Go installed on dev Mac)
**What's needed**: On a machine with Go 1.22+:
```bash
cd services/camera-ingest && go mod tidy && go build ./cmd/server
cd services/video-pipeline && go mod tidy && go build ./cmd/server
cd services/event-engine && go mod tidy && go build ./cmd/server
cd services/extension-runtime && go mod tidy && go build ./cmd/server
```
Fix any compilation errors, ensure all 4 services compile.

### 2. Extension Runtime — ✅ Done (Node.js vm sandbox)
**Status**: `extension-runner.ts` uses Node.js `vm` module with sandboxed context, timeout clamping, and EXTENSION_ALLOW_INLINE_SOURCE guard. Phase 3 Wasm option still available.

### 3. Mobile App — ✅ Done (real WebRTC + MJPEG fallback)
**Status**: `MobileLiveViewWebRTCPlayer.tsx` uses `react-native-webrtc` for live WebRTC; falls back to MJPEG snapshot refresh on ICE failure or timeout. Wired to camera detail page.

### 4. Recordings playback
**Status**: Recordings are saved as MP4. Playback URL generated. Video element in UI.
**Known issue**: Recorded files are saved relative to gateway's CWD, path may differ in Docker.
**What's needed**: Verify `RECORDINGS_DIR` env var works in all environments, add streaming endpoint with proper headers.

---

## ❌ TODO — NOT STARTED

### 🔴 BLOCKERS (must fix before production)

#### ✅ TODO-1: TURN server for remote WebRTC
**Status**: Done.
- `infra/docker/docker-compose.yml` — coturn service added (host networking, configurable credentials via env)
- `infra/docker/go2rtc.yaml` — already had TURN config via `${TURN_SERVER_URL}` env var expansion
- `.env.example` — `TURN_SERVER_URL`, `TURN_SERVER_USERNAME`, `TURN_SERVER_CREDENTIAL` documented
- `services/gateway/src/services/stream.service.ts` — already includes TURN in `iceServers` response when env vars present
To enable: set `TURN_SERVER_URL=turn:localhost:3478`, `TURN_SERVER_USERNAME`, `TURN_SERVER_CREDENTIAL` in `.env`.

---

#### ✅ TODO-2: Rate limiting middleware — verified with real Redis
**Status**: Done. Integration tests written and passing (9/9).
**Verified**:
- Requests under the limit → 200 with correct `X-RateLimit-*` headers
- Requests over the limit → 429 with `RATE_LIMIT_EXCEEDED` error and `Retry-After` header
- 100+ rapid-fire requests: exactly `maxRequests` succeed, the rest are blocked
- Two tenants have independent counters
- UUID path segments are normalized (different UUIDs share the same rate limit bucket)
- `X-RateLimit-Remaining` reaches 0 at the limit, never goes negative
- **Fail-open is intentional**: if Redis is down, requests are allowed through (default). Set `RATE_LIMIT_FAIL_OPEN=false` to block instead.
**Files**:
- `services/gateway/src/middleware/rate-limit.ts` — implementation
- `services/gateway/src/middleware/rate-limit.integration.test.ts` — integration tests
- `services/gateway/vitest.integration.config.ts` — integration test config
**Run**: `cd services/gateway && pnpm test:integration`

---

### 🟠 HIGH PRIORITY

#### TODO-3: Production deployment — needs real testing
**Status**: Configs exist but have never been run end-to-end
**Steps to complete**:
1. Create Vercel project → `vercel link` in `apps/web/`
2. Set all env vars in Vercel dashboard
3. Run `bash scripts/deploy-vercel.sh`
4. Create Fly.io app → `fly apps create osp-gateway`
5. Set secrets → `fly secrets set SUPABASE_URL=...`
6. Run `bash scripts/deploy-fly.sh gateway`
7. Verify health at `https://your-app.fly.dev/health`

**Files**:
- `scripts/deploy-vercel.sh`
- `scripts/deploy-fly.sh`
- `services/gateway/fly.toml`
- `apps/web/vercel.json`

---

#### ✅ TODO-4: Go services compilation + Docker build
**Status**: Done. All 4 services compile and produce Docker images via `go-service.Dockerfile`.
- camera-ingest: 33s build ✅
- video-pipeline: 51s build ✅
- event-engine: 37s build ✅
- extension-runtime: 25s build ✅

**Images**: `osp-camera-ingest`, `osp-video-pipeline`, `osp-event-engine`, `osp-extension-runtime`
**Note**: Go services still can't connect to Supabase in Docker Desktop on Windows due to IPv6-only free tier. Gateway fallback mode handles all functionality. For full gRPC mode: use Supabase paid IPv4 add-on or run on Linux.

---

#### ✅ TODO-5: Mobile app WebRTC live view
**Status**: Done. `MobileLiveViewWebRTCPlayer.tsx` implements full WebRTC WHEP flow with `react-native-webrtc` + MJPEG fallback. Wired to `apps/mobile/app/camera/[id].tsx`.

---

#### TODO-6: Email sending — needs Resend API key
**Status**: `email.ts` + templates exist. Wired to invite and alert actions.
**Missing**: Just needs a real `RESEND_API_KEY` in `.env`.
**Test**:
```bash
# Add to .env:
RESEND_API_KEY=re_xxxx
EMAIL_FROM=alerts@yourdomain.com
# Then trigger a rule with email action
```
**Note**: For dev, free tier Resend allows 3000 emails/month.

---

#### ✅ TODO-7: Extension runtime — real JS execution
**Status**: Done (Option A). `extension-runner.ts` uses Node.js `vm` with `codeGeneration: {strings: false, wasm: false}`, timeout clamping, and `EXTENSION_ALLOW_INLINE_SOURCE` guard (must be `true` to enable; blocked in production). Phase 3: migrate to `isolated-vm` for stronger V8 isolation.

---

#### ✅ TODO-8: AI detection — wire to motion events
**Status**: Done. Motion events in `event.routes.ts` fire-and-forget AI analysis: fetches frame from go2rtc, calls OpenAI Vision, attaches detections to event metadata, creates typed sub-events (person/vehicle/animal) for confidence > 0.7.
**File to update**: `services/gateway/src/routes/event.routes.ts`
**What to add** (after event creation):
```typescript
// If motion event + AI configured + camera is online
const aiService = getAIDetectionService();
if (aiService.isConfigured() && input.type === 'motion') {
  const go2rtcUrl = process.env.GO2RTC_URL ?? 'http://localhost:1984';
  const snapRes = await fetch(`${go2rtcUrl}/api/frame.jpeg?src=${cameraId}`).catch(() => null);
  if (snapRes?.ok) {
    const buf = Buffer.from(await snapRes.arrayBuffer());
    const detections = await aiService.analyzeFrame(cameraId, buf);
    // Update event metadata with detections
    if (detections.length > 0) {
      await supabase.from('events').update({
        metadata: { ...input.metadata, detections }
      }).eq('id', eventId);
      // Create person/vehicle events
      for (const d of detections) {
        if (d.type !== 'unknown' && d.confidence > 0.7) {
          // Create typed event: person.detected, vehicle.detected, etc.
        }
      }
    }
  }
}
```
**Effort**: 2-3 hours

---

### 🟡 MEDIUM PRIORITY

#### ✅ TODO-9: Tauri desktop app
**Status**: Done. Full Tauri v2 app implemented.
**To run** (requires Rust 1.77+ and platform build tools):
```bash
pnpm --filter @osp/web dev          # terminal 1 — Next.js on :3001
pnpm --filter @osp/desktop dev      # terminal 2 — Tauri window
pnpm --filter @osp/desktop build    # production installers (.dmg/.msi/.deb)
```
**Files**:
- `apps/desktop/index.html` + `src/connect.js` + `src/style.css` — server connection screen (production mode)
- `apps/desktop/src-tauri/src/lib.rs` — system tray, window behaviour, Tauri commands
- `apps/desktop/src-tauri/tauri.conf.json` — Tauri v2 config (devUrl: localhost:3001)
- `apps/desktop/src-tauri/capabilities/default.json` — permissions
- `apps/web/src/lib/tauri.ts` — typed Tauri bridge (isTauri, updateTrayStatus, showNativeNotification, toggleAutostart…)
- `apps/web/src/hooks/use-tray-sync.ts` — syncs camera counts to tray tooltip
- `apps/web/src/lib/notifications.ts` — updated to use native notifications in Tauri
- `apps/web/src/app/(dashboard)/settings/page.tsx` — Desktop App settings tab (auto-start, notification test)
**Implemented**:
- System tray with live camera/alert count in tooltip; left-click toggles window; tray menu with Open / Start at Login / Quit
- Minimize to tray on close (× hides window, doesn't quit)
- Native OS notifications via `tauri-plugin-notification` (replaces Web Notifications API in desktop)
- Auto-start on login via `tauri-plugin-autostart` (toggle in tray menu and Settings)
- Connection screen for production builds — user enters server URL, verified with `/health`, then webview navigates there
- Dev mode loads Next.js dev server directly (`devUrl: http://localhost:3001`)

---

#### ✅ TODO-10: Motion detection — real frame analysis
**Status**: Done. `CameraHealthChecker` in `health-checker.ts` samples frames at 1fps via go2rtc, uses `motion-diff.ts` pixel diff algorithm, respects per-zone sensitivity, creates motion events with base64 snapshots, auto-starts timed recordings. Cooldown and sensitivity configurable via env vars.
**What's needed**: A background worker that:
1. Samples frames from each active camera (1 fps via go2rtc)
2. Compares consecutive frames (pixel diff algorithm)
3. If diff > threshold → creates a motion event via the API
4. Respects per-zone sensitivity settings

**Options**:
- Add to the gateway's `health-checker.ts` alongside camera health checks
- Create a dedicated motion detection worker in Node.js
- Use the Go `event-engine` service (has motion detection code in `internal/motion/`)

**Effort**: 8-16 hours

---

#### ✅ TODO-11: R2 / S3 storage for recordings
**Status**: Done — gateway now uploads to R2 when video-pipeline is unavailable (direct mode).
**Implementation**: `lib/r2.ts` — AWS SDK S3 client for R2 upload + presigned URLs. In direct stopRecording, upload MP4 to R2 and set `storage_path` to R2 key. `getPlaybackUrl` generates presigned URL when recording is in R2 and video-pipeline is down.

---

#### ✅ TODO-12: Timeline scrubber — complete wiring
**Status**: Done. `handleTimelineSeek` in camera detail page fetches timeline segments, finds matching recording, calculates offset, appends `?token=` auth param to playback URL, and sets `video.currentTime` via `loadedmetadata` event handler.

---

#### ✅ TODO-13: Push notifications — server-side delivery
**Status**: Done. Mobile app registers Expo token via `PATCH /api/v1/users/push-token`. `handlePushNotification` in `action-executor.ts` fetches user `push_token` values and POSTs to `https://exp.host/--/api/v2/push/send` in addition to creating DB notification records.
**What's needed**:
1. Add `push_token` column to `users` table (migration 00015)
2. API endpoint: `PATCH /api/v1/users/push-token` → saves token
3. In `dispatch/push.go` (Go) or `action-executor.ts`, call Expo Push API:
   ```typescript
   await fetch('https://exp.host/--/api/v2/push/send', {
     method: 'POST',
     body: JSON.stringify({ to: pushToken, title, body, data })
   });
   ```
4. Wire to notification dispatch when rules trigger

**Effort**: 4-6 hours

---

#### ✅ TODO-14: Two-way audio — camera-to-browser
**Status**: Done. Full backchannel pipeline wired.
- `infra/docker/go2rtc.yaml` — `audio_codecs: [opus]` added so go2rtc negotiates Opus for backchannel
- `services/gateway/src/services/stream.service.ts` — `addStream(id, uri, { twoWayAudio })` appends `?backchannel=1` to ONVIF URIs before registering with go2rtc (stored URI never modified)
- `services/gateway/src/routes/camera.routes.ts` — `PATCH /cameras/:id/capabilities` endpoint; merges capability flags, updates `audio_capable`, re-registers go2rtc stream (remove + re-add) when `twoWayAudio` changes
- `apps/web/src/app/(dashboard)/cameras/[id]/page.tsx` — Capabilities section in Settings tab with Two-Way Audio toggle; disabled with amber warning for non-ONVIF cameras; save calls PATCH capabilities endpoint
- Frontend (LiveViewPlayer) already had sendrecv audio transceiver, getUserMedia, addTrack/removeTrack mic toggle — no changes needed
**To use**: Set camera protocol to ONVIF, enable Two-Way Audio in camera Settings → Capabilities, then click the mic button in the live view.

---

#### ✅ TODO-15: Sentry error monitoring
**Status**: Done. Fully wired for both gateway and web app.
- `.env` — `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- `services/gateway/src/lib/sentry.ts` — `initSentry()` already called on startup, now has real DSN
- `apps/web/sentry.client.config.ts` — browser Sentry init (Replay, 1% session / 100% error)
- `apps/web/sentry.server.config.ts` + `sentry.edge.config.ts` — server/edge init
- `apps/web/instrumentation.ts` — Next.js 15 instrumentation hook loads server/edge config
- `apps/web/next.config.ts` — wrapped with `withSentryConfig` (source maps, tunnel route `/monitoring`, tree-shake logger)
- `.sentryclirc` — org/project defaults for CLI

---

### 🟢 NICE-TO-HAVE (Phase 3+)

#### ✅ TODO-16: ClickHouse analytics
**Status**: Done. Full analytics pipeline implemented.
- `infra/clickhouse/schema.sql` — `events_analytics` + `recordings_analytics` tables + hourly MV
- `infra/docker/docker-compose.yml` — ClickHouse service (port 8123) with auto-schema init
- `services/gateway/src/lib/clickhouse.ts` — lightweight HTTP client (graceful degradation if CH down)
- `services/gateway/src/services/analytics.service.ts` — trackEvent/trackRecording + 5 query functions
- `services/gateway/src/routes/analytics.routes.ts` — `/api/v1/analytics/*` (timeseries, heatmap, breakdown, camera activity, recordings summary)
- `apps/web/src/app/(dashboard)/analytics/page.tsx` — dashboard with timeline, donut, heatmap, bar chart, storage trend
- `apps/web/src/hooks/use-analytics.ts` — data hooks with 24h/7d/30d/90d presets
- Events are automatically tracked on creation (fire-and-forget, never blocks API response)

#### TODO-17: SSO / SAML for enterprise
**Why**: Enterprise customers need Active Directory / Okta integration
**How**: Supabase supports SAML 2.0 on Enterprise plan
**Effort**: 16-32 hours

#### TODO-18: License plate recognition (LPR)
**Why**: Key enterprise feature for parking/access control
**How**: Integrate OpenALPR or PlateMaker API as an extension
**Effort**: 16-32 hours

#### TODO-19: Edge computing agent
**Why**: Large sites need on-premise processing, not cloud
**What**: Lightweight Go binary that runs locally, syncs events/recordings to cloud
**Effort**: 40-80 hours

#### ✅ TODO-20: ONVIF PTZ (real commands)
**Status**: Done — PTZ route forwards to camera-ingest gRPC; real ONVIF SOAP commands when service is up.
**Implementation**: `POST /cameras/:id/ptz` calls `getCameraIngestClient().ptzCommand()`. Maps API actions (move/zoom/preset/stop) to proto enum. Graceful fallback when camera-ingest unavailable. Requires camera added to camera-ingest with ONVIF URL for PTZ to work.

#### ✅ TODO-21: Webhook delivery tracking
**Status**: Done. Retry + delivery log fully implemented.
- `infra/supabase/migrations/00016_create_webhook_delivery_attempts.sql` — table with RLS, 4 indexes, 90-day purge comment
- `services/gateway/src/lib/action-executor.ts` — `handleWebhook()` exponential-backoff retry (1–5 attempts, configurable timeout/backoff), `recordWebhookAttempt()` persists every attempt
- `services/gateway/src/routes/rule.routes.ts` — `GET /api/v1/rules/webhook-attempts` (admin, paginated, filter by ruleId/eventId/status)
- `packages/shared/src/types/rule.ts` — `WebhookDeliveryAttempt` type added
- `apps/web/src/app/(dashboard)/rules/page.tsx` — delivery log panel appears on any rule with a webhook action; shows attempt rows with status icon, URL, HTTP code, timestamp; expandable detail with error, response body, request payload; status filter (all/delivered/failed); pagination; refresh button

#### ✅ TODO-22: Video clip thumbnails
**Status**: Done — clip thumbnails are generated and available from `GET /api/v1/events/:id/thumbnail`.
**Implementation**: After clip is saved, gateway extracts the first frame with FFmpeg (`-frames:v 1`) into a sidecar `.jpg`.

#### ✅ TODO-23: Multi-monitor camera wall
**Status**: Done. Standalone `/wall` page created (no sidebar/topbar). Monitor page fixed and enhanced.
**Implemented**:
- `apps/web/src/app/wall/page.tsx` — fullscreen camera wall, `AuthGuard` + `Suspense`, 8 layouts (1x1/2x2/3x3/4x4/2x3/3x4/1+5/1+7), HUD auto-hides after 3.5s, auto-rotate with amber progress bar, URL params bookmarking (`?layout=`, `?rotate=`, `?filter=online`), keyboard shortcuts (1-8 layouts, F fullscreen, R rotate, ←/→ pages, ? legend), "Dashboard" back button
- `apps/web/src/app/(dashboard)/monitor/page.tsx` — fixed 1+7 layout (was rendering as 1+5), added 2×3 and 3×4 layouts, auto-rotate, "Open Wall" button → opens `/wall` in new tab
- Flex-based 1+5/1+7 layouts (main `flex-[2]`/`flex-[3]` + side strip `flex-1 flex-col`)

#### ✅ TODO-24: Mobile app — offline recordings list
**Status**: Done. AsyncStorage cache + offline banner implemented.
**Implementation**:
- `apps/mobile/lib/recordings-cache.ts` — `saveRecordingsCache` / `loadRecordingsCache` / `formatCacheAge` helpers
- `apps/mobile/app/(tabs)/recordings.tsx` — loads cache immediately on mount (no blank spinner), fetches fresh data in background, falls back to cache on network failure with amber "Offline — cached Xm ago" banner. Saves latest 20 items on every successful fetch.

#### ✅ TODO-25: API versioning strategy
**Status**: Done. Infrastructure in place; no v2 routes yet.
- `services/gateway/src/middleware/api-version.ts` — `apiVersion()` middleware (adds `API-Version: 1` header to every response), `deprecated(sunsetDate)` helper (RFC 8594 Deprecation + Sunset headers), `getRequestedVersion()` parser for `Accept-Version` request header
- `services/gateway/src/app.ts` — `apiVersion()` applied to all `/api/*` routes; root endpoint exposes `api.currentVersion`, `supportedVersions`, `deprecatedVersions`, `sunsetPolicy`
- `docs/API-VERSIONING.md` — full strategy doc: breaking vs non-breaking rules, 6-month deprecation lifecycle, client guidance, step-by-step v2 migration instructions

---

## Known Bugs / Technical Debt

### 🔴 Critical
1. ✅ **Recording file paths in Docker**: Fixed — `docker-compose.yml` now mounts a named volume `recordings-data` at `/data/recordings` and passes `RECORDINGS_DIR=/data/recordings` to the gateway container.

2. ✅ **WebSocket reconnect loop**: Fixed — when the server closes a WS connection with code 4001 (invalid/expired token), the client (`use-event-stream.ts`) now attempts a token refresh before reconnecting rather than immediately retrying with the same expired token. After 3 consecutive auth failures, reconnection stops and an error is shown.

### 🟠 High
3. ✅ **JWT expiry**: Fixed — `api.ts` now guards the proactive fire-and-forget refresh with `!isRefreshing` to avoid redundant concurrent refresh calls. The `onUnauthorized` handler correctly awaits a refresh before redirecting to login.

4. ✅ **go2rtc stream persistence**: Fixed — `health-checker.ts` calls `syncStreamsOnStartup()` immediately on `start()`, re-registering all non-disabled cameras in go2rtc before the first health check cycle.

5. ✅ **Camera status stuck on "connecting"**: Fixed by the same startup sync — health check runs immediately on start, updating statuses within seconds rather than waiting 30s.

### 🟡 Medium
6. ✅ **Event clips storage**: Fixed — `CameraHealthChecker` now runs a clip cleanup job every hour that deletes local clip files older than 7 days and clears the `clip_path` column on those event rows.

7. ✅ **Mobile app TypeScript**: Fixed — `apps/mobile/lib/transforms.ts` now uses `Record<string, unknown>` with typed helper functions (`str`, `num`, `bool`, `pick`). All `eslint-disable no-explicit-any` comments removed.

8. ✅ **Zone drawing on mobile**: Fixed — `apps/mobile/app/camera/[id].tsx` now fetches and displays a "Motion Zones" section with each zone's name, sensitivity level, and an alert toggle (Switch). Toggling calls `PATCH /api/v1/cameras/:id/zones/:zoneId` with optimistic update + rollback on failure.

---

## Environment Variables Reference

All variables with current defaults:

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

# Error monitoring (optional)
SENTRY_DSN=

# Email (optional, logs to console if not set)
RESEND_API_KEY=
EMAIL_FROM=alerts@yourdomain.com

# Encryption (generate: openssl rand -hex 32)
OSP_ENCRYPTION_KEY=

# Recordings
RECORDINGS_DIR=./recordings

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
│   │   ├── app/(dashboard)/    ← All dashboard pages
│   │   ├── components/         ← React components
│   │   │   ├── camera/         ← LiveViewPlayer, CameraCard, ZoneDrawer
│   │   │   ├── events/         ← LiveEventFeed
│   │   │   ├── layout/         ← Sidebar, TopBar, MobileNav
│   │   │   └── ui/             ← Toast, VirtualList, ShortcutsModal
│   │   ├── hooks/              ← use-cameras, use-events, use-recordings...
│   │   ├── lib/                ← api.ts, jwt.ts, transforms.ts, export.ts
│   │   └── stores/             ← sidebar.ts, toast.ts, theme.ts
│   └── mobile/                 ← Expo React Native app
├── packages/
│   ├── shared/src/             ← Types, Zod schemas, API client
│   ├── ui/                     ← StatusIndicator, cn()
│   └── sdk/                    ← Extension SDK types
├── services/
│   ├── gateway/src/
│   │   ├── routes/             ← All Hono API routes (auth, camera, event...)
│   │   ├── services/           ← stream.service, recording.service, ai-detection
│   │   ├── lib/                ← supabase, redis, logger, env, cache, email
│   │   ├── grpc/               ← gRPC clients for Go services
│   │   └── ws/                 ← WebSocket server
│   ├── camera-ingest/          ← Go: ONVIF, go2rtc, health monitor, PTZ
│   ├── video-pipeline/         ← Go: FFmpeg, R2, recording service
│   ├── event-engine/           ← Go: Redis sub, rule evaluator, dispatch
│   └── extension-runtime/      ← Go: gRPC server (phase 3: Wasm sandbox)
├── infra/
│   ├── docker/                 ← docker-compose.yml, Dockerfiles
│   ├── k8s/                    ← Kubernetes manifests
│   └── supabase/migrations/    ← 14 SQL migrations
├── docs/
│   ├── PRD.md
│   ├── SYSTEM-ARCHITECTURE.md
│   ├── TECHNICAL-DESIGN.md
│   ├── CONSISTENCY-STANDARDS.md
│   ├── SETUP-GUIDE.md
│   ├── PRODUCTION-CHECKLIST.md
│   └── PHASE2-CHANGELOG.md
└── TODO.md                     ← This file
```

---

## Suggested next sprint order

1. **TODO-4** — Go services compile (2-4 hours, unblocks production Go services) — requires Go 1.22+
2. **TODO-3** — Production deployment test (2-4 hours, launch)
3. **TODO-21** — Webhook retry tracking — partial (retry exists, no UI for delivery log)
4. **TODO-9** — Tauri desktop app (16-32 hours)
5. **TODO-16** — ClickHouse analytics (40-80 hours, Phase 3)

**All other TODO-1 through TODO-13 items (and TODO-2) are now complete.**
