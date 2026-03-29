#!/usr/bin/env bash
# Build a distributable edge-agent folder (no monorepo) for ZIP / release attachments.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/osp-edge-bundle}"

mkdir -p "$OUT"
cp "$ROOT/infra/docker/docker-compose.agent.yml" "$OUT/"
cp "$ROOT/infra/docker/docker-compose.agent.win.yml" "$OUT/"
cp "$ROOT/infra/docker/go2rtc.agent.yaml" "$OUT/"
cp "$ROOT/infra/docker/.env.agent.example" "$OUT/env.example"
cp "$ROOT/infra/docker/edge/README.md" "$OUT/README.md"

echo "Edge bundle written to: $OUT"
echo "Zip example: (cd $(dirname "$OUT") && zip -r osp-edge-bundle.zip $(basename "$OUT"))"
