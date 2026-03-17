CREATE TABLE cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  protocol camera_protocol NOT NULL,
  connection_uri text NOT NULL,
  status camera_status NOT NULL DEFAULT 'connecting',
  location jsonb NOT NULL DEFAULT '{}',
  capabilities jsonb NOT NULL DEFAULT '{}',
  config jsonb NOT NULL DEFAULT '{}',
  ptz_capable boolean NOT NULL DEFAULT false,
  audio_capable boolean NOT NULL DEFAULT false,
  firmware_version text,
  manufacturer text,
  model text,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cameras_tenant ON cameras (tenant_id);
CREATE INDEX idx_cameras_tenant_status ON cameras (tenant_id, status);

CREATE TABLE camera_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  polygon_coordinates jsonb NOT NULL DEFAULT '[]',
  alert_enabled boolean NOT NULL DEFAULT true,
  sensitivity int NOT NULL DEFAULT 5,
  visible_to_roles text[] NOT NULL DEFAULT '{owner,admin,operator,viewer}',
  color_hex text NOT NULL DEFAULT '#FF0000',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_zones_camera ON camera_zones (camera_id);
CREATE INDEX idx_zones_tenant ON camera_zones (tenant_id);
