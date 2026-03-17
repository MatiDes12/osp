# OSP — Setup & Run Guide

Step-by-step instructions to get the entire OSP platform running locally on macOS, Windows, or Linux.

---

## Prerequisites

Install these before starting:

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 20+ | https://nodejs.org |
| **pnpm** | 10+ | `npm install -g pnpm` |
| **Docker Desktop** | Latest | https://docker.com/products/docker-desktop |
| **Git** | Latest | https://git-scm.com |

Optional (for mobile development):
| Tool | Version | Install |
|------|---------|---------|
| **Expo CLI** | Latest | `npm install -g expo-cli` |
| **iOS Simulator** | Xcode (macOS only) | App Store → Xcode |
| **Android Studio** | Latest | https://developer.android.com/studio |

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/MatiDes12/osp.git
cd osp
```

---

## Step 2: Install Dependencies

```bash
pnpm install
```

This installs dependencies for all 7 workspace packages:
- `packages/shared` — Shared types, schemas, API client
- `packages/ui` — Shared UI components
- `packages/sdk` — Extension SDK
- `services/gateway` — API gateway (Hono)
- `apps/web` — Web dashboard (Next.js)
- `apps/mobile` — Mobile app (React Native/Expo)

---

## Step 3: Build Shared Packages

The shared packages must be built before other services can use them:

```bash
pnpm --filter @osp/shared build
pnpm --filter @osp/extension-sdk build
```

You should see output like:
```
ESM Build success in 24ms
DTS Build success in 2078ms
```

---

## Step 4: Set Up Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your Supabase credentials:

```env
# Get these from https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres.YOUR_PROJECT:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

The other values can stay as defaults for local development.

---

## Step 5: Start Infrastructure (Docker)

Start Redis and go2rtc (the video streaming proxy):

```bash
docker compose -f infra/docker/docker-compose.yml up -d redis go2rtc
```

Verify they're running:
```bash
docker ps
```

You should see:
```
CONTAINER ID   IMAGE                    STATUS         PORTS
xxxxxxxxxxxx   redis:7-alpine           Up (healthy)   0.0.0.0:6379->6379/tcp
xxxxxxxxxxxx   alexxit/go2rtc:latest    Up             0.0.0.0:1984->1984/tcp, ...
```

**Verify go2rtc:** Open http://localhost:1984 in your browser — you should see the go2rtc web UI.

---

## Step 6: Run Database Migrations (Supabase)

If this is your first time setting up, push the database schema:

```bash
# Install Supabase CLI
npx supabase --version

# Link to your project
npx supabase link --project-ref YOUR_PROJECT_REF

# Push all migrations
npx supabase db push
```

The migrations create 12 tables with enums, indexes, and Row Level Security policies.

If you already have the tables (from a previous setup), skip this step.

---

## Step 7: Start the API Gateway

Open a terminal and run:

```bash
cd services/gateway
pnpm dev
```

You should see:
```
[dotenv] injecting env from ../../.env
OSP API Gateway starting on port 3000
OSP API Gateway running at http://localhost:3000
WebSocket server started on port 3002
Redis pub/sub subscription active for events:*
```

**Verify:** Open http://localhost:3000 — you should see the API info JSON.

---

## Step 8: Start the Web Dashboard

Open a **new terminal** and run:

```bash
cd apps/web
pnpm dev
```

You should see:
```
▲ Next.js 15.x
- Local: http://localhost:3001
✓ Ready in ~2s
```

**Open http://localhost:3001** in your browser.

---

## Step 9: Create Your Account

1. Go to http://localhost:3001/register
2. Fill in:
   - Display Name: `Your Name`
   - Organization: `My Home` (or any name)
   - Email: `you@example.com`
   - Password: `yourpassword` (min 8 characters)
3. Click **Create Account**
4. You'll land on the Cameras page

---

## Step 10: Add a Camera

### Option A: Real RTSP Camera

If you have an IP camera on your network:

1. Click **Add Camera**
2. Enter:
   - Name: `Living Room` (any name)
   - Protocol: RTSP
   - URL: `rtsp://CAMERA_IP:554/stream` (your camera's RTSP URL)
3. Click **Add Camera**

### Option B: Demo Test Streams

go2rtc comes with built-in test pattern streams:

1. Click **Add Camera**
2. Enter:
   - Name: `Demo Camera 1`
   - Protocol: RTSP
   - URL: `rtsp://localhost:8554/demo-cam-1`
3. Click **Add Camera**

> **Note (Windows/macOS):** If go2rtc runs in Docker, `localhost` inside Docker differs from your host. The demo streams use ffmpeg test sources inside the container, so they should work. For real LAN cameras, Docker may not reach them — see [Troubleshooting](#troubleshooting).

### Option C: Network Scan

1. Click **Add Camera**
2. Switch to **Scan Network** tab
3. Enter your subnet (e.g., `192.168.1`) or leave empty for auto-detect
4. Click **Scan** — it probes ports 554, 8554, 8080 on your LAN
5. Click **Add** next to any discovered camera

---

## Step 11: View Live Video

1. On the Cameras page, your camera should show a live thumbnail (refreshes every 10s)
2. Click the camera card to open the detail view
3. You should see live video via WebRTC (or MP4 fallback)

---

## Step 12: Test the Event Pipeline

### Simulate a Motion Event

```bash
# Get your auth token (login first)
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# Get your camera ID (from the cameras page URL or API)
CAMERA_ID="your-camera-id-here"

# Simulate motion
curl -X POST http://localhost:3000/api/v1/dev/simulate-motion \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"cameraId\":\"$CAMERA_ID\"}"
```

Or use the **Simulate Motion** button on the Events page (visible in dev mode).

The event will:
- Appear in the Events page
- Show in the Live Event Feed sidebar
- Trigger a browser notification (if permission granted)
- Auto-start a recording (if camera's recording mode is "motion")

---

## Step 13: Start the Mobile App (Optional)

```bash
cd apps/mobile
pnpm install
npx expo start
```

Then:
- Press `i` for iOS Simulator (macOS only)
- Press `a` for Android Emulator
- Scan the QR code with Expo Go app on your phone

> **Important:** On a physical device, change the API URL to your computer's LAN IP:
> Create `apps/mobile/.env` with:
> ```
> EXPO_PUBLIC_API_URL=http://192.168.x.x:3000
> EXPO_PUBLIC_GO2RTC_URL=http://192.168.x.x:1984
> ```

---

## Running Everything at Once

From the project root, use three terminals:

| Terminal | Command | Service |
|----------|---------|---------|
| 1 | `docker compose -f infra/docker/docker-compose.yml up -d redis go2rtc` | Infrastructure |
| 2 | `cd services/gateway && pnpm dev` | API Gateway (port 3000) + WebSocket (port 3002) |
| 3 | `cd apps/web && pnpm dev` | Web Dashboard (port 3001) |

Optional:
| Terminal | Command | Service |
|----------|---------|---------|
| 4 | `cd apps/mobile && npx expo start` | Mobile App |

---

## Seed Demo Data (Optional)

To populate the database with sample cameras, events, and rules:

```bash
# Via API (requires running gateway)
bash scripts/seed-dev.sh

# Or via SQL (direct to Supabase)
# Copy contents of infra/supabase/seed/dev.sql into Supabase SQL Editor
```

To add demo extensions to the marketplace:
```bash
# Copy contents of infra/supabase/seed/extensions.sql into Supabase SQL Editor
```

---

## Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Web Dashboard | http://localhost:3001 | Main UI |
| API Gateway | http://localhost:3000 | REST API |
| WebSocket | ws://localhost:3002 | Real-time events |
| go2rtc | http://localhost:1984 | Camera streams, WebRTC |
| go2rtc RTSP | rtsp://localhost:8554 | RTSP re-stream |
| Redis | redis://localhost:6379 | Cache, pub/sub |

---

## Running Tests

```bash
# Unit tests (shared package — 153 tests)
pnpm --filter @osp/shared test

# Unit tests (gateway — 44 tests)
pnpm --filter @osp/gateway test

# All tests via Turborepo
pnpm test

# E2E tests (requires web app running)
cd apps/web
npx playwright install    # First time only
pnpm test:e2e

# Build check (all packages)
pnpm build
```

---

## Project Structure

```
osp/
├── apps/
│   ├── web/              # Next.js 15 web dashboard
│   └── mobile/           # React Native + Expo mobile app
├── packages/
│   ├── shared/           # Shared types, Zod schemas, API client
│   ├── ui/               # Shared UI components
│   └── sdk/              # Extension SDK
├── services/
│   ├── gateway/          # Hono API gateway + WebSocket
│   ├── camera-ingest/    # Go — camera connection, ONVIF, health
│   ├── video-pipeline/   # Go — FFmpeg recording, R2 storage
│   ├── event-engine/     # Go — rule evaluation, notifications
│   └── extension-runtime/# Go — Wasm sandbox for extensions
├── infra/
│   ├── docker/           # Docker Compose, Dockerfiles, go2rtc config
│   ├── k8s/              # Kubernetes manifests
│   └── supabase/         # SQL migrations, seed data
├── docs/                 # PRD, Architecture, Technical Design, Standards
├── scripts/              # Setup and seed scripts
└── .github/              # CI/CD workflows, PR template
```

---

## Troubleshooting

### "Cannot find module @osp/shared"
Build the shared package first:
```bash
pnpm --filter @osp/shared build
```

### "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
Make sure `.env` exists at the project root with valid Supabase credentials:
```bash
cp .env.example .env
# Then edit .env with your values
```

### Camera shows "OFFLINE" but it's connected
The camera status updates when it's first added. Delete and re-add the camera, or click **Reconnect** on the camera detail page.

### Live video shows "Failed to load HLS stream"
1. Check go2rtc is running: http://localhost:1984
2. Check the camera stream in go2rtc's web UI
3. The video player tries WebRTC first, then falls back to MP4. If both fail, the camera stream may not be connected in go2rtc

### Docker can't reach LAN cameras (macOS/Windows)
Docker Desktop runs in a VM, so containers may not reach your LAN. Solutions:
- **macOS:** go2rtc with `extra_hosts: ["host.docker.internal:host-gateway"]`
- **Windows:** Same as macOS, or use WSL2 with mirrored networking
- **Best option:** Start only Redis in Docker, run go2rtc natively on your host

### "RLS policy violation" on registration
The gateway uses two Supabase clients — make sure `SUPABASE_SERVICE_ROLE_KEY` (not anon key) is set in `.env`. The service role bypasses Row Level Security.

### Port already in use
```bash
# Check what's using the port
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Kill the process or change the port in .env
```

### Windows: "bash: scripts/setup-dev.sh: No such file or directory"
Use Git Bash (comes with Git for Windows) or run the commands manually:
```bash
pnpm install
pnpm --filter @osp/shared build
pnpm --filter @osp/extension-sdk build
docker compose -f infra/docker/docker-compose.yml up -d redis go2rtc
```

---

## What's Next

After setup, explore:
- **Events page** — Filter and acknowledge events
- **Rules page** — Create alert rules (trigger → conditions → actions)
- **Settings** — Manage users, cameras, tenant settings
- **Extensions** — Browse and install marketplace extensions
- **Camera detail** — Draw zones, use PTZ controls, take screenshots
