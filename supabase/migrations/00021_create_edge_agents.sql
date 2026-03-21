-- Edge computing agents
-- Each row represents an on-premise OSP Edge Agent binary that buffers
-- events locally and syncs them to the cloud gateway.

CREATE TABLE edge_agents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id        text        NOT NULL,               -- agent's self-reported ID (EDGE_AGENT_ID env)
  name            text        NOT NULL,
  location        text,                               -- display label, e.g. "Building A – Floor 2"
  status          text        NOT NULL DEFAULT 'offline'
                              CHECK (status IN ('online', 'offline', 'error')),
  version         text,
  cameras_active  int         NOT NULL DEFAULT 0,
  pending_events  int         NOT NULL DEFAULT 0,
  synced_events   int         NOT NULL DEFAULT 0,
  last_seen_at    timestamptz,
  config          jsonb       NOT NULL DEFAULT '{}',  -- reserved for future per-agent settings
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, agent_id)
);

CREATE INDEX idx_edge_agents_tenant    ON edge_agents(tenant_id);
CREATE INDEX idx_edge_agents_status    ON edge_agents(status);
CREATE INDEX idx_edge_agents_last_seen ON edge_agents(last_seen_at DESC);

ALTER TABLE edge_agents ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their own agents
CREATE POLICY "edge_agents_tenant_read" ON edge_agents
  FOR SELECT
  USING (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid);

-- Only service role writes (gateway uses service role key for heartbeats)
CREATE POLICY "edge_agents_service_write" ON edge_agents
  FOR ALL
  USING (auth.role() = 'service_role');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_edge_agents_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_edge_agents_updated_at
  BEFORE UPDATE ON edge_agents
  FOR EACH ROW EXECUTE FUNCTION update_edge_agents_updated_at();
