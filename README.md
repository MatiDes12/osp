# OSP — Open Surveillance Platform

**A complete, standalone surveillance system that works out of the box — and an open platform you can extend.**

OSP provides professional-grade camera management, live monitoring, recording, motion detection, and alerting for any scale, from a single home camera to thousands across enterprise sites. It connects to any camera (Ring, Arlo, Wyze, Hikvision, Dahua, ONVIF, RTSP, USB/IP) and runs on web, mobile, and desktop.

What makes OSP different: it's both a **product** and a **platform**. You don't need extensions to get a fully-featured surveillance system. But when you want more, the extension layer lets you add custom rules, AI models, notification channels, analytics widgets, and white-label theming — or build and sell plugins in the marketplace.

---

## Key Features

- **Live View** — Low-latency (<500ms) streaming via WebRTC, grid layout, full-screen, PTZ controls
- **Recording & Playback** — Continuous and motion-triggered recording, timeline scrubber, clip export
- **Motion Detection** — Built-in detection with configurable sensitivity and zones
- **Alerts & Notifications** — Push (mobile), email, and webhook notifications for motion/offline events
- **Multi-Tenant** — Tenant isolation with scoped cameras, users, and data
- **Role-Based Access Control** — Admin, Operator, and Viewer roles with granular permissions
- **Any Camera, Any Brand** — RTSP, ONVIF auto-discovery, WebRTC, USB/IP — no vendor lock-in
- **Extension SDK** — TypeScript SDK with hook points for custom integrations and plugins
- **Cross-Platform** — Next.js web dashboard, React Native mobile app (iOS + Android), Tauri desktop (planned)

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
| Database | Supabase (PostgreSQL + Auth + Realtime) |
| Cache | Redis |
| Object Storage | Cloudflare R2 |
| Monorepo | pnpm workspaces, Turborepo |
| CI/CD | GitHub Actions |
| Containers | Docker |

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 10+
- Go 1.22+
- Docker and Docker Compose
- Supabase CLI

### Using Docker Compose

```bash
git clone https://github.com/MatiDes12/osp.git
cd osp
cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up --build
```

### Local Development

```bash
git clone https://github.com/MatiDes12/osp.git
cd osp
pnpm install
cp .env.example .env

# Start infrastructure (Redis, go2rtc)
docker compose -f infra/docker/docker-compose.yml up -d

# Start Supabase locally
cd infra/supabase && supabase start && cd ../..

# Start all services
pnpm dev
```

This starts:
- Web dashboard at `http://localhost:3001`
- API gateway at `http://localhost:3000`
- go2rtc API at `http://localhost:1984`

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
└── tests/                   # E2E and integration tests
```

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

## Contributing

Contributions are welcome. To get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Follow the [consistency standards](docs/CONSISTENCY-STANDARDS.md)
4. Write tests first (TDD), aim for 80% coverage
5. Open a pull request using the PR template

---

## License

MIT
