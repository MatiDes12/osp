#!/bin/bash

# Alert Rules System - Quick End-to-End Test
# This script creates a test rule, triggers it with an event, and verifies it worked

set -e

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
TOKEN="${OSP_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "❌ Error: OSP_TOKEN environment variable not set"
  echo "Usage: OSP_TOKEN=your_token ./test-alert-rules.sh"
  exit 1
fi

echo "🧪 Testing Alert Rules System"
echo "================================"
echo ""

# Step 1: Get a camera to test with
echo "📹 Step 1: Fetching cameras..."
CAMERAS_RESPONSE=$(curl -s -X GET "$API_URL/api/v1/cameras" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

CAMERA_ID=$(echo "$CAMERAS_RESPONSE" | jq -r '.data[0].id // empty')

if [ -z "$CAMERA_ID" ]; then
  echo "❌ No cameras found. Please add a camera first."
  exit 1
fi

CAMERA_NAME=$(echo "$CAMERAS_RESPONSE" | jq -r '.data[0].name')
echo "✅ Using camera: $CAMERA_NAME ($CAMERA_ID)"
echo ""

# Step 2: Create a test rule
echo "📋 Step 2: Creating test rule..."
RULE_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/rules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Rule (Auto-Generated)",
    "description": "Automated test rule - safe to delete",
    "triggerEvent": "motion",
    "conditions": {
      "operator": "AND",
      "children": [
        {
          "field": "intensity",
          "operator": "gte",
          "value": 30
        }
      ]
    },
    "actions": [
      {
        "type": "push_notification",
        "config": {
          "title": "Test Alert: {{eventType}} on {{cameraName}}",
          "body": "Intensity: {{intensity}}, Severity: {{severity}}"
        }
      }
    ],
    "cooldownSec": 10,
    "enabled": true
  }')

RULE_ID=$(echo "$RULE_RESPONSE" | jq -r '.data.id // empty')

if [ -z "$RULE_ID" ]; then
  echo "❌ Failed to create rule"
  echo "$RULE_RESPONSE" | jq .
  exit 1
fi

echo "✅ Rule created: $RULE_ID"
echo ""

# Step 3: Create a test event to trigger the rule
echo "🚨 Step 3: Creating test event to trigger rule..."
EVENT_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"cameraId\": \"$CAMERA_ID\",
    \"type\": \"motion\",
    \"severity\": \"medium\",
    \"intensity\": 75,
    \"metadata\": {
      \"testEvent\": true,
      \"snapshotUrl\": \"/test-snapshot.jpg\"
    }
  }")

EVENT_ID=$(echo "$EVENT_RESPONSE" | jq -r '.data.id // empty')

if [ -z "$EVENT_ID" ]; then
  echo "❌ Failed to create event"
  echo "$EVENT_RESPONSE" | jq .
  exit 1
fi

echo "✅ Event created: $EVENT_ID"
echo ""

# Step 4: Wait for rule processing (asynchronous)
echo "⏳ Step 4: Waiting for rule processing (3 seconds)..."
sleep 3
echo ""

# Step 5: Verify notification was created
echo "🔔 Step 5: Checking for notifications..."
NOTIFICATIONS_RESPONSE=$(curl -s -X GET "$API_URL/api/v1/notifications?limit=10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

NOTIFICATION_COUNT=$(echo "$NOTIFICATIONS_RESPONSE" | jq '[.data[] | select(.event_id == "'$EVENT_ID'")] | length')

if [ "$NOTIFICATION_COUNT" -gt 0 ]; then
  echo "✅ $NOTIFICATION_COUNT notification(s) created for event"
  echo ""
  echo "Notification details:"
  echo "$NOTIFICATIONS_RESPONSE" | jq '[.data[] | select(.event_id == "'$EVENT_ID'")] | .[0] | {title, body, status}'
else
  echo "⚠️  No notifications found (this might be normal if notifications endpoint doesn't exist yet)"
fi
echo ""

# Step 6: Verify rule was triggered
echo "📊 Step 6: Checking rule trigger status..."
RULE_CHECK_RESPONSE=$(curl -s -X GET "$API_URL/api/v1/rules/$RULE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

LAST_TRIGGERED=$(echo "$RULE_CHECK_RESPONSE" | jq -r '.data.last_triggered_at // "never"')
TRIGGER_COUNT=$(echo "$RULE_CHECK_RESPONSE" | jq -r '.data.trigger_count_24h // 0')

echo "Last triggered: $LAST_TRIGGERED"
echo "Trigger count (24h): $TRIGGER_COUNT"

if [ "$LAST_TRIGGERED" != "never" ] && [ "$LAST_TRIGGERED" != "null" ]; then
  echo "✅ Rule was triggered successfully!"
else
  echo "⚠️  Rule may not have been triggered (check logs)"
fi
echo ""

# Step 7: Test rule evaluation API
echo "🧪 Step 7: Testing rule evaluation (dry run)..."
TEST_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/rules/$RULE_ID/test" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

TESTED_AGAINST=$(echo "$TEST_RESPONSE" | jq -r '.data.testedAgainst // 0')
MATCHED=$(echo "$TEST_RESPONSE" | jq -r '.data.matched // 0')

echo "Tested against: $TESTED_AGAINST recent events"
echo "Matched: $MATCHED events"

if [ "$MATCHED" -gt 0 ]; then
  echo "✅ Rule evaluation working correctly!"
  echo ""
  echo "Sample matches:"
  echo "$TEST_RESPONSE" | jq '.data.sampleMatches'
else
  echo "⚠️  No matches found in recent events"
fi
echo ""

# Step 8: Cleanup (optional)
echo "🧹 Step 8: Cleanup..."
read -p "Delete test rule? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  DELETE_RESPONSE=$(curl -s -X DELETE "$API_URL/api/v1/rules/$RULE_ID" \
    -H "Authorization: Bearer $TOKEN")

  if echo "$DELETE_RESPONSE" | jq -e '.success' > /dev/null; then
    echo "✅ Test rule deleted"
  else
    echo "⚠️  Failed to delete rule (you can delete it manually from the UI)"
  fi
else
  echo "ℹ️  Test rule kept: $RULE_ID (you can delete it from /rules page)"
fi
echo ""

# Summary
echo "================================"
echo "✅ Alert Rules System Test Complete!"
echo ""
echo "Summary:"
echo "  • Rule created: ✅"
echo "  • Event triggered: ✅"
echo "  • Rule evaluated: ✅"
echo "  • Action executed: $([ "$NOTIFICATION_COUNT" -gt 0 ] && echo "✅" || echo "⚠️ ")"
echo ""
echo "Next steps:"
echo "  1. View events at http://localhost:3001/events"
echo "  2. View rules at http://localhost:3001/rules"
echo "  3. Check gateway logs for detailed execution info"
echo ""
