# OSP Desktop

Tauri v2 desktop wrapper for the Open Surveillance Platform.

## Features

- **System tray** — live camera count + alert badge in the tray icon tooltip; left-click to show/hide; tray menu with Open Dashboard / Start at Login / Quit
- **Minimize to tray** — clicking × hides the window instead of quitting
- **Native OS notifications** — event alerts use OS-level notifications instead of browser pop-ups
- **Auto-start on login** — optional; toggle via Settings → Desktop App or the tray menu
- **Connection screen** — on first launch, enter your OSP server URL (saved for future launches)

## Prerequisites

- [Rust](https://rustup.rs) (stable, 1.77+)
- `cargo` in PATH
- Node.js 20+ and pnpm
- Platform build tools:
  - **macOS**: Xcode command-line tools (`xcode-select --install`)
  - **Windows**: Microsoft C++ Build Tools or Visual Studio with "Desktop development with C++"
  - **Linux**: `build-essential libwebkit2gtk-4.1-dev libappindicator3-dev`

## Setup

```bash
# From the repo root
pnpm install

# Generate app icons (requires a 1024×1024 source PNG)
cp your-icon.png apps/desktop/src-tauri/icons/app-icon.png
cd apps/desktop
pnpm tauri icon src-tauri/icons/app-icon.png
```

## Development

```bash
# 1. Start the Next.js web app dev server (required for devUrl)
pnpm --filter @osp/web dev          # runs on :3001

# 2. In a second terminal, start Tauri
pnpm --filter @osp/desktop dev      # opens native window pointing to :3001
```

Or from `apps/desktop/`:

```bash
pnpm dev
```

## Production build

```bash
# Build the connection-screen HTML (no separate build step needed — it's plain HTML/JS)
pnpm --filter @osp/desktop build
```

Output installers are placed in `src-tauri/target/release/bundle/`:

- `.dmg` (macOS)
- `.msi` / `.exe` (Windows)
- `.deb` / `.AppImage` (Linux)

## Architecture

```
apps/desktop/
├── index.html          # Connection screen (bundled into the app)
├── src/
│   ├── connect.js      # Connection screen logic
│   └── style.css       # Connection screen styles
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json
    ├── icons/          # App icons (generate with `pnpm tauri icon`)
    └── src/
        ├── main.rs     # Entry point
        └── lib.rs      # Tray, commands, window setup
```

### Tauri commands (called from the web frontend via `invoke`)

| Command                 | Args                                               | Description                           |
| ----------------------- | -------------------------------------------------- | ------------------------------------- |
| `update_tray_status`    | `cameras_online`, `cameras_total`, `alerts_unread` | Updates tray tooltip                  |
| `show_os_notification`  | `title`, `body`                                    | Shows a native OS notification        |
| `toggle_autostart`      | —                                                  | Toggles auto-start; returns new state |
| `get_autostart_enabled` | —                                                  | Returns current auto-start state      |
| `show_main_window`      | —                                                  | Shows and focuses the main window     |

### Web app integration

The web app (`apps/web`) detects the Tauri environment via `isTauri()` from
`src/lib/tauri.ts` and:

- Routes notifications through `show_os_notification` instead of the Web
  Notifications API
- Syncs camera counts to the tray tooltip via `update_tray_status` (called
  from `useTraySync` hook wired into the dashboard layout)
- Shows a **Desktop App** tab in Settings → Desktop App (only visible when
  running inside Tauri) for auto-start toggle and notification test
