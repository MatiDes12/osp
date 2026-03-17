# Dashboard -- Page Overrides

> Rules here override `MASTER.md`. Unmentioned rules inherit from Master.

---

## Layout

- Camera grid occupies 70% of viewport width, stats sidebar 30%
- Grid: 2x2 default, user-configurable (1x1, 2x2, 3x3, 4x4)
- Stats sidebar collapses to horizontal strip on tablet
- Stats sidebar hidden on mobile, replaced by swipeable summary cards

## Camera Grid

- Feeds arranged in CSS Grid with `gap-2`
- Each feed: 16:9 aspect ratio, `rounded-lg`, click to expand
- Double-click: Full-screen single camera view
- Drag to reorder camera positions (persist in user preferences)
- Overlay: Camera name (bottom-left), live dot (top-left), time (bottom-right)
- Feed border: `border border-zinc-800`, on-hover: `ring-1 ring-blue-500/30`

## Stats Bar (Right Sidebar)

- Cameras Online: Count + progress bar (green)
- Active Alerts: Count + severity breakdown (red/amber badges)
- Storage Used: Percentage + bar (blue)
- Recording Status: Active recording count

## Quick Actions (Top Bar)

- Add Camera button (primary)
- Toggle grid size (icon buttons: grid-2x2, grid-3x3)
- Search cameras (input with Command+K shortcut)
- Notification bell with unread count badge

## Real-Time Updates

- Camera status changes: WebSocket, update feed border color
- New alerts: Toast notification (slides in from top-right)
- Feed reconnection: Blue pulse border + "Reconnecting..." overlay on individual feed
- Use Suspense boundaries around each camera feed independently

## Mobile Override

- Single column, vertical scroll of camera feeds
- Pull-to-refresh for camera status update
- Tap camera for full-screen live view
- Bottom quick-access bar: Dashboard, Cameras, Alerts, Settings
