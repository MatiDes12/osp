-- SSO / Identity provider configuration per tenant
-- Supports Google (Workspace), Microsoft Azure AD / Entra ID, and GitHub OAuth

CREATE TABLE sso_configs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider          text        NOT NULL CHECK (provider IN ('google', 'azure', 'github')),
  enabled           boolean     NOT NULL DEFAULT true,
  -- If non-empty, only emails whose domain is in this list can use this provider
  allowed_domains   text[]      NOT NULL DEFAULT '{}',
  -- Auto-create a user record on first SSO login (set false to require manual invite)
  auto_provision    boolean     NOT NULL DEFAULT true,
  -- Default role assigned to auto-provisioned users
  default_role      user_role   NOT NULL DEFAULT 'viewer',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

CREATE INDEX idx_sso_configs_tenant ON sso_configs(tenant_id);

ALTER TABLE sso_configs ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their own SSO configs
CREATE POLICY "sso_configs_tenant_read" ON sso_configs
  FOR SELECT
  USING (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid);

-- Only service role can write (gateway uses service role key)
CREATE POLICY "sso_configs_service_write" ON sso_configs
  FOR ALL
  USING (auth.role() = 'service_role');
