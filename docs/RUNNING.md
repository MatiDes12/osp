# Running OSP

This document covers how to run OSP in development, staging, and production environments.

---

## Local Development

### 1. Prerequisites

Install the following before starting:

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | https://nodejs.org |
| pnpm | 10+ | `npm install -g pnpm` |
| Go | 1.22+ | https://go.dev/dl |
| Docker | Latest | https://docker.com |
| Supabase CLI | Latest | `brew install supabase/tap/supabase` |
| FFmpeg | Latest | `brew install ffmpeg` |

### 2. Environment Setup

```bash
# Clone and enter the project
git clone https://github.com/MatiDes12/osp.git
cd osp

# Install Node dependencies
pnpm install

# Copy environment variables
cp .env.example .env
```

Edit `.env` with your local values. For local development, the defaults in `.env.example` work with the Docker Compose setup.

### 3. Start Infrastructure

Redis and go2rtc run in Docker:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

Verify they are running:

```bash
docker compose -f infra/docker/docker-compose.yml ps
```

You should see:
- `redis` -- healthy on port 6379
- `go2rtc` -- running on ports 1984 (API), 8554 (RTSP), 8555 (WebRTC)

### 4. Start Supabase

```bash
cd infra/supabase
supabase start
```

This gives you:
- PostgreSQL on port 54322
- Supabase Studio at http://localhost:54323
- Auth, Realtime, and Storage running locally

Copy the output `anon key` and `service_role key` into your `.env` file.

### 5. Start All Services

```bash
pnpm dev
```

Turborepo starts everything in parallel:

| Service | URL | Description |
|---------|-----|-------------|
| Web Dashboard | http://localhost:3001 | Next.js frontend |
| API Gateway | http://localhost:3000 | Hono REST/WebSocket API |
| go2rtc | http://localhost:1984 | Camera proxy admin |
| Supabase Studio | http://localhost:54323 | Database admin |

### 6. Start Go Services (Optional)

The Go services are not started by `pnpm dev`. Run them individually:

```bash
# Terminal 1
cd services/camera-ingest && go run ./cmd/server/

# Terminal 2
cd services/video-pipeline && go run ./cmd/server/

# Terminal 3
cd services/event-engine && go run ./cmd/server/

# Terminal 4
cd services/extension-runtime && go run ./cmd/server/
```

Or run all four with a simple script:

```bash
for svc in camera-ingest video-pipeline event-engine extension-runtime; do
  (cd services/$svc && go run ./cmd/server/) &
done
wait
```

---

## Docker (Full Stack)

Run the entire stack in Docker without installing Go or Node locally.

### Development Build

```bash
docker compose -f infra/docker/docker-compose.yml up --build
```

### Production Build

```bash
# Set the version
export VERSION=latest

# Build and run
docker compose -f infra/docker/docker-compose.prod.yml up -d
```

### Building Individual Images

```bash
# Gateway (from repo root)
docker build -f infra/docker/gateway.Dockerfile -t osp-gateway .

# Web (from repo root)
docker build -f infra/docker/web.Dockerfile -t osp-web .

# Go services (from service directory)
docker build -t osp-camera-ingest services/camera-ingest/
docker build -t osp-video-pipeline services/video-pipeline/
docker build -t osp-event-engine services/event-engine/
docker build -t osp-extension-runtime services/extension-runtime/
```

### Docker Image Registry

Production images are published to GitHub Container Registry on every push to `main` and on version tags:

```bash
docker pull ghcr.io/matides12/osp-gateway:latest
docker pull ghcr.io/matides12/osp-camera-ingest:latest
docker pull ghcr.io/matides12/osp-video-pipeline:latest
docker pull ghcr.io/matides12/osp-event-engine:latest
docker pull ghcr.io/matides12/osp-web:latest
```

---

## Running Tests

### TypeScript

```bash
# All tests
pnpm test

# Single package
pnpm --filter @osp/web test
pnpm --filter @osp/gateway test
pnpm --filter @osp/shared test

# Watch mode
pnpm --filter @osp/gateway test -- --watch

# With coverage report
pnpm test -- --coverage
```

### Go

```bash
# Single service
cd services/camera-ingest
go test ./...

# With race detection and coverage
go test -v -race -coverprofile=coverage.out ./...
go tool cover -html=coverage.out -o coverage.html

# All Go services
for svc in camera-ingest video-pipeline event-engine extension-runtime; do
  echo "Testing $svc..."
  (cd services/$svc && go test -race ./...)
done
```

### Integration Tests

Integration tests hit real Supabase and Redis. Make sure infrastructure is running first.

```bash
pnpm test:integration
```

### End-to-End Tests

E2E tests use Playwright against the running web app.

```bash
# Install browsers (first time only)
pnpm exec playwright install chromium

# Run tests
pnpm exec playwright test

# Run with UI mode
pnpm exec playwright test --ui

# Run a specific test file
pnpm exec playwright test tests/e2e/camera-management.spec.ts
```

---

## Database Migrations

Migrations live in `infra/supabase/migrations/`.

### Create a New Migration

```bash
cd infra/supabase
supabase migration new add_camera_zones_table
```

This creates a timestamped SQL file in the migrations directory. Write your SQL there.

### Apply Migrations Locally

```bash
cd infra/supabase
supabase db reset
```

This drops and recreates the local database, applying all migrations from scratch.

### Apply to Production

```bash
cd infra/supabase
supabase db push --linked
```

The CI pipeline also validates migrations on every PR that touches the `infra/supabase/migrations/` directory.

---

## Adding a Camera (Development)

Once the services are running, you can add a test camera:

1. Open go2rtc admin at http://localhost:1984
2. Add an RTSP stream (or use a test stream):

```bash
# Add via go2rtc API
curl -X PUT http://localhost:1984/api/streams \
  -H "Content-Type: application/json" \
  -d '{"test-camera": {"sources": ["rtsp://your-camera-ip:554/stream"]}}'
```

3. Verify the stream in the web dashboard at http://localhost:3001

For testing without a physical camera, you can use FFmpeg to create a test RTSP stream:

```bash
ffmpeg -re -f lavfi -i testsrc=size=640x480:rate=30 \
  -f lavfi -i sine=frequency=1000 \
  -vcodec libx264 -preset ultrafast -tune zerolatency \
  -f rtsp rtsp://localhost:8554/test
```

---

## Troubleshooting

**pnpm install fails**
- Make sure you are using pnpm 10+: `pnpm --version`
- Delete `node_modules` and `pnpm-lock.yaml`, then reinstall

**Docker containers not starting**
- Check Docker is running: `docker info`
- Check port conflicts: `lsof -i :6379` (Redis), `lsof -i :1984` (go2rtc)

**Supabase won't start**
- Check Docker has enough resources (4GB+ RAM recommended)
- Run `supabase stop` then `supabase start` to reset

**Go services fail to build**
- Ensure Go 1.22+: `go version`
- Run `go mod tidy` in the service directory

**Camera stream not showing**
- Verify go2rtc is running: `curl http://localhost:1984/api/streams`
- Check RTSP URL is accessible: `ffprobe rtsp://camera-ip:554/stream`
- Check browser console for WebRTC errors

**CI failing on PR**
- Run `pnpm lint` and `pnpm type-check` locally before pushing
- Check Go linting: `cd services/<name> && golangci-lint run`

---

## Environment Variables Reference

See `.env.example` for all variables. Key groups:

| Group | Variables | Required for |
|-------|-----------|-------------|
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | All environments |
| Redis | `REDIS_URL` | All environments |
| Storage | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Recording/playback |
| go2rtc | `GO2RTC_API_URL` | Camera streaming |
| Gateway | `GATEWAY_PORT`, `GATEWAY_CORS_ORIGINS` | API server |
| Go Services | `INGEST_GRPC_PORT`, `VIDEO_GRPC_PORT`, `EVENT_GRPC_PORT`, `EXTENSION_GRPC_PORT` | Service communication |
| Push Notifications | `APNS_KEY_ID`, `APNS_TEAM_ID`, `FCM_SERVER_KEY` | Mobile alerts |
| Email | `SENDGRID_API_KEY`, `EMAIL_FROM` | Email alerts |
