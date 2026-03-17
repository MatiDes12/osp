# Mobile -- Page Overrides

> Rules here override `MASTER.md`. Platform-specific rules for React Native + NativeWind.

---

## Navigation

- Bottom tab bar: 4 tabs (Dashboard, Cameras, Alerts, Settings)
- Tab icons: 24px Lucide icons, active tab: blue-500, inactive: zinc-500
- Tab bar height: 56px + safe area inset
- No sidebar on mobile

## Dashboard (Mobile)

- Vertical scroll of camera feed cards
- Each feed card: Full width, 16:9, rounded-lg, margin-bottom 8px
- Tap: Opens full-screen live view
- Pull-to-refresh: Refresh camera statuses
- Alert summary bar at top: Scrollable horizontal chips (Critical: 2, Warning: 5)

## Camera Live View (Mobile)

- Full screen, landscape auto-rotation
- Tap to show/hide controls overlay
- Controls: Play/Pause, Screenshot, Audio toggle, Back button
- Swipe left/right to switch between cameras
- PTZ: Drag on video to pan, pinch to zoom (if camera supports)
- No timeline scrubber in live mode (tap "Recordings" to access)

## Alerts (Mobile)

- Grouped by day: "Today", "Yesterday", "March 15"
- Each alert: Compact row with left color bar
  - Thumbnail (40x40), event type, camera name, relative time
  - Tap: Expand to show clip and details
- Swipe right: Acknowledge
- Swipe left: Snooze (15m, 1h, 4h options)
- Push notification tap: Deep links to specific alert

## Touch Targets

- Minimum touch target: 44x44px
- Buttons: height 48px minimum
- List item rows: height 64px minimum
- Spacing between tappable items: 8px minimum

## Performance

- Camera thumbnails: 320px wide max, WebP format
- Lazy load feeds below viewport
- Max 4 simultaneous video streams on mobile
- Reduce frame rate to 15fps when on cellular data (user preference)

## Offline Behavior

- Show cached camera list and last-known statuses
- "No connection" banner at top (amber background)
- Alerts from push notifications still viewable
- Retry connection with exponential backoff

## Dark Mode

- Follows system dark mode preference by default
- Override available in Settings
- Dark mode is strongly recommended for surveillance use (default on)
