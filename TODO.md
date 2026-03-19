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

### 2. Extension Runtime — JS executor is a placeholder
**Status**: `extension-runner.ts` logs invocations but doesn't actually run code
**What's needed**: Implement actual extension execution (see TODO #7 below)

### 3. Mobile App — video is MJPEG snapshots, not real video
**Status**: Shows refreshing JPEGs every 5s (good enough for viewing)
**What's needed**: Real WebRTC via `react-native-webrtc` (see TODO #5 below)

### 4. Recordings playback
**Status**: Recordings are saved as MP4. Playback URL generated. Video element in UI.
**Known issue**: Recorded files are saved relative to gateway's CWD, path may differ in Docker.
**What's needed**: Verify `RECORDINGS_DIR` env var works in all environments, add streaming endpoint with proper headers.

---

## ❌ TODO — NOT STARTED

### 🔴 BLOCKERS (must fix before production)

#### TODO-1: TURN server for remote WebRTC
**Why**: Without a TURN server, WebRTC only works on LAN. Remote viewers (different network) can't see cameras.
**Files to change**:
- `infra/docker/go2rtc.yaml` — add TURN server config
- `.env.example` — add TURN_SERVER, TURN_USERNAME, TURN_PASSWORD
- `services/gateway/src/routes/stream.routes.ts` — include TURN in iceServers response

**Options**:
1. Self-hosted: Add coturn to docker-compose
2. Cloudflare: Use Cloudflare TURN (free tier)
3. Twilio: $0.0004/GB

**go2rtc TURN config**:
```yaml
webrtc:
  ice_servers:
    - urls: [turn:your-turn-server:3478]
      username: osp
      credential: your-password
```

**Effort**: 2-4 hours

---

#### TODO-2: Rate limiting middleware — needs Redis to be running
**Status**: Rate limiting code exists in `middleware/rate-limit.ts` but uses Redis.
**Issue**: If Redis is down, requests are allowed through (fail-open). Need to verify this is intentional and document it.
**Files**: `services/gateway/src/middleware/rate-limit.ts`
**What to verify**: Test rate limiting actually works by hitting an endpoint 100+ times.

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

#### TODO-4: Go services compilation + Docker build
**Why**: The gateway works standalone, but to use gRPC-based camera management in production, Go services must compile.
**Steps**:
```bash
# On any machine with Go 1.22+:
for svc in camera-ingest video-pipeline event-engine extension-runtime; do
  cd services/$svc
  go mod tidy
  go build ./cmd/server
  echo "$svc: OK"
  cd ../..
done
```
Then test Docker build:
```bash
docker build -f infra/docker/go-service.Dockerfile --build-arg SERVICE_NAME=camera-ingest services/camera-ingest
```

**Files**:
- `services/*/go.mod`
- `infra/docker/go-service.Dockerfile`

---

#### TODO-5: Mobile app WebRTC live view
**Why**: Current mobile live view is MJPEG snapshot refresh (~5s delay). Real live view needs WebRTC.
**Current state**: `react-native-webrtc` is in `apps/mobile/package.json` but not used.
**File to update**: `apps/mobile/app/camera/[id].tsx`
**What to do**:
```typescript
import { RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';
// Replace the Image-based view with RTCView
// Same WHEP signaling as web app
// GET /api/v1/cameras/:id/stream → whepUrl
// POST sdpOffer to whepUrl → sdpAnswer
// Attach stream to RTCView
```
**Effort**: 4-8 hours
**Reference**: `apps/web/src/components/camera/LiveViewPlayer.tsx` — same logic, different renderer.

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

#### TODO-7: Extension runtime — real Wasm execution
**Why this matters**: Extensions are the core differentiator. Currently `extension-runner.ts` is a placeholder.
**What to build**: Replace with actual JS/Wasm execution:

Option A (simpler): Use Node.js `vm` module with resource limits:
```typescript
import vm from 'vm';
const context = vm.createContext({ /* injected APIs */ });
const script = new vm.Script(extensionCode);
script.runInContext(context, { timeout: 5000 });
```

Option B (more isolated): Use `isolated-vm` npm package for true V8 isolation:
```bash
pnpm --filter @osp/gateway add isolated-vm
```

**Files**:
- `services/gateway/src/services/extension-runner.ts` — replace placeholder with real executor
- `services/extension-runtime/` — Go service for production Wasm (future)

**Effort**: 8-16 hours for Option A, 16-32 hours for Option B

---

#### TODO-8: AI detection — wire to motion events
**Status**: `ai-detection.service.ts` exists. NOT yet called on motion events.
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

#### TODO-9: Tauri desktop app — needs Rust toolchain
**Status**: `apps/desktop/` scaffold exists (package.json, tauri.conf.json, README)
**To complete**:
```bash
cd apps/desktop
# Install Rust: https://rustup.rs
# Install Tauri CLI
cargo install tauri-cli
# Initialize Tauri properly
cargo tauri init
pnpm dev  # Should open the web app in a native window
pnpm build  # Creates .dmg / .exe / .deb
```
**What to add after basic shell works**:
- System tray icon with camera status
- OS notifications (replaces browser notifications)
- Auto-start on login option
- Local file access for recordings

**Effort**: 16-32 hours for basic shell + system tray

---

#### TODO-10: Motion detection — real frame analysis
**Status**: Motion events are created manually (via API or "Simulate Motion" button). go2rtc streams are running but no automatic motion detection happens.
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

#### TODO-11: R2 / S3 storage for recordings
**Status**: Recordings are saved to local disk (`./recordings/`). R2 upload code exists in Go `video-pipeline` service but isn't called from the gateway.
**What's needed**:
- Configure `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, etc. in `.env`
- After recording stops, upload the MP4 to R2
- Generate pre-signed URLs for playback
- Update recording `storage_path` with R2 key

**Files**:
- `services/gateway/src/services/recording.service.ts` — add R2 upload after stopRecording
- `services/gateway/src/routes/recording.routes.ts` — generate pre-signed URL in GET /:id

**Effort**: 4-8 hours

---

#### TODO-12: Timeline scrubber — complete wiring
**Status**: `TimelineScrubber` component exists and fetches recording data.
**Issue**: When user clicks a time on the timeline, `handleTimelineSeek` is called but the video doesn't reliably jump to that timestamp.
**File**: `apps/web/src/app/(dashboard)/cameras/[id]/page.tsx`
**What to fix**: The seek logic needs to:
1. Find the recording that contains the timestamp
2. Load that recording's playback URL
3. Calculate offset in seconds within the recording
4. Set `videoElement.currentTime = offset`

---

#### TODO-13: Push notifications — server-side delivery
**Status**: Mobile app registers Expo push token. Token is NOT sent to the server yet.
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

#### TODO-14: Two-way audio — camera-to-browser
**Status**: Mic toggle exists in `LiveViewPlayer.tsx`. Adds audio track to WebRTC peer connection.
**Issue**: go2rtc needs to be configured to accept backchannel audio from the browser and forward it to the camera.
**What's needed**:
- Verify camera supports backchannel audio (most ONVIF cameras do)
- Configure go2rtc ONVIF backchannel: `source: onvif://user:pass@ip/stream&backchannel=1`
- Test with a camera that has a speaker

---

#### TODO-15: Sentry error monitoring — needs DSN
**Status**: `sentry.ts` exists. Gateway imports it. Just needs a DSN.
**Steps**:
1. Create project at sentry.io (free tier available)
2. Add to `.env`: `SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx`
3. Add to Vercel env vars: `NEXT_PUBLIC_SENTRY_DSN=...`
4. Verify errors appear in Sentry dashboard

---

### 🟢 NICE-TO-HAVE (Phase 3+)

#### TODO-16: ClickHouse analytics
**Why**: Heat maps, people counting, dwell time, traffic patterns
**Effort**: 40-80 hours
**Status**: Architecture designed in `docs/SYSTEM-ARCHITECTURE.md`, no code yet

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

#### TODO-20: ONVIF PTZ (real commands)
**Status**: PTZ buttons call `POST /cameras/:id/ptz` which logs the command.
**What's needed**: Forward PTZ commands to the Go `camera-ingest` service which sends ONVIF SOAP requests.
**Files**: `services/camera-ingest/internal/ptz/controller.go` — code exists, needs gRPC wiring
**Effort**: 4-8 hours

#### TODO-21: Webhook delivery tracking
**Status**: Webhooks are fired but there's no retry on failure, no delivery log.
**What to add**: Track webhook delivery attempts in a DB table, retry failed webhooks with exponential backoff.
**Effort**: 4-8 hours

#### TODO-22: Video clip thumbnails
**Status**: Event clips are saved as MP4. The events page has a "View Clip" button.
**What's missing**: Thumbnail image generated from the clip (first frame).
**How**: After clip is saved, extract frame with FFmpeg: `ffmpeg -i clip.mp4 -vframes 1 thumb.jpg`

#### TODO-23: Multi-monitor camera wall
**Why**: Enterprise command center needs 4-6 monitors showing all cameras
**What**: A fullscreen camera wall view (no sidebar), keyboard shortcuts to switch layouts
**Effort**: 8-16 hours

#### TODO-24: Mobile app — offline recordings list
**Status**: Recordings tab works when online. No caching for offline.
**What**: Cache last 20 recording metadata items in AsyncStorage for offline viewing.

#### TODO-25: API versioning strategy
**Status**: All routes are at `/api/v1/`. No v2 yet.
**When needed**: Before any breaking API changes. Add `/api/v2/` prefix, maintain v1 for 6 months.

---

## Known Bugs / Technical Debt

### 🔴 Critical
1. **Recording file paths in Docker**: `RECORDINGS_DIR=./recordings` is relative to gateway CWD. In Docker, this may be `/app/recordings` inside the container but not mapped to host. Add a Docker volume for recordings.

2. **WebSocket reconnect loop**: Logs show client registering/unregistering every ~1-2 seconds. Fixed once but may recur. Monitor with `docker logs gateway | grep "Client registered"`.

### 🟠 High
3. **JWT expiry**: Access tokens expire in 15 min. Auto-refresh logic exists in `apps/web/src/lib/api.ts` but hasn't been stress-tested. Test by leaving app open for 20 minutes.

4. **go2rtc stream persistence**: go2rtc loses all registered streams on restart. The `health-checker.ts` re-registers streams from DB every 30s, but there's a gap on startup. Add: on gateway startup, fetch all online cameras and register them in go2rtc.

5. **Camera status stuck on "connecting"**: If go2rtc crashes and restarts, cameras may stay "connecting" forever. Health checker fixes this in 30s, but consider adding a startup sync.

### 🟡 Medium
6. **Event clips storage**: 10s clips are saved to `RECORDINGS_DIR/tenantId/clips/`. No retention policy for clips (unlike recordings which have `retention_until`). Add clip cleanup job.

7. **Mobile app TypeScript**: Some `any` casts in mobile transforms. Add proper types.

8. **Zone drawing on mobile**: ZoneDrawer is web-only. Mobile has no zone management.

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

1. **TODO-4** — Go services compile (2-4 hours, unblocks production Go services)
2. **TODO-1** — TURN server (2-4 hours, unblocks remote WebRTC)
3. **TODO-3** — Production deployment test (2-4 hours, launch)
4. **TODO-8** — Wire AI detection to motion events (2-3 hours)
5. **TODO-13** — Push notifications server-side (4-6 hours)
6. **TODO-11** — R2 recording storage (4-8 hours)
7. **TODO-5** — Mobile WebRTC live view (4-8 hours)
8. **TODO-10** — Automatic motion detection worker (8-16 hours)
9. **TODO-7** — Real extension execution (8-16 hours)
10. **TODO-9** — Tauri desktop (16-32 hours)
