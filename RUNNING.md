# Running OSP — Web · Mobile · Desktop

Quick-start guide for all three platforms.

---

## Prerequisites (all platforms)

```bash
# 1. Install Node.js 20+ and pnpm
npm install -g pnpm

# 2. Clone and install dependencies
git clone https://github.com/MatiDes12/osp.git
cd osp
pnpm install

# 3. Build shared packages (required before anything else)
pnpm --filter @osp/shared build

# 4. Copy and fill in your Supabase credentials
cp .env.example .env
# Edit .env — set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# 5. Start infrastructure (Redis + go2rtc)
docker compose -f infra/docker/docker-compose.yml up -d redis go2rtc
```

> **Supabase credentials** — get them from https://supabase.com/dashboard → your project → Settings → API.
> Run migrations once: `npx supabase link --project-ref YOUR_REF && npx supabase db push`

---

## 🌐 Web

**Requires:** Node.js 20+, pnpm, running gateway + infrastructure (above)

### Start the API gateway

```bash
cd services/gateway
pnpm dev
```

Runs on **http://localhost:3000** (REST API) and **ws://localhost:3002** (WebSocket).

### Start the web dashboard

```bash
cd apps/web
pnpm dev
```

Open **http://localhost:3001** in your browser.

### One-liner (from repo root)

```bash
# Terminal 1 — infrastructure
docker compose -f infra/docker/docker-compose.yml up -d redis go2rtc

# Terminal 2 — API
cd services/gateway && pnpm dev

# Terminal 3 — web
cd apps/web && pnpm dev
```

### Service URLs

| Service | URL |
|---|---|
| Web dashboard | http://localhost:3001 |
| API gateway | http://localhost:3000 |
| API docs (Swagger) | http://localhost:3000/docs |
| WebSocket | ws://localhost:3002 |
| go2rtc UI | http://localhost:1984 |

### First login

1. Go to **http://localhost:3001/register** and create an account.
2. Add a camera: click **Add Camera** → enter an RTSP URL, or use `rtsp://localhost:8554/demo-cam-1` for the built-in test stream.

---

## 📱 Mobile (iOS & Android)

**Requires:** Node.js 20+, pnpm, [Expo Go](https://expo.dev/go) app on your device
**For iOS Simulator:** macOS + Xcode
**For Android Emulator:** Android Studio with an AVD configured

### Start

```bash
cd apps/mobile
npx expo start
```

| Key | Action |
|---|---|
| `i` | Open in iOS Simulator (macOS only) |
| `a` | Open in Android Emulator |
| Scan QR | Open in Expo Go on your physical device |

### Connect to your backend

By default the mobile app points to `http://localhost:3000`. For a **physical device** on the same Wi-Fi network, create `apps/mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000
EXPO_PUBLIC_WS_URL=ws://192.168.x.x:3002
EXPO_PUBLIC_GO2RTC_URL=http://192.168.x.x:1984
```

Replace `192.168.x.x` with your computer's local IP (`ipconfig` on Windows, `ifconfig` on Mac/Linux).

### Features available on mobile

- Live camera grid with MJPEG thumbnails
- WebRTC live view with MJPEG fallback
- Events list with severity colours
- Recordings list — **works offline** (last 20 recordings cached automatically)
- Motion zone management (view + toggle alerts per zone)
- PTZ controls for supported cameras
- Push notifications via Expo

---

## 🖥️ Desktop (Windows / macOS / Linux)

**Requires:** [Rust 1.77+](https://rustup.rs), Node.js 20+, pnpm
**Windows extra:** Microsoft C++ Build Tools (install via Visual Studio Installer → "Desktop development with C++")
**macOS extra:** Xcode command-line tools — `xcode-select --install`
**Linux extra:** `sudo apt install build-essential libwebkit2gtk-4.1-dev libappindicator3-dev`

### First-time setup

```bash
# Install Rust (if not already installed)
# → https://rustup.rs — follow the instructions for your OS

# Verify Rust is installed
rustc --version   # should print 1.77+

# Generate app icons (requires a 1024×1024 source PNG)
cp your-logo.png apps/desktop/src-tauri/icons/app-icon.png
cd apps/desktop
pnpm tauri icon src-tauri/icons/app-icon.png
```

> Skip the icon step for dev — Tauri uses built-in placeholder icons automatically.

### Development (points to local Next.js)

```bash
# Terminal 1 — web app dev server (required — Tauri loads from it)
cd apps/web && pnpm dev

# Terminal 2 — Tauri desktop window
cd apps/desktop && pnpm dev
```

A native window opens and loads **http://localhost:3001** directly. Hot-reload works — web changes show instantly in the window.

### Production build (installer)

```bash
cd apps/desktop
pnpm build
```

Output installers in `apps/desktop/src-tauri/target/release/bundle/`:

| Platform | Output |
|---|---|
| Windows | `bundle/msi/*.msi` and `bundle/nsis/*.exe` |
| macOS | `bundle/dmg/*.dmg` and `bundle/macos/*.app` |
| Linux | `bundle/deb/*.deb` and `bundle/appimage/*.AppImage` |

In production mode the app shows a **connection screen** — enter your OSP server URL (local or hosted). The URL is remembered for future launches.

### Desktop features

| Feature | How |
|---|---|
| **System tray** | Tray icon shows `x/y cameras online • N alerts` in tooltip |
| **Show / hide window** | Left-click tray icon, or tray menu → Open Dashboard |
| **Minimize to tray** | Clicking × hides the window — OSP keeps running |
| **Quit** | Tray menu → Quit OSP |
| **Start at login** | Tray menu → Start at Login, or Settings → Desktop App |
| **Native notifications** | OS-level alerts instead of browser pop-ups |

### Settings → Desktop App tab

Visible only inside the Tauri shell. Provides:
- Auto-start on login toggle
- Native notification test button
- Window behaviour reference

---

## Running all three simultaneously

```
Terminal 1   docker compose -f infra/docker/docker-compose.yml up -d redis go2rtc
Terminal 2   cd services/gateway && pnpm dev
Terminal 3   cd apps/web && pnpm dev
Terminal 4   cd apps/mobile && npx expo start
Terminal 5   cd apps/desktop && pnpm dev
```

> Terminals 3–5 all connect to the same gateway on port 3000. Mobile and Desktop talk to the same API as the browser.

---

## Troubleshooting

### `Cannot find module @osp/shared`
```bash
pnpm --filter @osp/shared build
```

### Mobile device can't connect to gateway
Use your computer's LAN IP in `apps/mobile/.env` (not `localhost`).
Run `ipconfig` (Windows) or `ifconfig | grep inet` (Mac/Linux) to find it.

### Docker can't reach LAN cameras (macOS / Windows)
Docker Desktop runs in a VM. For real IP cameras, run go2rtc natively on your host instead of in Docker:
```bash
# Download go2rtc binary from https://github.com/AlexxIT/go2rtc/releases
./go2rtc -config infra/docker/go2rtc.yaml
```

### Desktop: `error: linker 'link.exe' not found` (Windows)
Install Microsoft C++ Build Tools:
https://visualstudio.microsoft.com/visual-cpp-build-tools/
Select **"Desktop development with C++"** workload, then re-run `pnpm dev`.

### Desktop: Tauri window is blank / shows connection screen in dev
Make sure the web dev server is running on port 3001 **before** starting Tauri.

### Port already in use
```bash
# Windows
netstat -ano | findstr :3000

# macOS / Linux
lsof -i :3000
```
Change the port in `.env` (`GATEWAY_PORT=3001`) if needed.
