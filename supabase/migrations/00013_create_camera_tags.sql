-- Camera tags (grouping / labeling)
CREATE TABLE camera_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3B82F6',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_camera_tags_tenant_name ON camera_tags (tenant_id, name);
CREATE INDEX idx_camera_tags_tenant ON camera_tags (tenant_id);

-- Junction table
CREATE TABLE camera_tag_assignments (
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES camera_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (camera_id, tag_id)
);

-- RLS
ALTER TABLE camera_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_tags_select" ON camera_tags
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "tenant_tags_insert" ON camera_tags
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "tenant_tags_delete" ON camera_tags
  FOR DELETE USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Tag assignments use the camera's tenant implicitly
CREATE POLICY "tag_assign_select" ON camera_tag_assignments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM cameras WHERE cameras.id = camera_id
    AND cameras.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  ));
CREATE POLICY "tag_assign_insert" ON camera_tag_assignments
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM cameras WHERE cameras.id = camera_id
    AND cameras.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  ));
CREATE POLICY "tag_assign_delete" ON camera_tag_assignments
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM cameras WHERE cameras.id = camera_id
    AND cameras.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  ));
