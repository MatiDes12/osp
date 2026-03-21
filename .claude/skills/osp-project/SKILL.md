---
name: osp-project
description: OSP project-specific patterns, conventions, and architecture guidelines for the surveillance camera platform
trigger: always
---

# OSP Project Guidelines

## Camera Pipeline Pattern

When working on camera-related code:

1. Camera discovery uses ONVIF probing on LAN + manual RTSP URI entry
2. go2rtc handles all protocol translation (RTSP/ONVIF -> WebRTC/HLS)
3. FFmpeg handles transcoding, segmented recording, thumbnail extraction
4. All streams are proxied — clients never connect directly to cameras

## Multi-Tenant Data Access

Every database query MUST be tenant-scoped:

```sql
-- ALWAYS include tenant_id in WHERE clauses
SELECT * FROM cameras WHERE tenant_id = $1 AND id = $2;
-- NEVER query without tenant_id
-- Supabase RLS is the safety net, but app-level scoping is required too
```

## Extension Hook Points

When adding new features, consider if they need extension hooks:

- `onMotionDetected` — after motion detection triggers
- `onPersonDetected` — after AI person detection
- `onCameraOffline` — when camera health check fails
- `onRecordingComplete` — after a recording segment is saved
- `onAlertTriggered` — after an alert rule fires

Extensions register via manifest and execute in sandboxed runtime.

## API Endpoint Pattern

All new endpoints follow this pattern:

```typescript
// services/gateway/src/routes/cameras.ts
app.get("/api/v1/cameras", authMiddleware, tenantMiddleware, async (c) => {
  const tenantId = c.get("tenantId");
  const cameras = await cameraService.listByTenant(tenantId);
  return c.json({ data: cameras, meta: { total: cameras.length } });
});
```

## Video Storage Pattern

```
R2 bucket structure:
/{tenant_id}/recordings/{camera_id}/{YYYY-MM-DD}/{timestamp}.mp4
/{tenant_id}/snapshots/{camera_id}/{YYYY-MM-DD}/{timestamp}.jpg
/{tenant_id}/clips/{event_id}.mp4
```

## Real-Time Events

- Internal: Redis pub/sub between Go services
- Client-facing: Supabase Realtime subscriptions
- WebSocket at /ws/v1/events for live alert stream
- WebRTC signaling at /ws/v1/cameras/:id/live

## Component Organization (Web)

```
apps/web/src/
├── app/                    # Next.js App Router pages
│   ├── (dashboard)/        # Authenticated layout group
│   │   ├── cameras/        # Camera management pages
│   │   ├── events/         # Events/alerts pages
│   │   └── rules/          # Rule builder pages
│   └── (auth)/             # Auth layout group
├── components/
│   ├── cameras/            # Camera-specific components
│   ├── events/             # Event-specific components
│   └── shared/             # Cross-feature components
├── hooks/                  # Custom React hooks
├── stores/                 # Zustand stores
└── lib/                    # Utilities, API client
```

## Go Service Pattern

```
services/camera-ingest/
├── cmd/
│   └── server/
│       └── main.go         # Entry point
├── internal/
│   ├── handler/            # HTTP/gRPC handlers
│   ├── service/            # Business logic
│   ├── repository/         # Data access
│   └── model/              # Domain models
├── pkg/                    # Shared exportable code
├── go.mod
└── Dockerfile
```
