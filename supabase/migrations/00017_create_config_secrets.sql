-- Config / secrets key-value store.
-- Holds env keys, API keys, passwords, and other sensitive config.
-- DB values override process.env when present.
--
-- Bootstrap: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must remain in env
-- to connect; all other keys can be stored here.
-- Keys use same names as env vars (e.g. REDIS_URL, SENDGRID_API_KEY).
-- If a key is absent from config_secrets, the app falls back to process.env
-- and continues normally — no hard failure.

CREATE TABLE config_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  value text NOT NULL,
  scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'tenant')),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per key for global scope (tenant_id IS NULL)
CREATE UNIQUE INDEX idx_config_secrets_key_global ON config_secrets (key) WHERE tenant_id IS NULL;
-- One row per (key, tenant_id) for tenant scope
CREATE UNIQUE INDEX idx_config_secrets_key_tenant ON config_secrets (key, tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX idx_config_secrets_key ON config_secrets (key);
CREATE INDEX idx_config_secrets_scope_tenant ON config_secrets (scope, tenant_id);

COMMENT ON TABLE config_secrets IS 'Key-value store for env vars, secrets, API keys. DB overrides process.env.';
COMMENT ON COLUMN config_secrets.scope IS 'global = platform-wide, tenant = per-tenant override';
COMMENT ON COLUMN config_secrets.tenant_id IS 'NULL for global scope; set for tenant-scoped overrides';

-- RLS: only service_role (backend) can access. No policies = no JWT access.
ALTER TABLE config_secrets ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for authenticated/anon.
-- Service role bypasses RLS and can read/write.
