# Desktop App Fixes

## 1. Live View — fallback-http uses cloud URL in Tauri mode
**File:** `apps/web/src/components/camera/LiveViewPlayer.tsx` ~line 1116
**Problem:** `fallback-http` always uses `${API_URL}/api/v1/cameras/.../live.mp4` (cloud gateway)
**Fix:** In Tauri mode, use `http://localhost:1984/api/stream.mp4?src=${cameraId}` instead

## 2. Recording button — no optimistic UI (slow)
**File:** `apps/web/src/app/(dashboard)/cameras/[id]/page.tsx` ~line 1396
**Problem:** `setIsRecording(true)` only fires after API returns success
**Fix:** Set `isRecording` optimistically before the `await fetch(...)`, rollback on error

## 3. Recordings save 0B — cloud gateway can't reach local go2rtc
**File:** `services/gateway/src/routes/stream.routes.ts` (record/start endpoint)
**Problem:** Gateway on Fly.io calls its own `GO2RTC_URL` (localhost on Fly) — not the user's machine
**Fix (Tauri):** In desktop, bypass gateway entirely. Call go2rtc HTTP API directly:
- Start: `POST http://localhost:1984/api/streams` with `{"name": cameraId, "channels": {...}}`
- go2rtc doesn't have a "record" API — recording must be done via `ffmpeg` or go2rtc's `rec:` source
- **Real fix:** Use go2rtc `rec:` source config or invoke `ffmpeg` via Tauri shell plugin to save mp4 locally
- Needs Tauri `tauri-plugin-shell` (already present) + filesystem save dialog

## 4. Snapshots — go through broken ngrok tunnel
**File:** `apps/web/src/app/(dashboard)/cameras/[id]/page.tsx` (snapshot button)
**Problem:** Snapshot calls `${API_URL}/api/v1/cameras/${cameraId}/snapshot` → gateway → ngrok → go2rtc
**Fix (Tauri):** Fetch snapshot directly: `GET http://localhost:1984/api/frame.jpeg?src=${cameraId}` then use Tauri dialog to save

## 5. Motion detection — not wired to local go2rtc in desktop
**Problem:** Motion comes from `camera-ingest` Go service (not running locally)
**Fix:** Poll go2rtc `/api/streams` every N seconds in Tauri mode, compare stream stats for activity spikes — or use go2rtc's `/api/ws` binary events
**Note:** Full motion detection needs the Go service running locally — out of scope for now

## Priority Order
1. **Recording button UX** (optimistic) — 5 min fix
2. **Live view fallback-http Tauri URL** — 5 min fix
3. **Snapshot save locally in Tauri** — 15 min
4. **Local recording via ffmpeg/Tauri shell** — 30 min (complex)
5. **Motion detection** — needs Go service locally (defer)
