# Open Surveillance Platform (OSP)

A cross-platform surveillance camera application that connects to any camera type and lets customers customize it for their specific use case -- home, retail, mall, or enterprise.

OSP is not another camera viewer. The core value is the **extension layer**: a plugin system that allows anyone to add custom alert rules, AI models, analytics widgets, and notification channels on top of a universal camera management platform.

---

## Architecture

```
                    +------------------+
                    |   Web (Next.js)  |
                    |  Mobile (Expo)   |
                    +--------+---------+
                             |
                      WebSocket / REST
                             |
                    +--------+---------+
                    |  API Gateway     |
                    |  (Hono / Bun)    |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------+---+  +------+------+  +----+--------+
     | Camera     |  | Video       |  | Event       |
     | Ingest (Go)|  | Pipeline(Go)|  | Engine (Go) |
     +--------+---+  +------+------+  +----+--------+
              |              |              |
         +----+----+    +---+---+    +-----+-----+
         | go2rtc  |    | FFmpeg|    | Extension  |
         | (proxy) |    |       |    | Runtime(Go)|
         +---------+    +---+---+    +-----------+
                            |
                    +-------+--------+
                    | Cloudflare R2  |
                    | (video storage)|
                    +----------------+

         Database: Supabase (PostgreSQL + Auth + Realtime)
         Cache: Redis
```

**Frontend** -- Next.js 15 web dashboard, React Native mobile app (iOS/Android), Tauri desktop (planned).

**Backend** -- Hono/Bun API gateway handles REST and WebSocket. Four Go microservices handle camera connections, video processing, event rules, and extension sandboxing.

**Video** -- go2rtc proxies all camera protocols (RTSP, ONVIF, WebRTC). FFmpeg handles transcoding and HLS packaging. Clips stored in Cloudflare R2.

**Data** -- Supabase PostgreSQL with Row Level Security for multi-tenant isolation. Redis for caching and pub/sub.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web | Next.js 15, Tailwind CSS, shadcn/ui, Zustand, TanStack Query |
| Mobile | React Native, Expo |
| API Gateway | Hono, Bun |
| Core Services | Go 1.22 |
| Video Proxy | go2rtc |
| Transcoding | FFmpeg |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Cache | Redis |
| Object Storage | Cloudflare R2 |
| Monorepo | pnpm workspaces, Turborepo |
| CI/CD | GitHub Actions |
| Containers | Docker |

---

## Project Structure

```
osp/
├── apps/
│   ├── web/                 # Next.js dashboard
│   ├── mobile/              # React Native + Expo
│   └── desktop/             # Tauri (Phase 2)
├── packages/
│   ├── shared/              # Shared types, schemas, API client
│   ├── ui/                  # Shared UI components
│   └── sdk/                 # Extension SDK
├── services/
│   ├── gateway/             # Hono API gateway (TypeScript)
│   ├── camera-ingest/       # Camera connection management (Go)
│   ├── video-pipeline/      # Transcoding, recording, storage (Go)
│   ├── event-engine/        # Rule evaluation, notifications (Go)
│   └── extension-runtime/   # Sandboxed extension execution (Go)
├── infra/
│   ├── docker/              # Dockerfiles, docker-compose
│   ├── k8s/                 # Kubernetes manifests
│   └── supabase/            # Migrations, RLS policies, seeds
├── docs/                    # Architecture and design docs
└── .github/                 # CI/CD workflows, templates
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Go 1.22+
- Docker and Docker Compose
- Supabase CLI (for local database)

### Setup

1. Clone the repository:

```bash
git clone https://github.com/MatiDes12/osp.git
cd osp
```

2. Install dependencies:

```bash
pnpm install
```

3. Copy the environment file and fill in your values:

```bash
cp .env.example .env
```

4. Start infrastructure (Redis, go2rtc):

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

5. Start Supabase locally:

```bash
cd infra/supabase
supabase start
cd ../..
```

6. Run the development servers:

```bash
pnpm dev
```

This starts all services through Turborepo:
- Web dashboard at `http://localhost:3001`
- API gateway at `http://localhost:3000`
- go2rtc API at `http://localhost:1984`

### Running Go Services Individually

```bash
cd services/camera-ingest
go run ./cmd/server/

cd services/video-pipeline
go run ./cmd/server/

cd services/event-engine
go run ./cmd/server/

cd services/extension-runtime
go run ./cmd/server/
```

---

## Development

### Commands

```bash
pnpm dev              # Start all services
pnpm build            # Build all packages
pnpm lint             # Run ESLint across all packages
pnpm type-check       # TypeScript type checking
pnpm test             # Run unit tests
pnpm test:integration # Run integration tests
pnpm format           # Format code with Prettier
```

### Running Tests

TypeScript tests use Vitest. Go tests use the standard `go test` toolchain.

```bash
# All TypeScript tests
pnpm test

# Single package
pnpm --filter @osp/web test
pnpm --filter @osp/gateway test

# Go service tests
cd services/camera-ingest && go test -v ./...
cd services/video-pipeline && go test -v -race ./...

# E2E tests (requires running services)
pnpm exec playwright test
```

### Docker

Build and run the full stack locally:

```bash
# Development
docker compose -f infra/docker/docker-compose.yml up --build

# Production-like
docker compose -f infra/docker/docker-compose.prod.yml up
```

Build a single service image:

```bash
docker build -f infra/docker/gateway.Dockerfile -t osp-gateway .
docker build -f services/camera-ingest/Dockerfile -t osp-camera-ingest services/camera-ingest/
```

---

## CI/CD

All workflows run on GitHub Actions. See `.github/workflows/` for the full configuration.

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| CI | Push/PR | Lint, type-check, unit tests, Go vet, security audit |
| E2E | Push/PR to main | Playwright end-to-end tests |
| Docker | Push to main, tags | Build and push images to GHCR |
| Preview | PR | Deploy preview environment, comment URL on PR |
| Release | Tag (v*) | Build binaries, create GitHub Release |
| Production | Release published | Run migrations, deploy, health check, notify |
| CodeQL | Push/PR, weekly | Security analysis for TypeScript and Go |
| Dependency Review | PR | Block high-severity or restricted-license deps |
| Supabase Migrate | PR (migration files) | Validate migrations apply cleanly |

### Creating a Release

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers the release workflow which builds cross-platform binaries, creates Docker images, and publishes a GitHub Release with a changelog.

---

## Configuration

All configuration is through environment variables. See `.env.example` for the full list.

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key (client-facing) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service key (server-side only) |
| `REDIS_URL` | Redis connection string |
| `R2_ENDPOINT` | Cloudflare R2 endpoint |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket for video storage |
| `GO2RTC_API_URL` | go2rtc API endpoint |

---

## Extension System

OSP supports custom extensions that hook into the event pipeline. Extensions can add alert rules, notification channels, analytics widgets, and AI models.

```typescript
// Example extension
import { defineExtension } from "@osp/extension-sdk";

export default defineExtension({
  name: "slack-alerts",
  version: "1.0.0",
  hooks: {
    onMotionDetected: async (event) => {
      await sendSlackMessage(event.cameraName, event.snapshot);
    },
  },
});
```

Hook points: `onMotionDetected`, `onPersonDetected`, `onCameraOffline`, `onRecordingComplete`, `onAlertTriggered`.

See `packages/sdk/` for the full SDK and `docs/` for the extension architecture.

---

## Documentation

| Document | Description |
|----------|-------------|
| [PRD](docs/PRD.md) | Product requirements, personas, feature matrix |
| [System Architecture](docs/SYSTEM-ARCHITECTURE.md) | Service boundaries, diagrams, trade-offs |
| [Technical Design](docs/TECHNICAL-DESIGN.md) | Data models, API design, video pipeline |
| [Consistency Standards](docs/CONSISTENCY-STANDARDS.md) | Naming conventions, error handling, testing |
| [Planning](PLANNING.md) | Combined planning document |

---

## Roadmap

**Phase 1 (MVP)** -- RTSP/ONVIF cameras, live view via WebRTC, motion-triggered recording, basic alerts, web dashboard, mobile app, multi-tenant with RBAC.

**Phase 2** -- Visual rule engine, Extension SDK and marketplace, AI detection (person/vehicle/animal), desktop app via Tauri, ClickHouse analytics.

**Phase 3** -- Enterprise features, compliance and audit logging, SSO, white-label theming, SLA monitoring.

**Phase 4** -- Edge computing, custom AI model deployment, federated camera networks.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/add-ptz-controls`)
3. Follow the [consistency standards](docs/CONSISTENCY-STANDARDS.md)
4. Write tests first (TDD), aim for 80% coverage
5. Open a pull request using the PR template

---

## License

MIT
