# Events / Alerts -- Page Overrides

> Rules here override `MASTER.md`. Unmentioned rules inherit from Master.

---

## Layout

- Full-width content area with sidebar filters
- Filter sidebar: 240px, left side (desktop), bottom sheet (mobile)
- Event list: Scrollable, virtualized for performance (1000+ events)

## Filter Sidebar

- Camera selector: Multi-select dropdown with camera thumbnails
- Event type: Checkboxes (Motion, Person, Vehicle, Animal, Camera Offline, Custom)
- Severity: Critical, Warning, Info
- Date range: Preset buttons (Today, Yesterday, Last 7d, Last 30d) + custom picker
- Zone filter: Select zones within cameras
- AI tag filter: Person, Vehicle, Animal, Package
- "Clear All" button at bottom

## Event List

- Each event row: Left border color by severity, as defined in Master
- Layout per row:
  - Thumbnail (48x48, rounded, from snapshot)
  - Event type + camera name (bold)
  - Zone name + AI tags (badges)
  - Relative timestamp ("2m ago"), absolute on hover tooltip
  - "View Clip" button (ghost style)
- Selected row: `bg-zinc-800/50` highlight
- Bulk actions: Select multiple, Acknowledge All, Export

## Event Detail Panel

- Opens as right panel (desktop) or bottom sheet (mobile)
- Video clip player (same controls as camera-view timeline)
- Event metadata: Camera, Zone, Type, Confidence (for AI), Duration
- Snapshot: Full resolution, downloadable
- Actions: Acknowledge, Snooze, Create Rule from Event
- Related events: "Similar events from this camera" list below

## Real-Time

- New events prepend to list with slide-in animation (300ms)
- Unread count badge on "Events" nav item
- Browser notification permission prompt on first critical alert
- Sound alert toggle (off by default, user preference)

## Empty State

- No events matching filters: Show filter summary, "Adjust Filters" link
- No events at all: "No events recorded yet. Events appear when cameras detect motion or go offline."
