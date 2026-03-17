-- OSP Development Seed Data
-- Run against a fresh database after migrations
-- Usage: psql -f infra/supabase/seed/dev.sql

BEGIN;

-- ─── Tenant ───
INSERT INTO tenants (id, name, slug, plan, max_cameras, max_users, retention_days, settings)
VALUES (
  '00000000-0000-4000-a000-000000000001',
  'Demo Organization',
  'demo-org',
  'pro',
  25,
  10,
  30,
  '{"timezone": "America/New_York", "language": "en", "notifications": {"email": true, "push": true}}'::jsonb
);

-- ─── User ───
-- Note: password hash is for "demo1234" using bcrypt. In practice, Supabase Auth
-- manages passwords. This user ID should match the Supabase Auth user.
INSERT INTO users (id, tenant_id, email, display_name, auth_provider, last_login_at)
VALUES (
  '00000000-0000-4000-b000-000000000001',
  '00000000-0000-4000-a000-000000000001',
  'demo@osp.dev',
  'Demo Admin',
  'email',
  NOW()
);

INSERT INTO user_roles (id, user_id, tenant_id, role)
VALUES (
  '00000000-0000-4000-b000-000000000010',
  '00000000-0000-4000-b000-000000000001',
  '00000000-0000-4000-a000-000000000001',
  'owner'
);

-- ─── Cameras ───
INSERT INTO cameras (id, tenant_id, name, protocol, connection_uri, status, location, manufacturer, model, last_seen_at, ptz_capable, audio_capable) VALUES
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001',
   'Front Entrance', 'rtsp', 'rtsp://localhost:8554/demo-cam-1', 'online',
   '{"building": "Main", "floor": "1", "area": "Entrance"}'::jsonb,
   'OSP Demo', 'TestPattern HD', NOW(), false, false),

  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000001',
   'Parking Lot A', 'rtsp', 'rtsp://localhost:8554/demo-cam-2', 'online',
   '{"building": "External", "floor": "0", "area": "Parking A"}'::jsonb,
   'OSP Demo', 'TestPattern 4K', NOW(), false, false),

  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000001',
   'Server Room', 'rtsp', 'rtsp://192.168.1.100:554/stream1', 'online',
   '{"building": "Main", "floor": "B1", "area": "Data Center"}'::jsonb,
   'Hikvision', 'DS-2CD2143G2', NOW() - INTERVAL '2 minutes', false, true),

  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000001',
   'Loading Dock', 'onvif', 'rtsp://192.168.1.101:554/cam/realmonitor', 'online',
   '{"building": "Warehouse", "floor": "1", "area": "Dock B"}'::jsonb,
   'Dahua', 'IPC-HDW3849H', NOW() - INTERVAL '30 seconds', true, true),

  ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000001',
   'Back Alley', 'rtsp', 'rtsp://192.168.1.102:554/live', 'offline',
   '{"building": "Main", "floor": "1", "area": "Rear Exit"}'::jsonb,
   'Reolink', 'RLC-810A', NOW() - INTERVAL '3 hours', false, true),

  ('00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000001',
   'Lobby Camera', 'rtsp', 'rtsp://192.168.1.103:554/ch01', 'connecting',
   '{"building": "Main", "floor": "1", "area": "Lobby"}'::jsonb,
   'Amcrest', 'IP8M-2696E', NULL, false, false);

-- ─── Camera Zones ───
INSERT INTO camera_zones (id, camera_id, tenant_id, name, polygon_coordinates, alert_enabled, sensitivity, color_hex, sort_order) VALUES
  ('00000000-0000-4000-d000-000000000001',
   '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001',
   'Entrance Door Zone',
   '[{"x": 100, "y": 200}, {"x": 500, "y": 200}, {"x": 500, "y": 600}, {"x": 100, "y": 600}]'::jsonb,
   true, 7, '#FF4444', 1),

  ('00000000-0000-4000-d000-000000000002',
   '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001',
   'Walkway Zone',
   '[{"x": 500, "y": 100}, {"x": 1200, "y": 100}, {"x": 1200, "y": 700}, {"x": 500, "y": 700}]'::jsonb,
   true, 4, '#44AAFF', 2),

  ('00000000-0000-4000-d000-000000000003',
   '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000001',
   'Vehicle Entry Lane',
   '[{"x": 200, "y": 400}, {"x": 800, "y": 400}, {"x": 800, "y": 1000}, {"x": 200, "y": 1000}]'::jsonb,
   true, 6, '#FFAA00', 1),

  ('00000000-0000-4000-d000-000000000004',
   '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000001',
   'Server Rack Area',
   '[{"x": 0, "y": 0}, {"x": 1280, "y": 0}, {"x": 1280, "y": 720}, {"x": 0, "y": 720}]'::jsonb,
   true, 9, '#FF0000', 1);

-- ─── Events (20 sample events over the last 24 hours) ───
INSERT INTO events (id, camera_id, zone_id, tenant_id, type, severity, detected_at, metadata, intensity, acknowledged) VALUES
  -- Motion events
  (gen_random_uuid(), '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
   '00000000-0000-4000-a000-000000000001', 'motion', 'low',
   NOW() - INTERVAL '23 hours', '{"region": "entrance-door", "intensity": 0.35}'::jsonb, 0.35, true),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000002',
   '00000000-0000-4000-a000-000000000001', 'motion', 'low',
   NOW() - INTERVAL '22 hours', '{"region": "walkway", "intensity": 0.42}'::jsonb, 0.42, true),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-d000-000000000003',
   '00000000-0000-4000-a000-000000000001', 'motion', 'medium',
   NOW() - INTERVAL '20 hours', '{"region": "vehicle-entry", "intensity": 0.71}'::jsonb, 0.71, true),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000002', NULL,
   '00000000-0000-4000-a000-000000000001', 'motion', 'low',
   NOW() - INTERVAL '18 hours', '{"region": "general", "intensity": 0.28}'::jsonb, 0.28, true),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000004', NULL,
   '00000000-0000-4000-a000-000000000001', 'motion', 'low',
   NOW() - INTERVAL '16 hours', '{"region": "dock-area", "intensity": 0.55}'::jsonb, 0.55, true),

  -- Person detection events
  (gen_random_uuid(), '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
   '00000000-0000-4000-a000-000000000001', 'person', 'medium',
   NOW() - INTERVAL '15 hours', '{"confidence": 0.94, "boundingBox": {"x": 320, "y": 180, "w": 200, "h": 420}}'::jsonb, 0.94, true),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000002',
   '00000000-0000-4000-a000-000000000001', 'person', 'medium',
   NOW() - INTERVAL '14 hours', '{"confidence": 0.88, "boundingBox": {"x": 600, "y": 200, "w": 180, "h": 380}}'::jsonb, 0.88, true),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-d000-000000000004',
   '00000000-0000-4000-a000-000000000001', 'person', 'high',
   NOW() - INTERVAL '12 hours', '{"confidence": 0.97, "boundingBox": {"x": 400, "y": 100, "w": 220, "h": 450}, "alert": "after-hours"}'::jsonb, 0.97, false),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000004', NULL,
   '00000000-0000-4000-a000-000000000001', 'person', 'medium',
   NOW() - INTERVAL '10 hours', '{"confidence": 0.91, "boundingBox": {"x": 150, "y": 250, "w": 190, "h": 400}}'::jsonb, 0.91, true),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-d000-000000000003',
   '00000000-0000-4000-a000-000000000001', 'person', 'medium',
   NOW() - INTERVAL '8 hours', '{"confidence": 0.85, "boundingBox": {"x": 500, "y": 300, "w": 170, "h": 360}}'::jsonb, 0.85, false),

  -- Vehicle events
  (gen_random_uuid(), '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-d000-000000000003',
   '00000000-0000-4000-a000-000000000001', 'vehicle', 'low',
   NOW() - INTERVAL '19 hours', '{"type": "car", "confidence": 0.93, "direction": "entering"}'::jsonb, 0.93, true),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-d000-000000000003',
   '00000000-0000-4000-a000-000000000001', 'vehicle', 'low',
   NOW() - INTERVAL '17 hours', '{"type": "truck", "confidence": 0.89, "direction": "exiting"}'::jsonb, 0.89, true),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000004', NULL,
   '00000000-0000-4000-a000-000000000001', 'vehicle', 'low',
   NOW() - INTERVAL '11 hours', '{"type": "van", "confidence": 0.87, "direction": "entering"}'::jsonb, 0.87, true),

  -- Camera offline events
  (gen_random_uuid(), '00000000-0000-4000-c000-000000000005', NULL,
   '00000000-0000-4000-a000-000000000001', 'camera_offline', 'high',
   NOW() - INTERVAL '3 hours', '{"lastSeen": "' || (NOW() - INTERVAL '3 hours')::text || '", "reason": "connection_timeout"}'::jsonb, 0.0, false),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000005', NULL,
   '00000000-0000-4000-a000-000000000001', 'camera_offline', 'high',
   NOW() - INTERVAL '6 hours', '{"lastSeen": "' || (NOW() - INTERVAL '6 hours')::text || '", "reason": "network_error", "reconnectAttempts": 5}'::jsonb, 0.0, true),

  -- More recent events (last few hours)
  (gen_random_uuid(), '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
   '00000000-0000-4000-a000-000000000001', 'motion', 'low',
   NOW() - INTERVAL '4 hours', '{"region": "entrance-door", "intensity": 0.52}'::jsonb, 0.52, false),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
   '00000000-0000-4000-a000-000000000001', 'person', 'medium',
   NOW() - INTERVAL '3 hours 15 minutes', '{"confidence": 0.90, "boundingBox": {"x": 280, "y": 160, "w": 210, "h": 430}}'::jsonb, 0.90, false),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000002', NULL,
   '00000000-0000-4000-a000-000000000001', 'motion', 'medium',
   NOW() - INTERVAL '2 hours', '{"region": "lot-a-south", "intensity": 0.68}'::jsonb, 0.68, false),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000004', NULL,
   '00000000-0000-4000-a000-000000000001', 'person', 'medium',
   NOW() - INTERVAL '1 hour', '{"confidence": 0.92, "boundingBox": {"x": 380, "y": 200, "w": 195, "h": 410}}'::jsonb, 0.92, false),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-d000-000000000004',
   '00000000-0000-4000-a000-000000000001', 'motion', 'low',
   NOW() - INTERVAL '30 minutes', '{"region": "rack-area", "intensity": 0.31}'::jsonb, 0.31, false);

-- ─── Alert Rules ───
INSERT INTO alert_rules (id, tenant_id, name, description, trigger_event, conditions, actions, enabled, cooldown_sec, camera_ids, zone_ids, schedule, priority) VALUES
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-a000-000000000001',
   'Motion at Entrance After Hours',
   'Detect motion at the front entrance between 10PM and 6AM',
   'motion',
   '{"timeRange": {"start": "22:00", "end": "06:00"}, "minIntensity": 0.3}'::jsonb,
   '[{"type": "push", "title": "After-hours motion detected", "body": "Motion detected at {{camera.name}}"}]'::jsonb,
   true, 120,
   ARRAY['00000000-0000-4000-c000-000000000001']::uuid[],
   ARRAY['00000000-0000-4000-d000-000000000001', '00000000-0000-4000-d000-000000000002']::uuid[],
   '{"days": ["mon", "tue", "wed", "thu", "fri"]}'::jsonb,
   100),

  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-a000-000000000001',
   'Person Detection - Server Room',
   'Alert when a person is detected in the server room',
   'person',
   '{"minConfidence": 0.8}'::jsonb,
   '[{"type": "push", "title": "Person in Server Room", "body": "Person detected in server room via {{camera.name}}"}, {"type": "email", "to": "security@osp.dev"}]'::jsonb,
   true, 300,
   ARRAY['00000000-0000-4000-c000-000000000003']::uuid[],
   ARRAY['00000000-0000-4000-d000-000000000004']::uuid[],
   NULL,
   50),

  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-a000-000000000001',
   'Camera Offline Alert',
   'Notify when any camera goes offline',
   'camera_offline',
   '{}'::jsonb,
   '[{"type": "push", "title": "Camera Offline", "body": "{{camera.name}} has gone offline"}, {"type": "webhook", "url": "https://hooks.example.com/osp/camera-offline"}]'::jsonb,
   true, 600,
   NULL, NULL, NULL,
   10),

  ('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-a000-000000000001',
   'Vehicle at Loading Dock',
   'Detect vehicles approaching the loading dock during business hours',
   'vehicle',
   '{"minConfidence": 0.7, "timeRange": {"start": "06:00", "end": "20:00"}}'::jsonb,
   '[{"type": "in_app", "title": "Vehicle at dock", "body": "Vehicle detected at loading dock"}]'::jsonb,
   true, 180,
   ARRAY['00000000-0000-4000-c000-000000000004']::uuid[],
   NULL,
   '{"days": ["mon", "tue", "wed", "thu", "fri", "sat"]}'::jsonb,
   200),

  ('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-a000-000000000001',
   'Parking Lot Night Watch (Disabled)',
   'Monitor parking lot for any activity at night - currently disabled for testing',
   'motion',
   '{"timeRange": {"start": "20:00", "end": "06:00"}, "minIntensity": 0.2}'::jsonb,
   '[{"type": "push", "title": "Night activity", "body": "Activity in parking lot"}]'::jsonb,
   false, 60,
   ARRAY['00000000-0000-4000-c000-000000000002']::uuid[],
   ARRAY['00000000-0000-4000-d000-000000000003']::uuid[],
   NULL,
   300);

-- ─── Recordings ───
INSERT INTO recordings (id, camera_id, tenant_id, start_time, end_time, duration_sec, storage_path, size_bytes, format, trigger, status, retention_until) VALUES
  (gen_random_uuid(), '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001',
   NOW() - INTERVAL '23 hours', NOW() - INTERVAL '22 hours 55 minutes', 300,
   '/recordings/demo-org/cam-001/2026-03-15/rec-001.m3u8', 52428800, 'hls', 'motion', 'complete',
   NOW() + INTERVAL '29 days'),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001',
   NOW() - INTERVAL '15 hours', NOW() - INTERVAL '14 hours 50 minutes', 600,
   '/recordings/demo-org/cam-001/2026-03-15/rec-002.m3u8', 104857600, 'hls', 'ai_detection', 'complete',
   NOW() + INTERVAL '29 days'),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000001',
   NOW() - INTERVAL '19 hours', NOW() - INTERVAL '18 hours 45 minutes', 900,
   '/recordings/demo-org/cam-002/2026-03-15/rec-001.m3u8', 157286400, 'hls', 'motion', 'complete',
   NOW() + INTERVAL '29 days'),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000001',
   NOW() - INTERVAL '8 hours', NOW() - INTERVAL '7 hours 50 minutes', 600,
   '/recordings/demo-org/cam-002/2026-03-16/rec-001.m3u8', 104857600, 'hls', 'ai_detection', 'complete',
   NOW() + INTERVAL '29 days'),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000001',
   NOW() - INTERVAL '12 hours', NOW() - INTERVAL '11 hours 55 minutes', 300,
   '/recordings/demo-org/cam-003/2026-03-15/rec-001.m3u8', 52428800, 'hls', 'ai_detection', 'complete',
   NOW() + INTERVAL '29 days'),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000001',
   NOW() - INTERVAL '30 minutes', NULL, NULL,
   '/recordings/demo-org/cam-003/2026-03-16/rec-002.m3u8', 8388608, 'hls', 'continuous', 'recording',
   NOW() + INTERVAL '30 days'),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000001',
   NOW() - INTERVAL '11 hours', NOW() - INTERVAL '10 hours 50 minutes', 600,
   '/recordings/demo-org/cam-004/2026-03-15/rec-001.m3u8', 104857600, 'hls', 'motion', 'complete',
   NOW() + INTERVAL '29 days'),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000001',
   NOW() - INTERVAL '1 hour', NOW() - INTERVAL '50 minutes', 600,
   '/recordings/demo-org/cam-004/2026-03-16/rec-001.m3u8', 104857600, 'hls', 'ai_detection', 'complete',
   NOW() + INTERVAL '30 days'),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000001',
   NOW() - INTERVAL '6 hours', NOW() - INTERVAL '5 hours 58 minutes', 120,
   '/recordings/demo-org/cam-005/2026-03-16/rec-001.m3u8', 20971520, 'hls', 'motion', 'partial',
   NOW() + INTERVAL '29 days'),

  (gen_random_uuid(), '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001',
   NOW() - INTERVAL '4 hours', NOW() - INTERVAL '3 hours 50 minutes', 600,
   '/recordings/demo-org/cam-001/2026-03-16/rec-001.m3u8', 104857600, 'hls', 'motion', 'complete',
   NOW() + INTERVAL '30 days');

-- ─── Notifications ───
INSERT INTO notifications (id, user_id, event_id, tenant_id, channel, status, title, body, sent_at, read_at) VALUES
  (gen_random_uuid(),
   '00000000-0000-4000-b000-000000000001',
   (SELECT id FROM events WHERE type = 'camera_offline' AND detected_at > NOW() - INTERVAL '4 hours' LIMIT 1),
   '00000000-0000-4000-a000-000000000001',
   'push', 'delivered',
   'Camera Offline: Back Alley',
   'Back Alley camera has gone offline. Last seen 3 hours ago. Reason: connection_timeout',
   NOW() - INTERVAL '3 hours',
   NULL),

  (gen_random_uuid(),
   '00000000-0000-4000-b000-000000000001',
   (SELECT id FROM events WHERE type = 'person' AND severity = 'high' LIMIT 1),
   '00000000-0000-4000-a000-000000000001',
   'push', 'read',
   'Person Detected: Server Room',
   'A person was detected in the Server Room after hours with 97% confidence.',
   NOW() - INTERVAL '12 hours',
   NOW() - INTERVAL '11 hours');

COMMIT;
