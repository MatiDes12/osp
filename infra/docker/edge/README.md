# OSP edge agent — production install (no source code)

Use this when you run OSP in production (e.g. dashboard on Vercel, API on Fly.io) and need **cameras on a local network** reachable from the cloud. You only need **Docker** on a small PC or NAS — **no Git clone** and **no OSP monorepo**.

## What you run locally

Three containers:

| Service    | Role |
| ---------- | ---- |
| **go2rtc** | Talks to your cameras (RTSP/ONVIF) on the LAN |
| **ngrok**  | Secure tunnel so the cloud gateway can reach go2rtc |
| **osp-agent** | Syncs cameras with your tenant, heartbeats tunnel URL to the cloud |

## 1. Prerequisites

- Docker ([Engine](https://docs.docker.com/engine/install/) on Linux/NAS, or [Docker Desktop](https://www.docker.com/products/docker-desktop/) on Windows/macOS)
- A free [ngrok](https://dashboard.ngrok.com/signup) account and [authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)
- From the OSP web app: **Tenant ID** and an **API key** (Settings → General / API Keys)

## 2. Download the stack files (pick one)

### A — GitHub Release ZIP (best for production)

Publishing a **git tag** matching `v*` (see [`.github/workflows/release.yml`](https://github.com/MatiDes12/osp/blob/main/.github/workflows/release.yml)) creates a [GitHub Release](https://github.com/MatiDes12/osp/releases) with asset **`osp-edge-bundle.zip`** (Compose files, `go2rtc.agent.yaml`, `env.example`, this README).

**Latest release:**

```bash
mkdir osp-edge && cd osp-edge
curl -fsSL -O https://github.com/MatiDes12/osp/releases/latest/download/osp-edge-bundle.zip
unzip osp-edge-bundle.zip
cd osp-edge-bundle
```

**Specific version** (replace tag with yours, e.g. `v1.0.0`):

```bash
export TAG=v1.0.0
curl -fsSL -O "https://github.com/MatiDes12/osp/releases/download/${TAG}/osp-edge-bundle.zip"
unzip osp-edge-bundle.zip && cd osp-edge-bundle
```

Fork or private repo: replace `MatiDes12/osp` with `your-org/your-repo`.

### B — `curl` raw files from GitHub (no ZIP)

Use when you want files on `main` or a branch without waiting for a release.

```bash
mkdir osp-edge && cd osp-edge
export OSP_REF=main   # or v1.0.0 (tag) for pinned raw URLs

curl -fsSL -o docker-compose.agent.yml \
  "https://raw.githubusercontent.com/MatiDes12/osp/${OSP_REF}/infra/docker/docker-compose.agent.yml"
curl -fsSL -o docker-compose.agent.win.yml \
  "https://raw.githubusercontent.com/MatiDes12/osp/${OSP_REF}/infra/docker/docker-compose.agent.win.yml"
curl -fsSL -o go2rtc.agent.yaml \
  "https://raw.githubusercontent.com/MatiDes12/osp/${OSP_REF}/infra/docker/go2rtc.agent.yaml"
curl -fsSL -o env.example \
  "https://raw.githubusercontent.com/MatiDes12/osp/${OSP_REF}/infra/docker/.env.agent.example"
```

### C — Build the ZIP locally (maintainers)

```bash
pnpm run package:edge
(cd dist && zip -rq osp-edge-bundle.zip osp-edge-bundle)
```

## 3. Configure

```bash
cp env.example .env.agent
```

Edit **`.env.agent`**:

| Variable | Set to |
| -------- | ------ |
| `CLOUD_GATEWAY_URL` | Your production gateway base URL (default in example is public demo; **replace** for white-label / private cloud) |
| `TENANT_ID` | From dashboard |
| `CLOUD_API_TOKEN` | API key from dashboard |
| `NGROK_AUTHTOKEN` | From ngrok dashboard |
| `TZ` | Your timezone (optional) |

Never commit `.env.agent` or share it in chat.

## 4. Start

From the folder that contains the compose files and `go2rtc.agent.yaml`:

**Linux / NAS** (host networking, best for ONVIF/mDNS):

```bash
docker compose --env-file .env.agent -f docker-compose.agent.yml up -d
```

**Windows / macOS Docker Desktop** (published ports; use this or `localhost:1984` will not open):

```bash
docker compose --env-file .env.agent -f docker-compose.agent.win.yml up -d
```

## 5. Verify

```bash
docker ps
docker logs osp-ngrok --tail 15      # should show "started tunnel", no ERR_NGROK_4018
docker logs osp-agent --tail 50
```

- **go2rtc UI**: `http://localhost:1984/` (Windows/macOS only with **`.win.yml`**)
- **ngrok inspect**: `http://localhost:4040/` (Windows/macOS with **`.win.yml`** only; on Linux host mode, same URL on the machine running Docker)

In the OSP dashboard, the agent should show **online** within about a minute.

## 6. Updates

Pull newer images and recreate:

```bash
docker compose --env-file .env.agent -f docker-compose.agent.yml pull
docker compose --env-file .env.agent -f docker-compose.agent.yml up -d
```

(Use `docker-compose.agent.win.yml` on Docker Desktop.)

Optional: pin the edge agent image for reproducible installs — set in `.env.agent` or shell:

```bash
export OSP_EDGE_AGENT_IMAGE=ghcr.io/matides12/osp-edge-agent:v1.0.0
```

## White-label / private cloud

- Set **`CLOUD_GATEWAY_URL`** to your customers’ gateway (e.g. `https://api.customer.com`).
- Give them the same **`curl`** commands; only the repo/org in the URL may change if you fork or mirror the files.

## Uninstall

```bash
docker compose --env-file .env.agent -f docker-compose.agent.yml down
# or .win.yml on Docker Desktop
docker volume rm osp-edge_go2rtc-data 2>/dev/null || true   # volume name may include project prefix
```

---

Support: contact your OSP operator with **Tenant ID** and `docker logs osp-agent --tail 100`.
