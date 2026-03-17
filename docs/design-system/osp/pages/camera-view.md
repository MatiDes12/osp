# Camera View -- Page Overrides

> Rules here override `MASTER.md`. Unmentioned rules inherit from Master.

---

## Layout

- Full-width video feed, no sidebar
- Top bar: Back button, camera name, status badge, actions (share, download, settings)
- Bottom panel: Timeline scrubber + controls
- Right panel (desktop): Event log for this camera, toggleable

## Video Feed

- Fills available space, maintains 16:9 or native aspect ratio
- Background: `bg-black` (true black for video contrast)
- Double-click or Escape to exit full-screen
- Pinch-to-zoom on mobile and trackpad

## PTZ Controls

- Overlay: Bottom-right of video feed, semi-transparent `bg-zinc-900/80 backdrop-blur-sm`
- D-pad layout: Up/Down/Left/Right arrows + center home button
- Zoom: Plus/Minus buttons flanking the D-pad
- Only visible when camera reports PTZ capability
- Touch: Swipe on video to pan, pinch to zoom

## Timeline Scrubber

- Full width below video feed, height: 48px
- Background: `bg-zinc-900`
- Recording segments: Green bars on the timeline
- Motion events: Red markers (clickable, jump to timestamp)
- AI detections: Purple markers
- Current position: White vertical line with timestamp tooltip
- Drag to scrub, scroll to zoom timeline range
- Time range selector: 1h, 6h, 12h, 24h, custom

## Zone Drawing

- Toggle mode: "Draw Zone" button activates polygon drawing overlay
- Translucent colored overlay on video feed
- Click to place points, double-click to close polygon
- Each zone: Name label, color picker, alert toggle
- Zones persist per camera in database

## Controls Bar

- Play/Pause, Skip back 10s, Skip forward 10s
- Speed: 0.5x, 1x, 2x, 4x, 8x
- Volume (for two-way audio cameras)
- Screenshot button (captures current frame)
- Download clip (select start/end on timeline)
- Full-screen toggle

## Event Sidebar (Desktop)

- Width: 320px, right side, toggleable
- Shows events for this camera only
- Chronological, newest first
- Each event: Thumbnail, type badge, timestamp
- Click event to jump to that timestamp in timeline
