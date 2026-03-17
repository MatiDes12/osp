#!/bin/bash
set -euo pipefail

# OSP Development Seed Script
# Seeds demo data via the Gateway API
# Usage: ./scripts/seed-dev.sh [API_URL]

API_URL="${1:-http://localhost:3000}"

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()  { echo -e "${BOLD}[INFO]${RESET}  $1"; }
ok()    { echo -e "${GREEN}[OK]${RESET}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${RESET}  $1"; }
fail()  { echo -e "${RED}[FAIL]${RESET}  $1"; exit 1; }

# Helper: POST JSON and extract a field from the response
post_json() {
  local endpoint="$1"
  local data="$2"
  curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$data" \
    "${API_URL}${endpoint}"
}

# Helper: POST with auth token
post_auth() {
  local endpoint="$1"
  local data="$2"
  local token="$3"
  curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -d "$data" \
    "${API_URL}${endpoint}"
}

echo ""
echo -e "${BOLD}  OSP Development Seed${RESET}"
echo "  ====================="
echo "  API: ${API_URL}"
echo ""

# ─── Check API is reachable ───
info "Checking API availability..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "000" ]; then
  fail "Cannot reach ${API_URL}. Is the gateway running? (pnpm dev or docker compose up gateway)"
fi
ok "API is reachable"

# ─── Register demo user ───
info "Registering demo user..."
REGISTER_RESPONSE=$(post_json "/api/v1/auth/register" '{
  "email": "demo@osp.dev",
  "password": "demo1234",
  "displayName": "Demo Admin",
  "tenantName": "Demo Organization"
}')

HTTP_CODE=$(echo "$REGISTER_RESPONSE" | tail -1)
BODY=$(echo "$REGISTER_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
  ok "Demo user registered (demo@osp.dev / demo1234)"
elif [ "$HTTP_CODE" = "409" ]; then
  warn "Demo user already exists, continuing..."
else
  warn "Registration returned HTTP ${HTTP_CODE}: ${BODY}"
fi

# ─── Login to get token ───
info "Logging in as demo user..."
LOGIN_RESPONSE=$(post_json "/api/v1/auth/login" '{
  "email": "demo@osp.dev",
  "password": "demo1234"
}')

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -1)
BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')

TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  # Try accessToken field
  TOKEN=$(echo "$BODY" | grep -o '"accessToken":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -z "$TOKEN" ]; then
  warn "Could not extract auth token. Some seed operations may fail."
  warn "Response: ${BODY}"
  TOKEN="dev-seed-token"
fi

ok "Authenticated"

# ─── Add demo cameras ───
info "Adding demo cameras..."

CAMERAS=(
  '{"name":"Front Entrance","protocol":"rtsp","connectionUri":"rtsp://localhost:8554/demo-cam-1","location":{"building":"Main","floor":"1","area":"Entrance"},"manufacturer":"OSP Demo","model":"TestPattern HD"}'
  '{"name":"Parking Lot A","protocol":"rtsp","connectionUri":"rtsp://localhost:8554/demo-cam-2","location":{"building":"External","floor":"0","area":"Parking A"},"manufacturer":"OSP Demo","model":"TestPattern 4K"}'
  '{"name":"Server Room","protocol":"rtsp","connectionUri":"rtsp://192.168.1.100:554/stream1","location":{"building":"Main","floor":"B1","area":"Data Center"},"manufacturer":"Hikvision","model":"DS-2CD2143G2"}'
  '{"name":"Loading Dock","protocol":"onvif","connectionUri":"rtsp://192.168.1.101:554/cam/realmonitor","location":{"building":"Warehouse","floor":"1","area":"Dock B"},"manufacturer":"Dahua","model":"IPC-HDW3849H","ptzCapable":true}'
)

for cam in "${CAMERAS[@]}"; do
  CAM_NAME=$(echo "$cam" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
  RESPONSE=$(post_auth "/api/v1/cameras" "$cam" "$TOKEN")
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    ok "Camera added: ${CAM_NAME}"
  else
    warn "Camera '${CAM_NAME}' returned HTTP ${HTTP_CODE}"
  fi
done

# ─── Create alert rules ───
info "Creating alert rules..."

RULES=(
  '{"name":"Motion at Entrance After Hours","description":"Detect motion at the front entrance between 10PM and 6AM","triggerEvent":"motion","conditions":{"timeRange":{"start":"22:00","end":"06:00"},"minIntensity":0.3},"actions":[{"type":"push","title":"After-hours motion detected","body":"Motion detected at {{camera.name}}"}],"cooldownSec":120}'
  '{"name":"Person Detection - Server Room","description":"Alert when a person is detected in the server room","triggerEvent":"person","conditions":{"minConfidence":0.8},"actions":[{"type":"push","title":"Person in Server Room","body":"Person detected in server room via {{camera.name}}"},{"type":"email","to":"security@osp.dev"}],"cooldownSec":300}'
  '{"name":"Camera Offline Alert","description":"Notify when any camera goes offline","triggerEvent":"camera_offline","conditions":{},"actions":[{"type":"push","title":"Camera Offline","body":"{{camera.name}} has gone offline"},{"type":"webhook","url":"https://hooks.example.com/osp/camera-offline"}],"cooldownSec":600}'
)

for rule in "${RULES[@]}"; do
  RULE_NAME=$(echo "$rule" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
  RESPONSE=$(post_auth "/api/v1/alert-rules" "$rule" "$TOKEN")
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    ok "Alert rule created: ${RULE_NAME}"
  else
    warn "Alert rule '${RULE_NAME}' returned HTTP ${HTTP_CODE}"
  fi
done

# ─── Create sample events ───
info "Creating sample events..."

EVENTS=(
  '{"type":"motion","severity":"low","cameraName":"Front Entrance","metadata":{"intensity":0.45,"region":"entrance-zone"}}'
  '{"type":"person","severity":"medium","cameraName":"Front Entrance","metadata":{"confidence":0.92,"boundingBox":{"x":120,"y":80,"w":200,"h":400}}}'
  '{"type":"motion","severity":"low","cameraName":"Parking Lot A","metadata":{"intensity":0.67,"region":"lot-a-south"}}'
  '{"type":"camera_offline","severity":"high","cameraName":"Server Room","metadata":{"lastSeen":"2026-03-16T08:30:00Z","reason":"connection_timeout"}}'
  '{"type":"person","severity":"medium","cameraName":"Loading Dock","metadata":{"confidence":0.87,"boundingBox":{"x":300,"y":150,"w":180,"h":380}}}'
)

for evt in "${EVENTS[@]}"; do
  EVT_TYPE=$(echo "$evt" | grep -o '"type":"[^"]*"' | head -1 | cut -d'"' -f4)
  EVT_CAM=$(echo "$evt" | grep -o '"cameraName":"[^"]*"' | cut -d'"' -f4)
  RESPONSE=$(post_auth "/api/v1/events" "$evt" "$TOKEN")
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    ok "Event created: ${EVT_TYPE} on ${EVT_CAM}"
  else
    warn "Event (${EVT_TYPE} on ${EVT_CAM}) returned HTTP ${HTTP_CODE}"
  fi
done

echo ""
echo -e "${GREEN}${BOLD}  Seed complete!${RESET}"
echo ""
echo "  Demo credentials:"
echo "  ──────────────────────────────────"
echo "  Email:    demo@osp.dev"
echo "  Password: demo1234"
echo ""
echo "  Seeded:"
echo "    4 cameras"
echo "    3 alert rules"
echo "    5 sample events"
echo ""
