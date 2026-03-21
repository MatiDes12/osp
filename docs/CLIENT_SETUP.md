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

### Requirements

- A computer or NAS on the **same local network** as your cameras
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS) or [Docker Engine](https://docs.docker.com/engine/install/) (Linux / NAS)

---

### Step 1 — Get your credentials

Log in to your OSP dashboard, then:

1. Go to **Settings → General** and copy your **Tenant ID**.
2. Go to **Settings → API Keys**, click **New Key**, give it a name like `home-agent`, and copy the key. You will only see it once.

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

### Step 3 — Run the agent

Open a terminal (Command Prompt or PowerShell on Windows) and run these two commands. Replace the placeholder values with your credentials from Step 1.

**Start the camera proxy**

```bash
docker run -d --name osp-go2rtc --network host \
  --restart unless-stopped \
  alexxit/go2rtc
```

> On Windows / macOS, replace `--network host` with `-p 1984:1984 -p 8554:8554 -p 8555:8555/udp`

**Start the OSP agent**

```bash
docker run -d --name osp-agent --network host \
  --restart unless-stopped \
  -e GATEWAY_URL=https://osp-gateway.fly.dev \
  -e TENANT_ID=YOUR_TENANT_ID \
  -e API_TOKEN=YOUR_API_TOKEN \
  -e GO2RTC_URL=http://localhost:1984 \
  ghcr.io/matides12/osp-camera-ingest:latest
```

> On Windows / macOS, remove the `--network host` flag from the agent command.

Both containers will restart automatically if your machine reboots.

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

- Make sure Docker is running (`docker ps` should list `osp-agent` and `osp-go2rtc`)
- Check that your Tenant ID and API Token are correct (no extra spaces)
- Restart the containers: `docker restart osp-agent osp-go2rtc`

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
docker pull ghcr.io/matides12/osp-camera-ingest:latest
docker pull alexxit/go2rtc
docker restart osp-agent osp-go2rtc
```

---

## Uninstalling

```bash
docker stop osp-agent osp-go2rtc
docker rm osp-agent osp-go2rtc
docker rmi ghcr.io/matides12/osp-camera-ingest:latest alexxit/go2rtc
```

The desktop app can be uninstalled through your system's normal app uninstaller.

---

## Need help?

Contact your OSP administrator or reach out to support with your **Tenant ID** and the output of `docker logs osp-agent --tail 100`.
