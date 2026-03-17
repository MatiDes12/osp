# Web App -- Implementation Status and Remaining Work

Last audited: 2026-03-17

---

## Status Legend

- [x] Complete -- real implementation, working with API
- [~] Partial -- UI exists but handler is missing or uses stub data
- [ ] Not started -- feature planned but no code

---

## Pages

### Authentication

- [x] Login page -- form submission, token storage, error handling, loading states
- [x] Register page -- form with tenant name, password strength indicator, terms checkbox
- [~] Google OAuth -- button rendered, no handler connected
- [ ] Forgot password -- link exists, no page or flow implemented
- [ ] Email verification -- not implemented
- [ ] Password reset flow -- not implemented

### Dashboard / Cameras

- [x] Camera list page -- real API fetch, search by name, filter by location
- [x] Camera grid layout -- toggleable 1x1, 2x2, 3x3, 4x4 layouts
- [x] Add Camera dialog -- manual entry with name, protocol, URI, location
- [x] Network scan / discovery -- calls POST /api/v1/cameras/discover, shows results
- [x] Camera card -- real snapshot polling every 10s, status indicator, recording badge
- [x] Stat cards -- total cameras, online count, events today, active recordings

### Camera Detail (cameras/[id])

- [x] Live video player -- WebRTC with HLS fallback
- [x] PTZ controls -- pan, tilt, zoom buttons (works when camera supports it)
- [x] Zone drawing -- polygon overlay on video feed
- [x] Zone name editing -- dialog to rename zones
- [x] Camera settings -- edit name, protocol, connection URI
- [x] Delete camera -- with API call
- [x] Event timeline for this camera
- [x] Recording history for this camera
- [~] Two-way audio -- UI for speaker/mic controls exists, real audio stream untested
- [ ] Timeline scrubber with playback -- component exists but playback from timeline position not wired
- [ ] Clip download -- select start/end on timeline, export clip

### Events

- [x] Event list with pagination
- [x] Filter by camera, type, severity, date range
- [x] Single event acknowledge
- [x] Bulk acknowledge
- [x] Event detail modal with metadata
- [x] Event stats summary (by type and severity)
- [x] Real-time event feed via WebSocket
- [~] Event export/download -- button present, handler may not produce a file
- [ ] Event sound alerts -- no audio notification on critical events

### Recordings

- [x] Recording list grouped by date
- [x] Filter by camera, date, trigger type
- [x] Video playback in split view
- [x] Recording metadata display (duration, size, retention, trigger)
- [~] Download recording -- button present, download may not be wired
- [ ] Clip extraction from recording -- not implemented

### Rules

- [x] Rule list with enabled/disabled toggle
- [x] Create rule dialog -- event type, conditions, actions
- [x] Rule actions -- email, Slack, webhook, SMS, push, start recording
- [x] Edit existing rules
- [x] Delete rules with confirmation
- [~] Rule testing / dry run -- UI not present, backend may support it
- [ ] Schedule-based rules with weekly grid -- not implemented
- [ ] Visual rule builder (drag-and-drop trigger/condition/action blocks) -- not implemented

### Settings

- [x] Camera management tab -- edit, delete cameras
- [x] User management tab -- invite users, assign roles (owner, admin, viewer)
- [x] Notification preferences tab -- email, Slack, webhook config
- [x] Recording settings tab -- retention policy, storage backend
- [x] Extensions tab -- view installed extensions
- [x] Tenant settings tab -- organization name, avatar
- [x] API Keys tab -- generate, revoke, view keys
- [~] Billing tab -- UI present, no real billing system connected
- [ ] Extension marketplace -- browse and install from marketplace not implemented
- [ ] White-label / branding config -- not implemented

### Other Pages

- [x] Health monitoring page -- real service status checks with auto-refresh
- [x] Locations page -- full CRUD for physical locations
- [x] Landing page -- marketing page with features, pricing, CTAs

---

## Components

### Layout

- [x] Sidebar -- navigation, user info from JWT, sign out
- [~] Sidebar quick camera status -- uses hardcoded stub data (5 cameras), needs real API
- [x] TopBar -- user menu, sign out
- [~] TopBar search -- input rendered, no search handler
- [~] TopBar grid toggles -- buttons rendered, no handler
- [~] TopBar notification bell -- visual badge only, no dropdown with actual notifications

### Camera

- [x] CameraCard -- snapshot polling, status indicator, recording badge
- [x] CameraGrid -- responsive grid with layout toggle
- [x] AddCameraDialog -- manual + network scan modes
- [x] LiveViewPlayer -- WebRTC + HLS
- [x] HLSPlayer -- standalone HLS video element
- [x] PTZControls -- directional pad + zoom
- [x] ZoneDrawer -- polygon drawing overlay
- [x] ZoneNameDialog -- edit zone name
- [~] AudioControls -- UI exists, real audio stream untested
- [ ] TimelineScrubber -- component may exist but playback seeking not confirmed working

### UI

- [x] Toast notifications -- auto-dismiss, success/error/info types
- [x] PageError -- error display with retry button
- [x] ErrorBoundary -- catches React errors
- [x] ActionLogPanel -- dev-only action logger
- [x] StatCard -- metric display with progress bar

### Auth

- [x] AuthGuard -- token validation, redirect to login
- [x] AuthAwareCTA -- conditional CTAs on landing page

---

## Hooks

- [x] use-cameras -- full CRUD with optimistic updates
- [x] use-locations -- full CRUD
- [x] use-rules -- full CRUD with toggle
- [x] use-events -- filtering, pagination, acknowledge
- [x] use-recordings -- fetch with filtering
- [x] use-auth -- login, register, logout
- [x] use-tenant -- tenant info fetch
- [x] use-event-stream -- WebSocket real-time events
- [x] use-action-logger -- route change logging (dev)

---

## What Needs Work (Priority Order)

### P0 -- Gaps in Core Features

1. **Sidebar quick camera status** -- Replace hardcoded stub with real `GET /api/v1/cameras` data showing top 5 cameras with live status
2. **TopBar search** -- Wire up Command+K search to filter cameras/events/rules across the app
3. **TopBar notification bell** -- Add dropdown showing recent unread alerts from event stream
4. **Recording download** -- Wire download button to fetch signed URL from `GET /api/v1/recordings/:id/download` and trigger browser download
5. **Timeline scrubber playback** -- Clicking a position on the timeline should seek the video player to that timestamp

### P1 -- Missing Features for MVP

6. **Forgot password flow** -- Add `/forgot-password` page, send reset email via Supabase Auth, add `/reset-password` page
7. **Event sound alerts** -- Play a short audio notification when critical events arrive via WebSocket (with user toggle in settings)
8. **Rule schedule grid** -- Add weekly hour grid for schedule-based rule triggers (7 columns x 24 rows)
9. **Clip extraction** -- Allow user to select start/end on timeline and export a clip via video-pipeline service

### P2 -- Nice to Have (Post-MVP)

10. **Google OAuth** -- Connect the existing button to Supabase Auth Google provider
11. **Extension marketplace** -- Browse, search, install, and configure extensions
12. **White-label branding** -- Logo upload, color picker, custom domain config in tenant settings
13. **Visual rule builder** -- Drag-and-drop block editor for trigger/condition/action (current form-based builder works fine for MVP)
14. **Billing integration** -- Connect to Stripe for plan management
15. **Email verification** -- Post-register email confirmation flow
16. **Footer links** -- About, Privacy, Terms, Contact pages (landing page)
17. **Camera hover actions** -- Wire fullscreen and settings buttons on camera card hover
