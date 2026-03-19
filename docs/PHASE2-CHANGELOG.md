# OSP Phase 2 — Changelog

Phase 2 builds on the Phase 1 MVP to add intelligence, extensibility, and cross-platform support.

---

## Camera Detection

### USB + Wired Camera Detection
- **USB cameras**: Probes go2rtc for ffmpeg device sources at indices 0–4
- **Wired cameras**: Extended network scan (ports 37777, 34567, 8000 for Dahua, XMEye, Hikvision)
- **Add Camera dialog**: "Detect Cameras" tab shows USB + network sections separately
- **USB protocol**: Manual form supports USB protocol with device index picker
- **Schema**: `CreateCameraSchema` auto-generates `ffmpeg:device?video={n}#video=h264` URI

### Real Connection Testing
- **Test Connection button**: Actually tests the camera — registers a temp stream in go2rtc, waits for producers, grabs a JPEG snapshot
- **Shows**: Live snapshot preview, codec (e.g. H264), resolution (e.g. 1920×1080)
- **On failure**: Real error message from go2rtc (not a fake success)

---

## AI Detection

### OpenAI Vision Integration
- **`ai-detection.service.ts`**: Analyzes JPEG frames using OpenAI Vision API
- **Graceful degradation**: Returns empty results if `AI_PROVIDER=none`
- **Event pipeline**: Motion events trigger AI analysis; detections create typed events
- **Event badges**: Person/vehicle/animal confidence badges on events page
- **Health endpoint**: Reports AI detection status

### Configuration
```env
AI_PROVIDER=openai  # none | openai
OPENAI_API_KEY=sk-...
```

---

## Recording

### Continuous Recording Mode
- Auto-starts recording when camera's `recordingMode` is `"continuous"`
- Auto-segments every 30 minutes (prevents huge files)
- Triggers on camera creation/reconnect

### Real Video Recording
- Captures actual MP4 from go2rtc stream
- Background fetch streams video to local disk
- `GET /api/v1/recordings/:id/play` serves saved file with Range support (seeking)
- Camera grid shows pulsing REC badge during recording

---

## Extensions

### JS Extension Runner
- `extension-runner.ts`: Logs hook invocations, returns success (Phase 2 placeholder)
- Wired into the action executor for `extension_hook` actions
- **Phase 3**: Will execute extensions in Wasm/V8 sandbox with resource limits

### Extension Marketplace
- 8 demo extensions seeded
- Install/uninstall from settings UI
- Extension config forms

---

## Floor Plans & Locations

### Floor Plan Editor
- Full canvas-based 2D/ISO editor in the browser
- Draw rooms, walls, doors, windows, furniture, labels
- Place cameras on the floor plan with linking
- Undo/redo, zoom, snap-to-grid
- PNG export

### Floor Plan Viewer
- Mini preview component for camera detail page
- Shows current camera's position highlighted in blue
- Links to full floor plan

### Location Management
- CRUD for locations with address, timezone, coordinates
- Multi-location camera filtering on cameras page
- Camera location badge on camera cards

---

## Mobile App (Phase 2)

### Live Thumbnails
- Camera cards show MJPEG snapshots from go2rtc (5s refresh)
- Status dot: green=online, amber=connecting, gray=offline

### Recording Controls
- Dedicated recording screen (`/camera/[id]/record`)
- Start/stop with live timer display
- Calls real API endpoints

### Push Notifications
- Expo push token registration
- Notification handlers for foreground alerts
- Ready for APNs/FCM in production

### Offline Mode
- Offline detection banner (connectivity check every 30s)
- Shows cached data when offline

---

## Desktop App (Tauri v2)

### Scaffold
- `apps/desktop/` with Tauri v2 configuration
- Points to Next.js web app dev server
- Ready for native platform features (Phase 3)

---

## Production Readiness

### Environment Validation
- `env.ts`: Validates required vars on startup, applies defaults
- Startup fails fast with clear error if Supabase credentials missing

### Error Monitoring (Sentry)
- `sentry.ts`: Wraps `@sentry/node`, no-ops when `SENTRY_DSN` unset
- Captures unhandled errors in gateway
- Client-side Sentry in web app

### Production Infrastructure
- `docker-compose.prod.yml`: Resource limits, health checks, restart policies
- Deploy scripts: `scripts/deploy-vercel.sh`, `scripts/deploy-fly.sh`
- Production checklist: `docs/PRODUCTION-CHECKLIST.md`

---

## API Additions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/streams/test` | Test camera connection — returns snapshot + codec |
| `POST` | `/api/v1/cameras/:id/record/start` | Start manual recording |
| `POST` | `/api/v1/cameras/:id/record/stop` | Stop recording |
| `GET` | `/api/v1/cameras/:id/record/status` | Recording status |
| `GET` | `/api/v1/recordings/:id/play` | Serve saved recording file |
| `GET` | `/api/v1/events/:id/clip` | Serve event clip |
| `POST` | `/api/v1/cameras/discover` | Detect USB + network cameras |
| `GET/POST/PATCH/DELETE` | `/api/v1/locations/*` | Location CRUD |
| `GET/POST/DELETE` | `/api/v1/tags/*` | Camera tags |
| `GET` | `/health/detailed` | Full service health |
| `GET` | `/health/metrics` | Prometheus metrics |
| `GET` | `/docs` | Swagger UI |
