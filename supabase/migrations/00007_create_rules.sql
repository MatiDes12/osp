CREATE TABLE alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger_event event_type NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}',
  actions jsonb NOT NULL DEFAULT '[]',
  enabled boolean NOT NULL DEFAULT true,
  schedule jsonb,
  camera_ids uuid[],
  zone_ids uuid[],
  cooldown_sec int NOT NULL DEFAULT 60,
  priority int NOT NULL DEFAULT 100,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rules_tenant_enabled ON alert_rules (tenant_id) WHERE enabled = true;
