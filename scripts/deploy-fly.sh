#!/usr/bin/env bash
set -euo pipefail

# ─── Deploy OSP Services to Fly.io ──────────────────────────────────────────
# Prerequisites:
#   - Fly CLI installed: curl -L https://fly.io/install.sh | sh
#   - Authenticated: fly auth login
#   - Apps created: fly apps create osp-gateway (etc.)
#   - Secrets set: fly secrets set SUPABASE_URL=... -a osp-gateway

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SERVICE="${1:-all}"

deploy_gateway() {
  echo "==> Deploying gateway to Fly.io..."
  cd "$ROOT_DIR"
  fly deploy \
    --config services/gateway/fly.toml \
    --dockerfile infra/docker/gateway.Dockerfile \
    --wait-timeout 300
  echo "==> Gateway deployed."
}

deploy_go_service() {
  local svc="$1"
  echo "==> Deploying $svc to Fly.io..."
  cd "$ROOT_DIR/services/$svc"
  fly deploy \
    --config fly.toml \
    --wait-timeout 300
  echo "==> $svc deployed."
}

case "$SERVICE" in
  gateway)
    deploy_gateway
    ;;
  camera-ingest|video-pipeline|event-engine)
    deploy_go_service "$SERVICE"
    ;;
  all)
    deploy_gateway
    for svc in camera-ingest video-pipeline event-engine; do
      deploy_go_service "$svc"
    done
    ;;
  *)
    echo "Usage: $0 [gateway|camera-ingest|video-pipeline|event-engine|all]"
    exit 1
    ;;
esac

echo "==> All requested Fly.io deployments complete."
