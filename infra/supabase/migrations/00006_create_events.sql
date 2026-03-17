CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES camera_zones(id) ON DELETE SET NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type event_type NOT NULL,
  severity event_severity NOT NULL DEFAULT 'medium',
  detected_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}',
  snapshot_id uuid REFERENCES snapshots(id) ON DELETE SET NULL,
  clip_path text,
  intensity float NOT NULL DEFAULT 0,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_tenant_time ON events (tenant_id, detected_at DESC);
CREATE INDEX idx_events_camera_time ON events (camera_id, detected_at DESC);
CREATE INDEX idx_events_tenant_type_time ON events (tenant_id, type, detected_at DESC);
CREATE INDEX idx_events_zone ON events (zone_id, detected_at DESC);
CREATE INDEX idx_events_unacknowledged ON events (tenant_id, detected_at DESC) WHERE acknowledged = false;
