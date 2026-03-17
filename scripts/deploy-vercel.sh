#!/usr/bin/env bash
set -euo pipefail

# ─── Deploy OSP Web App to Vercel ────────────────────────────────────────────
# Prerequisites:
#   - Vercel CLI installed: npm i -g vercel
#   - Authenticated: vercel login
#   - Project linked: vercel link (run once from apps/web/)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ENVIRONMENT="${1:-preview}"

echo "==> Building shared packages..."
cd "$ROOT_DIR"
pnpm --filter @osp/shared build

echo "==> Deploying web app to Vercel ($ENVIRONMENT)..."
cd "$ROOT_DIR/apps/web"

if [ "$ENVIRONMENT" = "production" ]; then
  vercel deploy --prod
else
  vercel deploy
fi

echo "==> Vercel deployment complete."
