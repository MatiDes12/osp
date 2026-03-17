#!/bin/bash
set -euo pipefail

# OSP Development Environment Setup
# Usage: ./scripts/setup-dev.sh

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()  { echo -e "${BOLD}[INFO]${RESET}  $1"; }
ok()    { echo -e "${GREEN}[OK]${RESET}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${RESET}  $1"; }
fail()  { echo -e "${RED}[FAIL]${RESET}  $1"; exit 1; }

# ─── Navigate to project root ───
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo -e "${BOLD}  OSP Development Environment Setup${RESET}"
echo "  ======================================"
echo ""

# ─── Check prerequisites ───
info "Checking prerequisites..."

command -v node   >/dev/null 2>&1 || fail "node is not installed. Install Node.js 20+ from https://nodejs.org"
command -v pnpm   >/dev/null 2>&1 || fail "pnpm is not installed. Run: npm install -g pnpm"
command -v docker >/dev/null 2>&1 || fail "docker is not installed. Install Docker Desktop from https://docker.com"

# Check docker compose (plugin or standalone)
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  fail "docker compose is not available. Install Docker Compose v2+"
fi

# Verify Node.js version >= 20
NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js 20+ required (found $(node -v))"
fi

ok "All prerequisites met (node $(node -v), pnpm $(pnpm -v), docker)"

# ─── Environment file ───
info "Checking environment file..."

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    ok "Created .env from .env.example"
    warn "Review .env and update values as needed"
  else
    warn "No .env.example found -- you may need to create .env manually"
  fi
else
  ok ".env already exists"
fi

# ─── Create recordings directory ───
info "Creating recordings directory..."
mkdir -p recordings
ok "Recordings directory ready"

# ─── Install dependencies ───
info "Installing Node.js dependencies..."
pnpm install
ok "Dependencies installed"

# ─── Build shared packages ───
info "Building shared packages..."
pnpm --filter @osp/shared build
ok "@osp/shared built"

pnpm --filter @osp/extension-sdk build
ok "@osp/extension-sdk built"

# ─── Start infrastructure services ───
info "Starting infrastructure services (Redis + go2rtc)..."
$COMPOSE -f infra/docker/docker-compose.yml up -d redis go2rtc
ok "Infrastructure containers started"

# ─── Wait for Redis to be healthy ───
info "Waiting for Redis to be healthy..."
RETRIES=30
until docker exec "$(docker ps -qf 'name=redis')" redis-cli ping 2>/dev/null | grep -q PONG; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    fail "Redis did not become healthy within 30 seconds"
  fi
  sleep 1
done
ok "Redis is healthy"

# ─── Print success ───
echo ""
echo -e "${GREEN}${BOLD}  Setup complete!${RESET}"
echo ""
echo "  Service URLs:"
echo "  ──────────────────────────────────"
echo "  Gateway:   http://localhost:3000"
echo "  Web App:   http://localhost:3001"
echo "  go2rtc:    http://localhost:1984"
echo "  Redis:     redis://localhost:6379"
echo ""
echo "  Demo RTSP streams (via go2rtc):"
echo "  ──────────────────────────────────"
echo "  demo-cam-1: rtsp://localhost:8554/demo-cam-1"
echo "  demo-cam-2: rtsp://localhost:8554/demo-cam-2"
echo ""
echo -e "  Run ${BOLD}pnpm dev${RESET} to start all dev servers."
echo ""
