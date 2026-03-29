# OSP Client Setup Guide

This guide explains how to connect your cameras to OSP. There are two options — choose the one that fits your setup.

---

## Option A — Desktop App (Recommended for most users)

The OSP desktop app is the easiest way to get started. It installs everything automatically.

### Steps

1. **Download the OSP desktop app** from your account portal and run the installer.
2. **Open OSP** and log in with your credentials.
3. On first launch, a **one-time setup wizard** will appear. Click **Install & Configure** and wait about 10 seconds while it sets up the local camera engine.
4. Once setup is complete, click **Add Your First Camera** and enter your camera details.

That's it. The camera engine starts automatically every time you open OSP.

### Requirements

|             |                              |
| ----------- | ---------------------------- |
| **Windows** | Windows 10 or later (64-bit) |
| **macOS**   | macOS 12 (Monterey) or later |
| **Linux**   | Ubuntu 20.04+ or equivalent  |

> **Note:** If your antivirus blocks the app on first launch, add an exception for the OSP folder and try again.

---

## Option B — Docker Agent (For NAS, servers, or headless machines)

Use this option if you want the agent running on a home server, NAS (Synology, QNAP, Unraid), or any machine without a desktop.

**You do not need the OSP source code.** Production install uses Docker Compose plus a few config files — either downloaded with `curl` from GitHub or from a ZIP your operator provides.

Full step-by-step (credentials, ngrok, Linux vs Windows compose files): **[`infra/docker/edge/README.md`](../infra/docker/edge/README.md)** (also packaged as `README.md` inside the edge bundle).

**Easiest for customers:** download **`osp-edge-bundle.zip`** from [GitHub Releases](https://github.com/MatiDes12/osp/releases) (built automatically on every `v*` tag).

### Requirements

- A computer or NAS on the **same local network** as your cameras
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS) or [Docker Engine](https://docs.docker.com/engine/install/) (Linux / NAS)
- A free [ngrok](https://dashboard.ngrok.com/signup) account and [authtoken](https://dashboard.ngrok.com/get-started/your-authtoken) (tunnel so the cloud can reach your local camera proxy)

---

### Step 1 — Get your credentials

Log in to your OSP dashboard, then:

1. Go to **Settings → General** and copy your **Tenant ID**.
2. Go to **Settings → API Keys**, click **New Key**, give it a name like `home-agent`, and copy the key. You will only see it once.

If you use a **private or white-label** deployment, note your **gateway base URL** (e.g. `https://api.yourcompany.com`) for the `.env` file below.

---

### Step 2 — Install Docker

**Windows / macOS**

Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop/). Once installed, open it and leave it running in the background.

**Linux**

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in after this
```

**Synology NAS**

Open **Package Center** → search for **Container Manager** → install it.

---

### Step 3 — Download and run the stack (production)

**Option 1 — Release ZIP (recommended)** — from [Releases](https://github.com/MatiDes12/osp/releases), download **`osp-edge-bundle.zip`**, unzip, `cd osp-edge-bundle`, then:

```bash
cp env.example .env.agent
# Edit .env.agent: CLOUD_GATEWAY_URL, TENANT_ID, CLOUD_API_TOKEN, NGROK_AUTHTOKEN, TZ
```

**Option 2 — `curl` raw files** (same content as the ZIP; use a **release tag** in `OSP_REF` when possible):

```bash
mkdir osp-edge && cd osp-edge
export OSP_REF=main

curl -fsSL -o docker-compose.agent.yml \
  "https://raw.githubusercontent.com/MatiDes12/osp/${OSP_REF}/infra/docker/docker-compose.agent.yml"
curl -fsSL -o docker-compose.agent.win.yml \
  "https://raw.githubusercontent.com/MatiDes12/osp/${OSP_REF}/infra/docker/docker-compose.agent.win.yml"
curl -fsSL -o go2rtc.agent.yaml \
  "https://raw.githubusercontent.com/MatiDes12/osp/${OSP_REF}/infra/docker/go2rtc.agent.yaml"
curl -fsSL -o env.example \
  "https://raw.githubusercontent.com/MatiDes12/osp/${OSP_REF}/infra/docker/.env.agent.example"

cp env.example .env.agent
# Edit .env.agent as above
```

**Linux / NAS** (host networking — best for camera discovery):

```bash
docker compose --env-file .env.agent -f docker-compose.agent.yml up -d
```

**Windows / macOS (Docker Desktop)** — use this compose file so `http://localhost:1984` and the ngrok API port work:

```bash
docker compose --env-file .env.agent -f docker-compose.agent.win.yml up -d
```

This starts **go2rtc** (cameras), **ngrok** (tunnel), and **osp-agent** (`ghcr.io/matides12/osp-edge-agent`). Containers restart automatically after reboot when Docker is configured to do so.

Maintainers can build a ZIP for customers: `./scripts/package-edge-bundle.sh` → `dist/osp-edge-bundle/`.

---

### Step 4 — Confirm the agent is online

Go back to the OSP web dashboard. After 30–60 seconds (first run pulls the Docker image), your agent will appear as **Online** in the setup wizard or under **Settings → Agents**.

You can also check the logs if something isn't working:

```bash
docker logs osp-agent --tail 50
docker logs osp-go2rtc --tail 50
```

---

### Step 5 — Add your cameras

Once the agent is online, click **Add Camera** in the dashboard and enter your camera's connection details.

| Protocol   | Connection format                                 |
| ---------- | ------------------------------------------------- |
| RTSP       | `rtsp://username:password@192.168.1.x:554/stream` |
| ONVIF      | `onvif://username:password@192.168.1.x`           |
| HTTP MJPEG | `http://192.168.1.x/video.cgi`                    |

> **Tip:** Most cameras have their RTSP address printed in the manual or on the manufacturer's website. Search `[camera brand] RTSP URL` if you're unsure.

---

## Troubleshooting

### Agent shows as offline

- Make sure Docker is running (`docker ps` should list `osp-agent`, `osp-go2rtc`, and `osp-ngrok`)
- Check **Tenant ID**, **CLOUD_API_TOKEN**, and **NGROK_AUTHTOKEN** in `.env.agent` (no extra spaces; ngrok token must be real)
- `docker logs osp-ngrok --tail 20` — look for `ERR_NGROK_4018` (bad/missing token)
- Restart: `docker compose --env-file .env.agent -f docker-compose.agent.yml restart` (or `.win.yml` on Docker Desktop)

### Can't see camera stream

- Confirm the camera is on the same local network as the machine running the agent
- Test the RTSP URL with VLC: **Media → Open Network Stream** → paste the URL
- Check the camera's firewall isn't blocking port 554

### Port conflicts

If another app is already using port 1984, 8554, or 8555, change the port mapping in the `docker run` command. For example, to move go2rtc to port 1985:

```bash
-p 1985:1984   # host:container
```

Then update `GO2RTC_URL=http://localhost:1985` in the agent command.

### Updating the agent

```bash
docker compose --env-file .env.agent -f docker-compose.agent.yml pull
docker compose --env-file .env.agent -f docker-compose.agent.yml up -d
```

(On Docker Desktop, use `docker-compose.agent.win.yml` instead.)

---

## Uninstalling

```bash
docker compose --env-file .env.agent -f docker-compose.agent.yml down
# or: -f docker-compose.agent.win.yml
docker rmi ghcr.io/matides12/osp-edge-agent:latest alexxit/go2rtc:latest ngrok/ngrok:latest 2>/dev/null || true
```

The desktop app can be uninstalled through your system's normal app uninstaller.

---

## Need help?

Contact your OSP administrator or reach out to support with your **Tenant ID** and the output of `docker logs osp-agent --tail 100`.
