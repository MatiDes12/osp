CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  plan tenant_plan NOT NULL DEFAULT 'free',
  settings jsonb NOT NULL DEFAULT '{}',
  branding jsonb NOT NULL DEFAULT '{}',
  logo_url text,
  custom_domain text,
  max_cameras int NOT NULL DEFAULT 4,
  max_users int NOT NULL DEFAULT 2,
  retention_days int NOT NULL DEFAULT 7,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_tenants_slug ON tenants (slug);
