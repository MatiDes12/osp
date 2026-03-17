CREATE TABLE extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  version text NOT NULL,
  author_name text NOT NULL,
  author_email text NOT NULL,
  description text NOT NULL DEFAULT '',
  manifest jsonb NOT NULL DEFAULT '{}',
  status extension_status NOT NULL DEFAULT 'draft',
  marketplace_url text,
  wasm_bundle_url text,
  icon_url text,
  categories text[] NOT NULL DEFAULT '{}',
  install_count int NOT NULL DEFAULT 0,
  avg_rating float NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  extension_id uuid NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  installed_version text NOT NULL,
  previous_versions text[] NOT NULL DEFAULT '{}',
  resource_usage jsonb NOT NULL DEFAULT '{}',
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_tenant_ext_unique ON tenant_extensions (tenant_id, extension_id);
CREATE INDEX idx_tenant_ext_tenant ON tenant_extensions (tenant_id) WHERE enabled = true;

CREATE TABLE extension_hooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id uuid NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  hook_name text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  handler_function text NOT NULL,
  required_permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ext_hooks_name ON extension_hooks (hook_name, priority);
