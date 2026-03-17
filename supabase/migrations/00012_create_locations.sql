CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  city text,
  country text,
  lat double precision,
  lng double precision,
  timezone text DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_locations_tenant ON locations (tenant_id);

-- RLS
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_locations_select" ON locations
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "tenant_locations_insert" ON locations
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "tenant_locations_update" ON locations
  FOR UPDATE USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "tenant_locations_delete" ON locations
  FOR DELETE USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Add location_id to cameras
ALTER TABLE cameras ADD COLUMN location_id uuid REFERENCES locations(id) ON DELETE SET NULL;
CREATE INDEX idx_cameras_location ON cameras (location_id);
