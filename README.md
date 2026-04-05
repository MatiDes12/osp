# OSP — Open Surveillance Platform

**A complete, production-ready surveillance system — and an open platform you can extend.**

OSP provides professional-grade camera management, live monitoring, recording, motion detection, and alerting for any scale — from a single home camera to thousands across enterprise sites. Connects to any camera (Ring, Arlo, Wyze, Hikvision, Dahua, ONVIF, RTSP, USB/IP). Runs on web, mobile (iOS/Android), and desktop (Windows/Mac/Linux).

🌐 **Live demo**: https://osp-web-eight.vercel.app

---

## Features

| Category             | What's included                                                                      |
| -------------------- | ------------------------------------------------------------------------------------ |
| **Live View**        | <500ms WebRTC streaming, 8 grid layouts, PTZ controls, two-way audio                 |
| **Recording**        | Continuous + motion-triggered, timeline scrubber, R2/S3 storage, clip export         |
| **Motion Detection** | Per-zone sensitivity, 1fps pixel-diff, AI object detection (OpenAI Vision)           |
| **Alerts & Rules**   | Visual rule builder, push / email / webhook / recording actions                      |
| **Camera Support**   | RTSP, ONVIF auto-discovery, USB/IP, go2rtc universal proxy                           |
| **Multi-Tenant**     | Full RLS isolation — cameras, users, and data scoped per tenant                      |
| **Extensions**       | TypeScript SDK, sandboxed runtime, marketplace with 8 demo extensions                |
| **Analytics**        | ClickHouse event/recording analytics, heatmaps, camera activity charts               |
| **AI Extras**        | License plate recognition (PlateRecognizer), SSO (Google / Microsoft / GitHub)       |
| **Edge Agents**      | On-prem Go binary, BoltDB offline buffer, cloud sync when reconnected                |
| **Desktop App**      | Tauri v2 — system tray, native notifications, auto-start, minimize to tray           |
| **Mobile App**       | React Native/Expo — iOS + Android, live view, events, recordings, push notifications |
| **Error Monitoring** | Sentry on web + gateway, source maps, session replay, tunnel route                   |

---

## Tech Stack

| Layer         | Technology                                                                           |
| ------------- | ------------------------------------------------------------------------------------ |
| Web           | Next.js 15 (App Router), Tailwind CSS, shadcn/ui                                     |
| Mobile        | React Native, Expo                                                                   |
| Desktop       | Tauri v2                                                                             |
| API Gateway   | Hono on Bun (TypeScript)                                                             |
| Core Services | Go 1.22 (camera-ingest, video-pipeline, event-engine, extension-runtime, edge-agent) |
| Video         | go2rtc + FFmpeg (RTSP/ONVIF/WebRTC/HLS)                                              |
| Database      | Supabase (PostgreSQL + Auth + Realtime + RLS)                                        |
| Cache         | Redis                                                                                |
| Storage       | Cloudflare R2                                                                        |
| Analytics     | ClickHouse                                                                           |
| Monitoring    | Sentry                                                                               |

---

## Quick Start

```bash
git clone https://github.com/MatiDes12/osp.git
cd osp
pnpm install
pnpm --filter @osp/shared build
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
docker compose -f infra/docker/docker-compose.yml up -d redis go2rtc
```

```bash
# Terminal 1 — API gateway on :3000
cd services/gateway && pnpm dev

# Terminal 2 — Web dashboard on :3001
cd apps/web && pnpm dev
```

Open http://localhost:3001 and register your first account.

See [docs/CLIENT_SETUP.md](docs/CLIENT_SETUP.md) for the full setup walkthrough including mobile, desktop, and Docker.

---

## Documentation

| Document                                                     | Description                                            |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| [docs/CLIENT_SETUP.md](docs/CLIENT_SETUP.md)                 | Setup guide — web, mobile, desktop, Docker, deployment |
| [docs/PRODUCTION-CHECKLIST.md](docs/PRODUCTION-CHECKLIST.md) | Pre-launch checklist                                   |
| [docs/RUNBOOK.md](docs/RUNBOOK.md)                           | Deployment, health checks, rollback procedures         |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)                 | How to contribute                                      |
| [docs/HANDOFF.md](docs/HANDOFF.md)                           | Full feature inventory and project handoff             |

---

## Download

| Platform         | Status                                                      |
| ---------------- | ----------------------------------------------------------- |
| Windows (`.msi`) | [Latest release](https://github.com/MatiDes12/osp/releases) |
| macOS (`.dmg`)   | [Latest release](https://github.com/MatiDes12/osp/releases) |
| Linux (`.deb`)   | [Latest release](https://github.com/MatiDes12/osp/releases) |
| iOS              | Coming soon                                                 |
| Android          | Coming soon                                                 |

---

## CI/CD

| Workflow         | Trigger                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `ci.yml`         | Every push / PR — lint, type-check, tests, build                     |
| `e2e.yml`        | Push/PR to main — Playwright E2E                                     |
| `deploy.yml`     | Push to main — Fly.io services + Vercel web                          |
| `production.yml` | GitHub release published — DB migration + full deploy + Slack notify |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Follow the conventions in `CLAUDE.md`
4. Write tests (80% coverage target)
5. Open a pull request

---

## License

MIT
