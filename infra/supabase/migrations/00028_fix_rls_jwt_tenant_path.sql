-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00028: Fix RLS tenant isolation — wrong JWT claim path
--
-- Root cause: migrations 00011–00016, 00023 used `auth.jwt() ->> 'tenant_id'`
-- (top-level JWT claim) but `tenant_id` is stored in `user_metadata`, so the
-- correct path is `auth.jwt() -> 'user_metadata' ->> 'tenant_id'`.
-- The top-level path always returns NULL, meaning tenant isolation only worked
-- because the gateway uses service_role (which bypasses RLS). Any direct
-- Supabase client access would have seen ALL tenants' data.
--
-- Fix: introduce osp_caller_tenant_id() helper (mirrors osp_caller_role() from
-- migration 00027), then rebuild every broken policy.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: read caller's tenant ID from JWT user_metadata ───────────────────

CREATE OR REPLACE FUNCTION osp_caller_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  AS $$
    SELECT (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid
  $$;

-- ── tenants ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_self_select" ON tenants;
CREATE POLICY "tenant_self_select" ON tenants
  FOR SELECT USING (id = osp_caller_tenant_id());

-- ── users ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_users_select" ON users;
DROP POLICY IF EXISTS "tenant_users_insert" ON users;
DROP POLICY IF EXISTS "tenant_users_update_self_push_token" ON users;

CREATE POLICY "tenant_users_select" ON users
  FOR SELECT USING (tenant_id = osp_caller_tenant_id());

CREATE POLICY "tenant_users_insert" ON users
  FOR INSERT WITH CHECK (tenant_id = osp_caller_tenant_id());

-- Push-token self-update: user can only update their own row, within their tenant
CREATE POLICY "tenant_users_update_self_push_token" ON users
  FOR UPDATE
  USING (id = auth.uid() AND tenant_id = osp_caller_tenant_id())
  WITH CHECK (id = auth.uid() AND tenant_id = osp_caller_tenant_id());

-- ── user_roles ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_roles_select" ON user_roles;
CREATE POLICY "tenant_roles_select" ON user_roles
  FOR SELECT USING (tenant_id = osp_caller_tenant_id());

-- ── cameras ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_cameras_select" ON cameras;
DROP POLICY IF EXISTS "tenant_cameras_insert" ON cameras;
DROP POLICY IF EXISTS "tenant_cameras_update" ON cameras;
DROP POLICY IF EXISTS "tenant_cameras_delete" ON cameras;

CREATE POLICY "tenant_cameras_select" ON cameras
  FOR SELECT USING (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_cameras_insert" ON cameras
  FOR INSERT WITH CHECK (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_cameras_update" ON cameras
  FOR UPDATE USING (tenant_id = osp_caller_tenant_id())
  WITH CHECK (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_cameras_delete" ON cameras
  FOR DELETE USING (tenant_id = osp_caller_tenant_id());

-- ── camera_zones ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_zones_select" ON camera_zones;
DROP POLICY IF EXISTS "tenant_zones_insert" ON camera_zones;
DROP POLICY IF EXISTS "tenant_zones_update" ON camera_zones;
DROP POLICY IF EXISTS "tenant_zones_delete" ON camera_zones;

CREATE POLICY "tenant_zones_select" ON camera_zones
  FOR SELECT USING (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_zones_insert" ON camera_zones
  FOR INSERT WITH CHECK (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_zones_update" ON camera_zones
  FOR UPDATE USING (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_zones_delete" ON camera_zones
  FOR DELETE USING (tenant_id = osp_caller_tenant_id());

-- ── recordings ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_recordings_select" ON recordings;
DROP POLICY IF EXISTS "tenant_recordings_insert" ON recordings;
DROP POLICY IF EXISTS "tenant_recordings_delete" ON recordings;

CREATE POLICY "tenant_recordings_select" ON recordings
  FOR SELECT USING (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_recordings_insert" ON recordings
  FOR INSERT WITH CHECK (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_recordings_delete" ON recordings
  FOR DELETE USING (tenant_id = osp_caller_tenant_id());

-- ── snapshots ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_snapshots_select" ON snapshots;
CREATE POLICY "tenant_snapshots_select" ON snapshots
  FOR SELECT USING (tenant_id = osp_caller_tenant_id());
-- INSERT and DELETE remain service_role only (added in migration 00027)

-- ── events ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_events_select" ON events;
DROP POLICY IF EXISTS "tenant_events_insert" ON events;
DROP POLICY IF EXISTS "tenant_events_update" ON events;

CREATE POLICY "tenant_events_select" ON events
  FOR SELECT USING (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_events_insert" ON events
  FOR INSERT WITH CHECK (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_events_update" ON events
  FOR UPDATE USING (tenant_id = osp_caller_tenant_id());

-- ── alert_rules ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_rules_select" ON alert_rules;
DROP POLICY IF EXISTS "tenant_rules_insert" ON alert_rules;
DROP POLICY IF EXISTS "tenant_rules_update" ON alert_rules;
DROP POLICY IF EXISTS "tenant_rules_delete" ON alert_rules;

CREATE POLICY "tenant_rules_select" ON alert_rules
  FOR SELECT USING (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_rules_insert" ON alert_rules
  FOR INSERT WITH CHECK (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_rules_update" ON alert_rules
  FOR UPDATE USING (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_rules_delete" ON alert_rules
  FOR DELETE USING (tenant_id = osp_caller_tenant_id());

-- ── notifications ─────────────────────────────────────────────────────────────

-- user_notifications_select uses auth.uid() — correct, no change.
DROP POLICY IF EXISTS "tenant_notifications_insert" ON notifications;
CREATE POLICY "tenant_notifications_insert" ON notifications
  FOR INSERT WITH CHECK (tenant_id = osp_caller_tenant_id());

-- ── tenant_extensions ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_ext_select" ON tenant_extensions;
DROP POLICY IF EXISTS "tenant_ext_insert" ON tenant_extensions;
DROP POLICY IF EXISTS "tenant_ext_update" ON tenant_extensions;
DROP POLICY IF EXISTS "tenant_ext_delete" ON tenant_extensions;

CREATE POLICY "tenant_ext_select" ON tenant_extensions
  FOR SELECT USING (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_ext_insert" ON tenant_extensions
  FOR INSERT WITH CHECK (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_ext_update" ON tenant_extensions
  FOR UPDATE USING (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_ext_delete" ON tenant_extensions
  FOR DELETE USING (tenant_id = osp_caller_tenant_id());

-- ── audit_logs ────────────────────────────────────────────────────────────────
-- Replaces the policy from migration 00027 (same name, wrong JWT path).

DROP POLICY IF EXISTS "tenant_audit_select" ON audit_logs;
CREATE POLICY "tenant_audit_select" ON audit_logs
  FOR SELECT USING (
    tenant_id = osp_caller_tenant_id()
    AND (
      osp_caller_role() IN ('admin', 'owner')
      OR actor_id = auth.uid()
    )
  );
-- audit_service_insert remains unchanged (service_role check, added in 00027).

-- ── locations ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_locations_select" ON locations;
DROP POLICY IF EXISTS "tenant_locations_insert" ON locations;
DROP POLICY IF EXISTS "tenant_locations_update" ON locations;
DROP POLICY IF EXISTS "tenant_locations_delete" ON locations;

CREATE POLICY "tenant_locations_select" ON locations
  FOR SELECT USING (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_locations_insert" ON locations
  FOR INSERT WITH CHECK (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_locations_update" ON locations
  FOR UPDATE USING (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_locations_delete" ON locations
  FOR DELETE USING (tenant_id = osp_caller_tenant_id());

-- ── camera_tags ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_tags_select" ON camera_tags;
DROP POLICY IF EXISTS "tenant_tags_insert" ON camera_tags;
DROP POLICY IF EXISTS "tenant_tags_delete" ON camera_tags;

CREATE POLICY "tenant_tags_select" ON camera_tags
  FOR SELECT USING (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_tags_insert" ON camera_tags
  FOR INSERT WITH CHECK (tenant_id = osp_caller_tenant_id());
CREATE POLICY "tenant_tags_delete" ON camera_tags
  FOR DELETE USING (tenant_id = osp_caller_tenant_id());

-- ── camera_tag_assignments ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tag_assign_select" ON camera_tag_assignments;
DROP POLICY IF EXISTS "tag_assign_insert" ON camera_tag_assignments;
DROP POLICY IF EXISTS "tag_assign_delete" ON camera_tag_assignments;

CREATE POLICY "tag_assign_select" ON camera_tag_assignments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM cameras
    WHERE cameras.id = camera_id
      AND cameras.tenant_id = osp_caller_tenant_id()
  ));
CREATE POLICY "tag_assign_insert" ON camera_tag_assignments
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM cameras
    WHERE cameras.id = camera_id
      AND cameras.tenant_id = osp_caller_tenant_id()
  ));
CREATE POLICY "tag_assign_delete" ON camera_tag_assignments
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM cameras
    WHERE cameras.id = camera_id
      AND cameras.tenant_id = osp_caller_tenant_id()
  ));

-- ── api_keys ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_isolation" ON api_keys;
CREATE POLICY "tenant_isolation" ON api_keys
  USING (tenant_id = osp_caller_tenant_id());

-- ── lpr_watchlist ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_isolation" ON lpr_watchlist;
CREATE POLICY "tenant_isolation" ON lpr_watchlist
  USING (tenant_id = osp_caller_tenant_id());

-- ── webhook_delivery_attempts ─────────────────────────────────────────────────
-- Replaces tenant_isolation_admin from migration 00027 (wrong JWT path).

DROP POLICY IF EXISTS "tenant_isolation_admin" ON webhook_delivery_attempts;
CREATE POLICY "tenant_isolation_admin" ON webhook_delivery_attempts
  FOR SELECT USING (
    tenant_id = osp_caller_tenant_id()
    AND osp_caller_role() IN ('admin', 'owner')
  );
-- webhook_attempts_service_write remains unchanged (service_role, added in 00027).

-- ── sso_configs ───────────────────────────────────────────────────────────────
-- 00020 already used the correct user_metadata path — no change needed.
-- edge_agents 00021 also correct — no change needed.
