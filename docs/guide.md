# OSP — Developer Guide

Everything you need to run, develop, and deploy OSP across all platforms.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [First-Time Setup](#first-time-setup)
3. [Running the Web App](#running-the-web-app)
4. [Running the Mobile App](#running-the-mobile-app)
5. [Running the Desktop App](#running-the-desktop-app)
6. [Running All Platforms Simultaneously](#running-all-platforms-simultaneously)
7. [Database Migrations](#database-migrations)
8. [Running with Docker](#running-with-docker)
9. [Running Tests](#running-tests)
10. [Seeding Demo Data](#seeding-demo-data)
11. [Production Deployment](#production-deployment)
12. [Environment Variables Reference](#environment-variables-reference)
13. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Install these before starting:

| Tool               | Version | Install                                    |
| ------------------ | ------- | ------------------------------------------ |
| **Node.js**        | 20+     | https://nodejs.org                         |
| **pnpm**           | 10+     | `npm install -g pnpm`                      |
| **Docker Desktop** | Latest  | https://docker.com/products/docker-desktop |
| **Git**            | Latest  | https://git-scm.com                        |

For mobile development:

| Tool                 | Version            | Notes                                                 |
| -------------------- | ------------------ | ----------------------------------------------------- |
| **Expo Go**          | Latest             | Install on your phone from the App Store / Play Store |
| **iOS Simulator**    | Xcode (macOS only) | App Store → Xcode                                     |
| **Android Emulator** | Android Studio     | https://developer.android.com/studio                  |

For desktop development (Tauri):

| Tool                             | Version | Notes                                                                                      |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| **Rust**                         | 1.77+   | https://rustup.rs                                                                          |
| **Microsoft C++ Build Tools**    | Latest  | Windows only — Visual Studio Installer → "Desktop development with C++"                    |
| **Xcode CLI**                    | Latest  | macOS only — `xcode-select --install`                                                      |
| **build-essential + webkit2gtk** | Latest  | Linux only — `sudo apt install build-essential libwebkit2gtk-4.1-dev libappindicator3-dev` |

---

## First-Time Setup

Run these steps once after cloning:

```bash
# 1. Clone the repo
git clone https://github.com/MatiDes12/osp.git
cd osp

# 2. Install all dependencies (all workspaces)
pnpm install

# 3. Build shared packages (required before running anything)
pnpm --filter @osp/shared build

# 4. Copy the env file and fill in your credentials
cp .env.example .env
# Edit .env — set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# 5. Push database migrations (first time only)
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push

# 6. Start infrastructure (Redis, go2rtc, ClickHouse)
docker compose -f infra/docker/docker-compose.yml up -d redis go2rtc clickhouse
```

> **Get Supabase credentials** — go to https://supabase.com/dashboard → your project → Settings → API.
> Use the **direct connection** URL (port 5432) for `DATABASE_URL`, not the pooler (port 6543).
>
> **Windows / Docker Desktop note** — Supabase free tier resolves to an IPv6 address which Docker Desktop on Windows cannot route. The gateway and web app work fine (they use the Supabase REST API over HTTPS). The Go services (camera-ingest, video-pipeline, event-engine) require a direct Postgres connection and will fail to start in Docker on Windows free tier. The gateway runs in fallback/direct mode which covers all functionality without them.

---

## Running the Web App

Requires infrastructure running (step 6 above).

### Terminal 1 — API Gateway

```bash
cd services/gateway
pnpm dev
```

Starts on **http://localhost:3000** (REST API) and **ws://localhost:3002** (WebSocket).

Expected output:

```
OSP API Gateway running at http://localhost:3000
WebSocket server started on port 3002
Redis pub/sub subscription active
```

### Terminal 2 — Web Dashboard

```bash
cd apps/web
pnpm dev
```

Opens at **http://localhost:3001**.

### Service URLs

| Service               | URL                        | Purpose                    |
| --------------------- | -------------------------- | -------------------------- |
| Web dashboard         | http://localhost:3001      | Main UI                    |
| API gateway           | http://localhost:3000      | REST API                   |
| API docs (Swagger)    | http://localhost:3000/docs | Interactive API docs       |
| WebSocket             | ws://localhost:3002        | Real-time events           |
| go2rtc admin          | http://localhost:1984      | Camera stream manager      |
| go2rtc RTSP re-stream | rtsp://localhost:8554      | Test RTSP streams          |
| ClickHouse            | http://localhost:8123      | Analytics DB (Docker only) |

### First Login

1. Go to **http://localhost:3001/register** and create an account.
2. Click **Add Camera** → enter an RTSP URL, or use `rtsp://localhost:8554/demo-cam-1` for the built-in test stream.

### Simulate a Motion Event

```bash
# Get your auth token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# Create a motion event
curl -X POST http://localhost:3000/api/v1/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cameraId":"YOUR_CAMERA_UUID","type":"motion","severity":"high","intensity":85}'
```

---

## Running the Mobile App

### Start the Expo dev server

```bash
cd apps/mobile
npx expo start
```

| Key     | Action                                  |
| ------- | --------------------------------------- |
| `i`     | Open in iOS Simulator (macOS only)      |
| `a`     | Open in Android Emulator                |
| Scan QR | Open in Expo Go on your physical device |

### Connect a physical device to your local backend

On a phone on the same Wi-Fi network, `localhost` won't work. Create `apps/mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000
EXPO_PUBLIC_WS_URL=ws://192.168.x.x:3002
EXPO_PUBLIC_GO2RTC_URL=http://192.168.x.x:1984
```

Replace `192.168.x.x` with your computer's LAN IP:

- Windows: `ipconfig`
- macOS / Linux: `ifconfig | grep inet`

### Features available on mobile

- Live camera grid with MJPEG thumbnails (5s refresh)
- WebRTC live view with MJPEG fallback
- Events list with severity colours
- Recordings list — **works offline** (last 20 recordings cached automatically)
- Motion zone management (view + toggle alerts per zone)
- PTZ controls for supported cameras
- Push notifications via Expo

---

## Running the Desktop App

The desktop app is a Tauri v2 wrapper around the Next.js web dashboard.

### Requirements check

```bash
rustc --version   # should print 1.77+
```

If Rust isn't installed: https://rustup.rs

### Development mode (loads from Next.js dev server)

```bash
# Terminal 1 — web dev server (required — Tauri loads from it)
cd apps/web && pnpm dev

# Terminal 2 — Tauri window
cd apps/desktop && pnpm dev
```

A native window opens loading **http://localhost:3001**. Hot-reload works — web changes appear instantly.

### Generate app icons (optional, first time only)

```bash
# Place a 1024×1024 PNG at apps/desktop/src-tauri/icons/app-icon.png, then:
cd apps/desktop
pnpm tauri icon src-tauri/icons/app-icon.png
```

> Skip this for dev — Tauri uses placeholder icons automatically.

### Production build (creates an installer)

```bash
cd apps/desktop
pnpm build
```

Output installers at `apps/desktop/src-tauri/target/release/bundle/`:

| Platform | Output                                              |
| -------- | --------------------------------------------------- |
| Windows  | `bundle/msi/*.msi` and `bundle/nsis/*.exe`          |
| macOS    | `bundle/dmg/*.dmg` and `bundle/macos/*.app`         |
| Linux    | `bundle/deb/*.deb` and `bundle/appimage/*.AppImage` |

In production the app shows a **connection screen** — enter your OSP server URL and it's remembered for future launches.

### Desktop features

| Feature                  | How                                                   |
| ------------------------ | ----------------------------------------------------- |
| **System tray**          | Shows `x/y cameras online • N alerts` in tooltip      |
| **Show / hide window**   | Left-click tray icon, or tray menu → Open Dashboard   |
| **Minimize to tray**     | Clicking × hides the window — OSP keeps running       |
| **Quit**                 | Tray menu → Quit OSP                                  |
| **Start at login**       | Tray menu → Start at Login, or Settings → Desktop App |
| **Native notifications** | OS-level alerts instead of browser pop-ups            |

### Tauri commands (called from the web frontend via `invoke`)

| Command                 | Args                                               | Description                           |
| ----------------------- | -------------------------------------------------- | ------------------------------------- |
| `update_tray_status`    | `cameras_online`, `cameras_total`, `alerts_unread` | Updates tray tooltip                  |
| `show_os_notification`  | `title`, `body`                                    | Shows a native OS notification        |
| `toggle_autostart`      | —                                                  | Toggles auto-start; returns new state |
| `get_autostart_enabled` | —                                                  | Returns current auto-start state      |
| `show_main_window`      | —                                                  | Shows and focuses the main window     |

---

## Running All Platforms Simultaneously

```
Terminal 1   docker compose -f infra/docker/docker-compose.yml up -d redis go2rtc clickhouse
Terminal 2   cd services/gateway && pnpm dev
Terminal 3   cd apps/web && pnpm dev
Terminal 4   cd apps/mobile && npx expo start
Terminal 5   cd apps/desktop && pnpm dev
```

> Terminals 3–5 all connect to the same gateway on port 3000. Mobile and Desktop use the same API as the browser.

### Go services (optional — needed for full gRPC video pipeline)

Go services are optional. The gateway runs in **direct/fallback mode** without them, covering all features including camera management, recording, motion detection, and rule evaluation.

If you have Go 1.22+ installed (or want to run them in Docker):

```bash
# Option A — run locally (requires Go 1.22+)
cd services/camera-ingest   && go run ./cmd/server/
cd services/video-pipeline  && go run ./cmd/server/
cd services/event-engine    && go run ./cmd/server/
cd services/extension-runtime && go run ./cmd/server/

# Option B — build Docker images (no local Go needed)
docker build -f infra/docker/go-service.Dockerfile --build-arg SERVICE_NAME=camera-ingest   -t osp-camera-ingest   services/camera-ingest
docker build -f infra/docker/go-service.Dockerfile --build-arg SERVICE_NAME=video-pipeline  -t osp-video-pipeline  services/video-pipeline
docker build -f infra/docker/go-service.Dockerfile --build-arg SERVICE_NAME=event-engine    -t osp-event-engine    services/event-engine
docker build -f infra/docker/go-service.Dockerfile --build-arg SERVICE_NAME=extension-runtime -t osp-extension-runtime services/extension-runtime
```

> On Windows with Docker Desktop + Supabase free tier: Go services require a direct Postgres connection but Supabase resolves to IPv6 which Docker Desktop cannot route. Use the gateway's direct mode instead, or upgrade to Supabase Pro (IPv4 add-on).

---

## Database Migrations

OSP uses Supabase cloud (PostgreSQL + Auth + Realtime). Migrations live in `infra/supabase/migrations/`.

```bash
# Link to your Supabase project (first time only)
npx supabase link --project-ref YOUR_PROJECT_REF

# Apply all migrations to cloud
npx supabase db push
# or directly with the DB URL:
npx supabase@2.82.0 db push --db-url "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"

# Create a new migration
npx supabase@2.82.0 migration new my_migration_name
# Edit the file in infra/supabase/migrations/, then push
```

> Use the **direct connection** URL (port 5432), not the transaction pooler (port 6543). Go services will fail with pooler URLs.

---

## Running with Docker

Runs the full stack in containers. No local Node or Go installation needed (for the backend).

### First time

```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL

docker compose -f infra/docker/docker-compose.yml build gateway
docker compose -f infra/docker/docker-compose.yml up -d
```

### What runs in Docker

| Container    | Image                                    | Purpose                                  |
| ------------ | ---------------------------------------- | ---------------------------------------- |
| `gateway`    | Built from `gateway.Dockerfile`          | API server (port 3000), WebSocket (3002) |
| `go2rtc`     | `alexxit/go2rtc`                         | Camera proxy / WebRTC (port 1984, 8554)  |
| `redis`      | `redis:7-alpine`                         | Cache + pub/sub (port 6379)              |
| `clickhouse` | `clickhouse/clickhouse-server:24-alpine` | Analytics DB (port 8123)                 |

Go services (`camera-ingest`, `video-pipeline`, `event-engine`, `extension-runtime`) are not in the default compose stack — the gateway handles everything in fallback mode.

### Common commands

```bash
# Rebuild only what changed
docker compose -f infra/docker/docker-compose.yml build --no-cache gateway
docker compose -f infra/docker/docker-compose.yml up -d gateway

# View logs
docker compose -f infra/docker/docker-compose.yml logs -f gateway
docker compose -f infra/docker/docker-compose.yml logs -f   # all services

# Stop everything
docker compose -f infra/docker/docker-compose.yml down

# Stop and wipe volumes (fresh start)
docker compose -f infra/docker/docker-compose.yml down -v
```

### Docker service URLs

| Service         | URL                        |
| --------------- | -------------------------- |
| API Gateway     | http://localhost:3000      |
| API docs        | http://localhost:3000/docs |
| WebSocket       | ws://localhost:3002        |
| go2rtc admin    | http://localhost:1984      |
| RTSP re-stream  | rtsp://localhost:8554      |
| Redis           | localhost:6379             |
| ClickHouse HTTP | http://localhost:8123      |

> The web dashboard (`apps/web`) is **not** in Docker. Run it locally with `cd apps/web && pnpm dev`, or deploy it to Vercel.

---

## Running Tests

```bash
# Unit tests — shared package
pnpm --filter @osp/shared test

# Unit tests — gateway
pnpm --filter @osp/gateway test

# Integration tests — gateway (requires Redis running)
cd services/gateway && pnpm test:integration

# All tests via Turborepo
pnpm test

# E2E tests (requires web app running on :3001)
cd apps/web
npx playwright install    # first time only
pnpm test:e2e

# Build check (all packages)
pnpm build
```

---

## Seeding Demo Data

```bash
# Seed cameras, events, and rules via API (requires running gateway)
bash scripts/seed-dev.sh

# Or paste directly into Supabase SQL Editor:
# infra/supabase/seed/dev.sql        — cameras, events, rules
# infra/supabase/seed/extensions.sql — demo marketplace extensions
```

---

## Production Deployment

### Overview

| Layer                          | Platform                      |
| ------------------------------ | ----------------------------- |
| Web app (Next.js)              | Vercel                        |
| API gateway + Go services      | Fly.io                        |
| Infrastructure (Redis, go2rtc) | Docker on a VPS or Kubernetes |

### Deploy to Vercel (web app)

```bash
npm i -g vercel
vercel login

# First time — link the project
cd apps/web && vercel link

# Set environment variables in the Vercel dashboard:
# NEXT_PUBLIC_API_URL, NEXT_PUBLIC_GO2RTC_URL, NEXT_PUBLIC_WS_URL

# Deploy
bash scripts/deploy-vercel.sh            # preview
bash scripts/deploy-vercel.sh production # production
```

### Deploy to Fly.io (gateway + Go services)

```bash
curl -L https://fly.io/install.sh | sh
fly auth login

# Create apps (first time only)
fly apps create osp-gateway
fly apps create osp-camera-ingest

# Set secrets
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_KEY=... REDIS_URL=... -a osp-gateway

# Deploy
bash scripts/deploy-fly.sh gateway
bash scripts/deploy-fly.sh all
```

### HTTPS / SSL

- **Vercel** — handles HTTPS automatically for the web app.
- **Fly.io** — handles HTTPS automatically for the gateway (`*.fly.dev`).
- **go2rtc WebRTC** — requires a TURN server for production across symmetric NATs.

TURN options: Cloudflare Calls (free tier), Twilio, or self-hosted coturn. Set in `.env`:

```env
TURN_SERVER_URL=turn:your-server:3478
TURN_SERVER_USERNAME=user
TURN_SERVER_CREDENTIAL=pass
```

### SSO / Identity Providers

OSP supports Google, Microsoft (Azure AD), and GitHub sign-in via Supabase OAuth.

**To activate an OAuth provider:**

1. Open **Supabase dashboard → Authentication → Providers**
2. Enable the provider (Google / Azure AD / GitHub) and paste your OAuth app credentials:
   - **Google**: Client ID + Client Secret from [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
   - **Microsoft**: Application (client) ID + Client Secret from [Azure portal](https://portal.azure.com/) → App registrations
   - **GitHub**: Client ID + Client Secret from GitHub → Settings → Developer settings → OAuth Apps
3. Set the **callback URL** in your OAuth app to:
   ```
   https://your-supabase-project.supabase.co/auth/v1/callback
   ```
4. Set `NEXT_PUBLIC_API_URL` in Vercel to your production gateway URL.
5. Flip the toggle in **Settings → SSO / Identity** inside the OSP dashboard to enable each provider for your tenant.
6. Optionally configure **allowed domains** (e.g. `company.com`) so only your organization's accounts can sign in.

> **Note:** SAML 2.0 / enterprise IdP federation requires the Supabase Enterprise plan. The OAuth providers above work on all Supabase plans.

### Deploy with Kubernetes

```bash
# Apply base manifests
kubectl apply -k infra/k8s/base/

# Environment-specific overlays
kubectl apply -k infra/k8s/overlays/staging/
kubectl apply -k infra/k8s/overlays/production/
```

### CI/CD (GitHub Actions)

`.github/workflows/deploy.yml` runs on push to `main`:

- Detects changed services
- Builds Docker images
- Deploys to staging via Fly.io
- Deploys web to Vercel

Required GitHub secrets: `FLY_API_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and health-check URLs for staging/production.

### Production environment variables

See `infra/production/.env.production.example` for a complete list.

Key values for production Docker:

```env
NODE_ENV=production
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=osp-recordings
GO2RTC_PUBLIC_URL=http://<your-server-ip>:1984
```

All Docker services use `restart: unless-stopped`. Enable Docker to start on boot:

```bash
sudo systemctl enable docker
```

---

## Environment Variables Reference

Variables are loaded from `.env` at the repo root.

> **Do not** set infrastructure URLs (`REDIS_URL`, `GO2RTC_URL`, gRPC addresses) in the `config_secrets` database table — those must come from environment variables so Docker networking works correctly.

| Variable                    | Required          | Description                                        |
| --------------------------- | ----------------- | -------------------------------------------------- |
| `SUPABASE_URL`              | Yes               | Supabase project API URL                           |
| `SUPABASE_ANON_KEY`         | Yes               | Supabase anon/public key                           |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes               | Supabase service role key (server-side only)       |
| `DATABASE_URL`              | Go services       | Direct Postgres connection — port 5432, not 6543   |
| `REDIS_URL`                 | Auto in Docker    | Default: `redis://localhost:6379`                  |
| `GO2RTC_URL`                | Auto in Docker    | Default: `http://localhost:1984`                   |
| `R2_ENDPOINT`               | For recording     | Cloudflare R2 endpoint                             |
| `R2_ACCESS_KEY_ID`          | For recording     | R2 access key                                      |
| `R2_SECRET_ACCESS_KEY`      | For recording     | R2 secret key                                      |
| `R2_BUCKET_NAME`            | For recording     | R2 bucket name (default: `osp-storage`)            |
| `RECORDINGS_DIR`            | Optional          | Local recording path (default: `./recordings`)     |
| `AI_PROVIDER`               | Optional          | `none` (default) or `openai`                       |
| `OPENAI_API_KEY`            | If AI enabled     | OpenAI API key for vision analysis                 |
| `RESEND_API_KEY`            | For email alerts  | Resend API key                                     |
| `EMAIL_FROM`                | For email alerts  | Sender address (e.g. `alerts@yourdomain.com`)      |
| `SENTRY_DSN`                | Optional          | Sentry error monitoring DSN                        |
| `OSP_ENCRYPTION_KEY`        | Optional          | 32-byte hex key — generate: `openssl rand -hex 32` |
| `TURN_SERVER_URL`           | Production WebRTC | TURN server URL                                    |
| `TURN_SERVER_USERNAME`      | Production WebRTC | TURN credentials                                   |
| `TURN_SERVER_CREDENTIAL`    | Production WebRTC | TURN credentials                                   |
| `GATEWAY_PORT`              | Optional          | API port (default: `3000`)                         |
| `WS_PORT`                   | Optional          | WebSocket port (default: `3002`)                   |

Variables set automatically inside Docker Compose (do not override):

| Variable                  | Docker value           |
| ------------------------- | ---------------------- |
| `REDIS_URL`               | `redis://redis:6379`   |
| `GO2RTC_URL`              | `http://go2rtc:1984`   |
| `CAMERA_INGEST_GRPC_URL`  | `camera-ingest:50051`  |
| `VIDEO_PIPELINE_GRPC_URL` | `video-pipeline:50052` |
| `EVENT_ENGINE_GRPC_URL`   | `event-engine:50053`   |

---

## Troubleshooting

### `Cannot find module @osp/shared`

```bash
pnpm --filter @osp/shared build
```

### `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required`

```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

### Mobile device can't connect to the gateway

Use your computer's LAN IP in `apps/mobile/.env` — not `localhost`.

### Docker can't reach LAN cameras (macOS / Windows)

Docker Desktop runs in a VM. Run go2rtc natively on your host instead:

```bash
# Download binary from https://github.com/AlexxIT/go2rtc/releases
./go2rtc -config infra/docker/go2rtc.yaml
```

### `ECONNREFUSED` on Redis inside Docker

The `config_secrets` table must not have a `REDIS_URL` entry — it overrides the Docker env var. Delete it from Supabase if present.

### `FATAL: Tenant or user not found` in Go services

You're using the Supabase pooler URL (port 6543). Switch `DATABASE_URL` to the direct connection (port 5432).

### Desktop: `error: linker 'link.exe' not found` (Windows)

Install Microsoft C++ Build Tools — Visual Studio Installer → "Desktop development with C++".

### Desktop: Tauri window is blank in dev

Make sure `cd apps/web && pnpm dev` is running on port 3001 **before** starting Tauri.

### Port already in use

```bash
# Windows
netstat -ano | findstr :3000

# macOS / Linux
lsof -i :3000
```

Change the port in `.env` (`GATEWAY_PORT=3001`) if needed.

### Docker build fails — `Cannot find package 'dotenv'`

The pnpm workspace symlinks broke. Rebuild with no cache:

```bash
docker compose build --no-cache gateway
```

### go2rtc camera stream not loading

```bash
# Check go2rtc sees the stream
curl http://localhost:1984/api/streams

# Test RTSP URL directly
ffprobe rtsp://<camera-ip>:554/stream
```

### `RLS policy violation` on registration

Make sure `SUPABASE_SERVICE_ROLE_KEY` (not the anon key) is set in `.env`. The service role bypasses Row Level Security.

### ClickHouse `get_mempolicy: Operation not permitted` on startup

Docker Desktop on Windows/WSL2 blocks the `get_mempolicy` syscall. The fix is already in `docker-compose.yml` (`cap_add: [SYS_NICE, IPC_LOCK]` + `security_opt: seccomp:unconfined`). If you see this error, make sure you're using the latest compose file.

### ClickHouse health check stays `unhealthy` on Alpine

Alpine resolves `localhost` to `::1` (IPv6) but ClickHouse only binds IPv4. The health check uses `127.0.0.1` explicitly — already fixed in the compose file.

### Go services crash with `network is unreachable` (IPv6 address)

Supabase free tier direct connections resolve to an IPv6 address. Docker Desktop on Windows cannot route IPv6. Either:

- Use the gateway's direct mode (default — no action needed)
- Upgrade to Supabase Pro and enable the IPv4 add-on

### Gateway container exits immediately with no logs

The `dist/index.js` bundle is likely empty (0 bytes). Rebuild with no cache:

```bash
docker compose -f infra/docker/docker-compose.yml build --no-cache gateway
```

This was caused by `tsup --dts` silently failing on type errors. The fix (remove `--dts` from the build script) is already in `services/gateway/package.json`.
