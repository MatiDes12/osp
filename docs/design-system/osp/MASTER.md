# OSP Design System -- Master File

> When building a specific page, first check `design-system/osp/pages/[page-name].md`.
> If that file exists, its rules override this Master file.
> If not, strictly follow the rules below.

---

**Project:** Open Surveillance Platform
**Category:** Real-Time Monitoring Dashboard
**Mode:** Dark-first (light mode secondary)
**Stack:** Next.js 15, Tailwind CSS, shadcn/ui, Lucide Icons

---

## Color Palette

### Dark Mode (Primary)

| Role           | Hex       | Tailwind   | CSS Variable       |
| -------------- | --------- | ---------- | ------------------ |
| Background     | `#09090B` | `zinc-950` | `--bg-primary`     |
| Surface        | `#18181B` | `zinc-900` | `--bg-surface`     |
| Surface Raised | `#27272A` | `zinc-800` | `--bg-raised`      |
| Border         | `#3F3F46` | `zinc-700` | `--border-default` |
| Border Subtle  | `#27272A` | `zinc-800` | `--border-subtle`  |
| Text Primary   | `#FAFAFA` | `zinc-50`  | `--text-primary`   |
| Text Secondary | `#A1A1AA` | `zinc-400` | `--text-secondary` |
| Text Muted     | `#71717A` | `zinc-500` | `--text-muted`     |

### Semantic Colors

| Role            | Hex       | Usage                                            |
| --------------- | --------- | ------------------------------------------------ |
| Blue (Primary)  | `#3B82F6` | Active states, links, selected items             |
| Blue Dim        | `#1E3A5F` | Blue tinted backgrounds                          |
| Green (Online)  | `#22C55E` | Camera online, recording active, healthy         |
| Red (Critical)  | `#EF4444` | Camera offline, critical alerts, motion detected |
| Amber (Warning) | `#F59E0B` | Warnings, degraded state, low storage            |
| Purple (AI)     | `#A855F7` | AI detections, person/vehicle/animal tags        |
| Cyan (Info)     | `#06B6D4` | Informational, metadata, timestamps              |

### Status Indicator Colors

| Status           | Color     | Pulse              |
| ---------------- | --------- | ------------------ |
| Live / Recording | `#22C55E` | Yes -- 2s infinite |
| Offline          | `#EF4444` | No                 |
| Motion Detected  | `#F59E0B` | Yes -- 1s x3       |
| AI Detection     | `#A855F7` | Yes -- 1.5s x2     |
| Connecting       | `#3B82F6` | Yes -- 1s infinite |
| Idle / No Motion | `#71717A` | No                 |

### Light Mode (Secondary)

| Role           | Hex       | Tailwind   |
| -------------- | --------- | ---------- |
| Background     | `#FFFFFF` | `white`    |
| Surface        | `#F4F4F5` | `zinc-100` |
| Surface Raised | `#FFFFFF` | `white`    |
| Border         | `#E4E4E7` | `zinc-200` |
| Text Primary   | `#09090B` | `zinc-950` |
| Text Secondary | `#52525B` | `zinc-600` |

---

## Typography

| Element    | Font           | Weight | Size             | Line Height |
| ---------- | -------------- | ------ | ---------------- | ----------- |
| H1         | Inter          | 700    | 30px / text-3xl  | 1.2         |
| H2         | Inter          | 600    | 24px / text-2xl  | 1.3         |
| H3         | Inter          | 600    | 20px / text-xl   | 1.4         |
| Body       | Inter          | 400    | 14px / text-sm   | 1.5         |
| Body Large | Inter          | 400    | 16px / text-base | 1.5         |
| Caption    | Inter          | 500    | 12px / text-xs   | 1.4         |
| Monospace  | JetBrains Mono | 400    | 13px             | 1.5         |
| Timestamp  | JetBrains Mono | 400    | 12px / text-xs   | 1.4         |

**Why Inter:** Default in shadcn/ui, excellent readability at small sizes, clean for data-dense interfaces. No additional font loading needed.

**Why JetBrains Mono:** Timestamps, camera IDs, IP addresses, and technical data benefit from fixed-width characters. Distinguishes data from labels.

---

## Spacing Scale

| Token   | Value | Usage                            |
| ------- | ----- | -------------------------------- |
| `gap-1` | 4px   | Between icon and label           |
| `gap-2` | 8px   | Between list items, tight groups |
| `gap-3` | 12px  | Card internal padding (compact)  |
| `gap-4` | 16px  | Card padding, section gaps       |
| `gap-6` | 24px  | Between cards, major sections    |
| `gap-8` | 32px  | Page section margins             |
| `p-4`   | 16px  | Default card padding             |
| `p-6`   | 24px  | Large card / modal padding       |

---

## Border Radius

| Element       | Value               |
| ------------- | ------------------- |
| Buttons       | `rounded-md` (6px)  |
| Cards         | `rounded-lg` (8px)  |
| Modals        | `rounded-xl` (12px) |
| Badges / Tags | `rounded-full`      |
| Video Feed    | `rounded-lg` (8px)  |
| Avatars       | `rounded-full`      |
| Inputs        | `rounded-md` (6px)  |

---

## Shadows (Dark Mode)

Dark mode uses border emphasis instead of heavy shadows.

| Level      | Usage             | Implementation                                     |
| ---------- | ----------------- | -------------------------------------------------- |
| None       | Most cards        | `border border-zinc-800`                           |
| Subtle     | Raised cards      | `border border-zinc-700 shadow-sm shadow-black/20` |
| Elevated   | Modals, dropdowns | `border border-zinc-700 shadow-lg shadow-black/40` |
| Glow       | Active/selected   | `ring-1 ring-blue-500/50`                          |
| Alert Glow | Critical alert    | `ring-1 ring-red-500/50 shadow-red-500/20`         |

---

## Z-Index Scale

| Layer             | Value    | Usage                   |
| ----------------- | -------- | ----------------------- |
| Base              | `z-0`    | Page content            |
| Sticky sidebar    | `z-10`   | Navigation sidebar      |
| Sticky header     | `z-20`   | Top nav bar             |
| Dropdown          | `z-30`   | Menus, popovers         |
| Modal overlay     | `z-40`   | Modal backdrop          |
| Modal             | `z-50`   | Modal content           |
| Toast             | `z-[60]` | Alert notifications     |
| Camera fullscreen | `z-[70]` | Full-screen camera view |

---

## Layout

### App Shell

```
+--sidebar(w-64)--+-------main-content--------+
|                  |  top-bar (h-14)            |
|  Logo            |  breadcrumb + actions      |
|  Nav items       +---------------------------+
|  Camera list     |                            |
|  Quick status    |  Page content              |
|                  |  (scrollable)              |
|  Tenant picker   |                            |
+------------------+----------------------------+
```

- Sidebar: Fixed, 256px wide, collapsible to 64px (icons only)
- Top bar: Sticky, 56px height
- Content: Scrollable, max-w-full
- Mobile: Sidebar becomes bottom sheet or drawer

### Breakpoints

| Name    | Width           | Layout                                     |
| ------- | --------------- | ------------------------------------------ |
| Mobile  | < 768px         | Single column, bottom nav, stacked cameras |
| Tablet  | 768px - 1023px  | Collapsed sidebar, 2-column camera grid    |
| Desktop | 1024px - 1439px | Full sidebar, 2x2 or 3x2 camera grid       |
| Wide    | 1440px+         | Full sidebar, 4x3 camera grid, side panels |

---

## Component Patterns

### Camera Feed Card

```
+--rounded-lg border border-zinc-800--+
|  [Live Video Feed -- 16:9]          |
|                                      |
|  +--overlay top-left--+             |
|  | LIVE (green dot)   |             |
|  +--------------------+             |
|  +--overlay top-right-+             |
|  | HD | REC           |             |
|  +--------------------+             |
|  +--overlay bottom----+             |
|  | Camera Name    3:42 PM           |
|  +--------------------+             |
+--------------------------------------+
```

- Aspect ratio: 16:9 enforced
- Overlay: Semi-transparent gradient from bottom (`bg-gradient-to-t from-black/60`)
- Live indicator: Green dot with pulse animation
- Hover: Subtle ring (`ring-1 ring-blue-500/50`), show quick actions
- Click: Navigate to full camera view

### Alert / Event Row

```
+--border-l-4 border-red-500 bg-zinc-900 p-4 rounded-lg--+
|  [Snapshot]  Motion Detected - Front Door    2m ago      |
|  thumb       Camera: Front Door              [View Clip] |
|  48x48       Zone: Entrance    AI: Person                |
+----------------------------------------------------------+
```

- Left border color matches severity (red/amber/blue/purple)
- Thumbnail: 48x48 rounded, from snapshot
- Timestamp: Relative ("2m ago"), monospace
- Tags: Rounded badges for AI labels

### Stat Card

```
+--bg-zinc-900 border border-zinc-800 rounded-lg p-4--+
|  Cameras Online           [icon]                      |
|  24 / 26                                              |
|  ████████████████████░░  92%                          |
+------------------------------------------------------+
```

- Title: text-sm text-zinc-400
- Value: text-2xl font-semibold text-zinc-50
- Progress: Thin bar with semantic color
- Icon: Top right, text-zinc-500, 20x20

### Timeline Scrubber

```
|--[green segments]--[gap]--[green]--[red marker]--[green]--|
00:00                    12:00                         23:59
```

- Green segments: Recording available
- Gaps: No recording
- Red markers: Motion events
- Purple markers: AI detections
- Draggable playhead with timestamp tooltip

---

## Interaction Patterns

### Transitions

| Element          | Duration | Easing      | Property                       |
| ---------------- | -------- | ----------- | ------------------------------ |
| Button hover     | 150ms    | ease-out    | background-color, border-color |
| Card hover       | 200ms    | ease-out    | ring, shadow                   |
| Sidebar collapse | 200ms    | ease-in-out | width                          |
| Modal open       | 200ms    | ease-out    | opacity, transform             |
| Modal close      | 150ms    | ease-in     | opacity, transform             |
| Toast enter      | 300ms    | ease-out    | transform(slideUp), opacity    |
| Toast exit       | 200ms    | ease-in     | opacity                        |

### Loading States

| Context             | Pattern                                                   |
| ------------------- | --------------------------------------------------------- |
| Camera feed loading | Skeleton with pulse (aspect-video)                        |
| Event list loading  | 5 skeleton rows with varying widths                       |
| Stats loading       | Skeleton for number + progress bar                        |
| Full page loading   | Centered spinner with "Loading..." text                   |
| Live reconnecting   | Blue pulse border around feed + "Reconnecting..." overlay |

### Empty States

| Context        | Message                                      | Action               |
| -------------- | -------------------------------------------- | -------------------- |
| No cameras     | "No cameras connected"                       | "Add Camera" button  |
| No events      | "No events in this time range"               | Adjust filters link  |
| No rules       | "No alert rules configured"                  | "Create Rule" button |
| Camera offline | "Camera is offline" with last-seen timestamp | "Retry Connection"   |

---

## Icon System

**Library:** Lucide React (consistent with shadcn/ui)

| Context       | Icons                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Camera states | `Video`, `VideoOff`, `Wifi`, `WifiOff`                                 |
| Navigation    | `LayoutDashboard`, `Camera`, `Bell`, `Settings`, `Shield`              |
| Alerts        | `AlertTriangle`, `AlertCircle`, `CheckCircle`, `Info`                  |
| Actions       | `Play`, `Pause`, `SkipBack`, `SkipForward`, `Download`, `Share`        |
| AI tags       | `User`, `Car`, `Dog`, `Package`                                        |
| PTZ           | `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `ZoomIn`, `ZoomOut` |
| Rules         | `Workflow`, `Zap`, `Clock`, `MapPin`                                   |

Size: 16px for inline, 20px for buttons, 24px for navigation, 32px for empty states.

---

## Motion / Animation

```css
/* Status pulse -- live indicator */
@keyframes pulse-live {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
.animate-pulse-live {
  animation: pulse-live 2s ease-in-out infinite;
}

/* Alert attention -- motion detected */
@keyframes pulse-alert {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(239, 68, 68, 0);
  }
}
.animate-pulse-alert {
  animation: pulse-alert 1s ease-out 3;
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  .animate-pulse-live,
  .animate-pulse-alert {
    animation: none;
  }
}
```

---

## Accessibility

- Contrast: WCAG AA minimum (4.5:1 for text, 3:1 for large text)
- Focus rings: `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950`
- Keyboard navigation: All interactive elements reachable via Tab
- Screen reader: Camera names and statuses announced, alert severity conveyed
- Color is not the only indicator: Icons + text always accompany colored status dots
- Reduced motion: All animations respect `prefers-reduced-motion`

---

## Anti-Patterns (Do NOT Use)

- Light mode as default -- surveillance operators work in dark environments
- Emojis as icons -- use Lucide SVG icons
- Layout-shifting hover states -- no `scale` transforms on cards
- Arbitrary z-index values (`z-[9999]`) -- follow the scale above
- White (#FFFFFF) backgrounds in dark mode
- Auto-playing audio on alerts without user consent
- Continuous decorative animations -- reserve animation for status indicators only
- Invisible focus states
- Color as the sole status indicator

---

## Pre-Delivery Checklist

Before delivering any UI code:

- [ ] Dark mode is the default appearance
- [ ] No emojis used as icons (Lucide SVG only)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with transitions (150-200ms)
- [ ] Focus states visible (ring-2 ring-blue-500)
- [ ] Text contrast 4.5:1 minimum against background
- [ ] Status colors paired with icons or text labels
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive at 375px, 768px, 1024px, 1440px
- [ ] No content behind fixed sidebar or top bar
- [ ] No horizontal scroll on mobile
- [ ] Camera feeds maintain 16:9 aspect ratio
- [ ] Timestamps use monospace font
- [ ] Loading skeletons for all async content
