# OSP — Open Surveillance Platform

**A complete, standalone surveillance system that works out of the box — and an open platform you can extend.**

OSP provides professional-grade camera management, live monitoring, recording, motion detection, and alerting for any scale — from a single home camera to thousands across enterprise sites. Connects to any camera (Ring, Arlo, Wyze, Hikvision, Dahua, ONVIF, RTSP, USB/IP). Runs on web, mobile, and desktop.

---

## Key Features

- **Live View** — <500ms WebRTC streaming, grid layout, PTZ controls
- **Recording & Playback** — Continuous and motion-triggered, timeline scrubber, clip export
- **Motion Detection** — Configurable sensitivity, per-zone settings, AI-powered object detection
- **Alerts & Rules** — Visual rule builder, push/email/webhook/recording actions
- **Any Camera** — RTSP, ONVIF auto-discovery, USB/IP — no vendor lock-in
- **Multi-Tenant** — Scoped cameras, users, and data with Supabase RLS
- **Extensions** — TypeScript SDK with hooks, marketplace, custom AI models

---

## Tech Stack

| Layer         | Technology                              |
| ------------- | --------------------------------------- |
| Web           | Next.js 15, Tailwind CSS, shadcn/ui     |
| Mobile        | React Native, Expo                      |
| Desktop       | Tauri v2                                |
| API Gateway   | Hono, Bun                               |
| Core Services | Go 1.22                                 |
| Video         | go2rtc + FFmpeg                         |
| Database      | Supabase (PostgreSQL + Auth + Realtime) |
| Cache         | Redis                                   |
| Storage       | Cloudflare R2                           |

---

## Documentation

| Document                                                     | Description                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| [docs/guide.md](docs/guide.md)                               | How to run OSP — web, mobile, desktop, Docker, deployment            |
| [docs/reference.md](docs/reference.md)                       | Full technical reference — architecture, API, data models, standards |
| [docs/PRODUCTION-CHECKLIST.md](docs/PRODUCTION-CHECKLIST.md) | Pre-launch checklist                                                 |
| [TODO.md](TODO.md)                                           | Master task list and project handoff document                        |

---

## Quick Start

```bash
git clone https://github.com/MatiDes12/osp.git
cd osp
pnpm install
pnpm --filter @osp/shared build
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
docker compose -f infra/docker/docker-compose.yml up -d redis go2rtc
# Terminal 1:
cd services/gateway && pnpm dev   # API on :3000
# Terminal 2:
cd apps/web && pnpm dev           # Web on :3001
```

See [docs/guide.md](docs/guide.md) for the full setup walkthrough including mobile, desktop, and production deployment.

---

## Contributing

1. Fork the repository
2. Create a feature branch — `git checkout -b feat/your-feature`
3. Follow the [coding standards](docs/reference.md#16-coding-standards)
4. Write tests (80% coverage target)
5. Open a pull request

---

## License

MIT
