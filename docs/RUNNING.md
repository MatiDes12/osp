# Running OSP

Two ways to run OSP: **Docker** (recommended, runs everything) or **local** (faster iteration on gateway/frontend).

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Docker Desktop | Latest | Required for both methods |
| Node.js | 20+ | Local dev only |
| pnpm | 10+ | Local dev only — `npm i -g pnpm` |
| Go | 1.22+ | Local dev only, for Go services |

---

## Method 1 — Docker (Recommended)

Runs the full stack in containers. No Node or Go installation needed.

### First-time setup

```bash
# Clone the repo
git clone https://github.com/MatiDes12/osp.git
cd osp

# Copy the env file — fill in your Supabase and R2 credentials
cp .env.example .env
```

**Required values in `.env`:**
```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
```

> Use the **direct connection** URL (port 5432), not the pooler (port 6543).
> Get it from: Supabase Dashboard → Settings → Database → Connection string → URI.

### Build and run

```bash
cd infra/docker
docker compose build
docker compose up -d
```

### Rebuild after code changes

```bash
# Rebuild only what changed
docker compose build gateway
docker compose build event-engine video-pipeline

# Or rebuild everything
docker compose build --no-cache

# Apply and restart
docker compose up -d
```

### View logs

```bash
docker compose logs -f gateway
docker compose logs -f camera-ingest
docker compose logs -f          # all services
```

### Stop

```bash
docker compose down
```

### Service URLs (Docker)

| Service | URL |
|---------|-----|
| API Gateway | http://localhost:3000 |
| go2rtc admin | http://localhost:1984 |
| RTSP | rtsp://localhost:8554 |
| WebRTC | :8555 |
| Redis | localhost:6379 |

> The web dashboard (`apps/web`) is **not** in Docker. Run it locally with `pnpm dev` from the repo root, or deploy it separately (Vercel, etc.).

---

## Method 2 — Local Dev (Gateway + Frontend)

Run the gateway and web app directly on your machine with Docker providing Redis and go2rtc only.

### Start Docker infrastructure

```bash
cd infra/docker
docker compose up -d redis go2rtc
```

### Install dependencies

```bash
# From repo root
pnpm install
```

### Start the gateway

```bash
cd services/gateway
pnpm dev
```

The gateway reads `.env` from the repo root automatically. It will connect to:
- Supabase cloud (from `SUPABASE_URL` in `.env`)
- Redis at `localhost:6379` (Docker)
- go2rtc at `localhost:1984` (Docker)

### Start the web dashboard

```bash
cd apps/web
pnpm dev
```

Opens at http://localhost:3001.

### Start Go services (optional)

Go services are only needed for video recording and event rule evaluation. The gateway falls back to direct mode without them.

```bash
# Each in its own terminal
cd services/camera-ingest   && go run ./cmd/server/
cd services/video-pipeline  && go run ./cmd/server/
cd services/event-engine    && go run ./cmd/server/
cd services/extension-runtime && go run ./cmd/server/
```

### Local dev URLs

| Service | URL |
|---------|-----|
| Web dashboard | http://localhost:3001 |
| API Gateway | http://localhost:3000 |
| go2rtc admin | http://localhost:1984 |
| Supabase dashboard | https://supabase.com/dashboard (cloud) |

---

## Database

OSP uses **Supabase cloud** as the primary database in all environments.

### Apply migrations to cloud

```bash
# From repo root
npx supabase@2.82.0 db push --db-url "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
```

### Create a new migration

```bash
npx supabase@2.82.0 migration new my_migration_name
# Edit the created file in infra/supabase/migrations/
npx supabase@2.82.0 db push --db-url "postgresql://..."
```

### View the database

Open the [Supabase Dashboard](https://supabase.com/dashboard) → your project → Table Editor.

---

## Production Deployment

Production runs the same Docker images as local. The only difference is the environment variables.

### Server requirements

- Linux VPS or VM with Docker installed
- 2GB RAM minimum (4GB recommended for all services)
- Ports open: 3000 (gateway), 1984 (go2rtc admin), 8554 (RTSP), 8555 (WebRTC)

### Deploy

```bash
# On your server — clone the repo and create .env
git clone https://github.com/MatiDes12/osp.git
cd osp
cp .env.example .env
nano .env   # fill in production credentials

# Build and start
cd infra/docker
docker compose build
docker compose up -d

# Check all services are up
docker compose ps
docker compose logs -f
```

### Recommended `.env` values for production

```bash
NODE_ENV=production

# Supabase — use your cloud project
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres

# Redis — uses the Docker container (already set in docker-compose)
# REDIS_URL is set to redis://redis:6379 automatically inside containers

# Cloudflare R2 — for video storage
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=osp-recordings

# go2rtc — set to your server's public IP for WebRTC to work from outside
GO2RTC_PUBLIC_URL=http://<your-server-ip>:1984
```

### Keep services running (auto-restart)

All Docker Compose services are configured with `restart: unless-stopped`, so they survive reboots automatically as long as Docker starts on boot:

```bash
# Enable Docker to start on boot (Linux)
sudo systemctl enable docker
```

### Update to latest code

```bash
git pull
cd infra/docker
docker compose build --no-cache gateway
docker compose up -d
```

---

## Environment Variables Reference

Variables are loaded from `.env` in the repo root. **Do not** set infrastructure URLs (`REDIS_URL`, `GO2RTC_URL`, gRPC addresses) in the `config_secrets` database table — those must come from environment only so Docker networking works correctly.

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project API URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `DATABASE_URL` | Yes (Go services) | Direct Postgres connection (port 5432, not 6543) |
| `R2_ENDPOINT` | For recording | Cloudflare R2 endpoint |
| `R2_ACCESS_KEY_ID` | For recording | R2 access key |
| `R2_SECRET_ACCESS_KEY` | For recording | R2 secret key |
| `R2_BUCKET_NAME` | For recording | R2 bucket name |
| `API_TOKEN` | Yes | Shared secret between gateway and camera-ingest |
| `RESEND_API_KEY` | For email alerts | Resend API key |
| `FCM_SERVER_KEY` | For push alerts | Firebase Cloud Messaging key |

Variables set automatically by Docker Compose (do not override):

| Variable | Value inside Docker |
|----------|-------------------|
| `REDIS_URL` | `redis://redis:6379` |
| `GO2RTC_URL` | `http://go2rtc:1984` |
| `GO2RTC_API_URL` | `http://go2rtc:1984` |
| `CAMERA_INGEST_GRPC_URL` | `camera-ingest:50051` |
| `VIDEO_PIPELINE_GRPC_URL` | `video-pipeline:50052` |
| `EVENT_ENGINE_GRPC_URL` | `event-engine:50053` |

---

## Troubleshooting

**`ECONNREFUSED` on Redis inside Docker**
The config_secrets table must not have a `REDIS_URL` entry — if it does, it overrides the docker-compose environment value. Delete it:
```bash
curl -X DELETE "https://<ref>.supabase.co/rest/v1/config_secrets?scope=eq.global&key=in.(REDIS_URL,GO2RTC_URL,GO2RTC_API_URL)" \
  -H "apikey: <service_role_key>" \
  -H "Authorization: Bearer <service_role_key>"
```

**`Cannot find package 'dotenv'` in gateway**
The pnpm workspace symlinks broke. Rebuild with `--no-cache`:
```bash
docker compose build --no-cache gateway
```

**`FATAL: Tenant or user not found` in Go services**
You are using the Supabase transaction pooler URL (port 6543). Switch `DATABASE_URL` to the direct connection (port 5432):
```
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
```

**Proto file not found on startup**
The proto files weren't copied to `dist/`. Rebuild the gateway image:
```bash
docker compose build --no-cache gateway
```

**go2rtc camera stream not loading**
```bash
# Check go2rtc sees the stream
curl http://localhost:1984/api/streams

# Test RTSP URL directly
ffprobe rtsp://<camera-ip>:554/stream

# Check browser console for WebRTC ICE errors
```

**Docker build fails on pnpm deploy**
pnpm v10 requires `--legacy` flag for deploy. This is already set in `gateway.Dockerfile`. If you see the error, ensure you have the latest Dockerfile.
