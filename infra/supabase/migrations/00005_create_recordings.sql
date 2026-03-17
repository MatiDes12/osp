CREATE TABLE recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  duration_sec int,
  storage_path text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  format text NOT NULL DEFAULT 'hls',
  trigger recording_trigger NOT NULL DEFAULT 'motion',
  status recording_status NOT NULL DEFAULT 'recording',
  retention_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recordings_camera_time ON recordings (camera_id, start_time DESC);
CREATE INDEX idx_recordings_tenant_time ON recordings (tenant_id, start_time DESC);
CREATE INDEX idx_recordings_retention ON recordings (retention_until) WHERE status != 'deleted';

CREATE TABLE snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  recording_id uuid REFERENCES recordings(id) ON DELETE SET NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  storage_path text NOT NULL,
  ai_tags jsonb,
  width_px int,
  height_px int,
  size_bytes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshots_camera_time ON snapshots (camera_id, captured_at DESC);
CREATE INDEX idx_snapshots_recording ON snapshots (recording_id);
