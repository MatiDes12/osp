#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

API_URL="${API_URL:-http://localhost:3000}"
API_TOKEN="${API_TOKEN:-}"
USER_JWT="${USER_JWT:-}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is required"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required"
  exit 1
fi

if [[ -z "$API_TOKEN" ]]; then
  echo "ERROR: API_TOKEN is not set (set in .env or env var)"
  exit 1
fi

pass() { echo "PASS: $1"; }
warn() { echo "WARN: $1"; }
step() { echo; echo "==> $1"; }

step "1) Start required services"
docker compose -f "$COMPOSE_FILE" up -d redis go2rtc gateway camera-ingest >/dev/null
docker compose -f "$COMPOSE_FILE" ps
pass "Services started"

step "2) Verify internal online-cameras endpoint auth + response"
internal_json="$(curl -sS -H "X-Internal-Token: $API_TOKEN" "$API_URL/api/v1/cameras/internal/online")"
if [[ "$internal_json" != *"\"success\":true"* ]]; then
  echo "ERROR: /api/v1/cameras/internal/online did not return success=true"
  echo "$internal_json"
  exit 1
fi
pass "Internal endpoint returns success=true"

step "3) Check camera-ingest logs for auth failures"
ingest_logs="$(docker compose -f "$COMPOSE_FILE" logs --tail=200 camera-ingest || true)"
if [[ "$ingest_logs" == *"401"* ]]; then
  warn "camera-ingest logs contain 401 (check API_TOKEN and gateway env)"
else
  pass "No obvious 401 in recent camera-ingest logs"
fi

step "4) Optional events API check (requires USER_JWT)"
if [[ -n "$USER_JWT" ]]; then
  events_json="$(curl -sS -H "Authorization: Bearer $USER_JWT" "$API_URL/api/v1/events?type=motion&limit=10")"
  if [[ "$events_json" == *"\"success\":true"* ]]; then
    pass "Events endpoint reachable"
    if [[ "$events_json" == *"health-checker-motion-worker"* ]]; then
      pass "Found auto-detected motion event metadata source"
    else
      warn "No auto-detected motion event metadata found yet (trigger movement and re-run)"
    fi
  else
    warn "Events endpoint did not return success=true; check USER_JWT"
  fi
else
  warn "Skipping events API check; set USER_JWT to enable it"
fi

step "5) Snapshot endpoint sanity check"
if [[ "$internal_json" == *"\"id\":"* ]]; then
  # Best-effort camera id extraction without jq:
  camera_id="$(echo "$internal_json" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -n 1)"
  if [[ -n "$camera_id" ]]; then
    snapshot_status="$(curl -sS -o /dev/null -w "%{http_code}" "http://localhost:1984/api/frame.jpeg?src=$camera_id")"
    if [[ "$snapshot_status" == "200" ]]; then
      pass "go2rtc snapshot endpoint works for camera $camera_id"
    else
      warn "go2rtc snapshot returned HTTP $snapshot_status for camera $camera_id"
    fi
  else
    warn "Could not parse camera id from internal endpoint response"
  fi
else
  warn "No online cameras returned; motion detection cannot run"
fi

echo
echo "Smoke checklist complete."
echo "Tip: create movement in front of a camera, wait 10-15s, then re-run this script."

