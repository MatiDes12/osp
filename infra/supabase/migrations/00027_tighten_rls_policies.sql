-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00027: Tighten RLS policies — restrict admin/superadmin resources
--
-- Problems fixed:
--   1. extensions + extension_hooks — "read published" policy allowed any
--      authenticated user across all tenants to read marketplace data, including
--      wasm_bundle_url, manifest (may contain sensitive defaults), and hooks.
--      All reads must now go through the gateway (service_role).
--
--   2. audit_logs — all authenticated tenant users could read ALL audit entries
--      in their tenant, including actions by admins. Now restricted:
--        • admin / owner  → full tenant audit log
--        • viewer / operator → only their own entries (actor_id = auth.uid())
--
--   3. snapshots — missing INSERT and DELETE policies. Added explicit service_role
--      policies to document and enforce that only the backend writes snapshots.
--
--   4. webhook_delivery_attempts — any tenant user could see delivery logs.
--      Restricted to admin/owner roles (operators and viewers do not manage
--      webhook rules and should not see delivery payloads).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: read the caller's OSP role from JWT user_metadata ────────────────
-- Supabase stores custom claims in user_metadata; the gateway sets "role" there.
-- Falls back to 'viewer' so unset/malformed JWTs default to least privilege.

CREATE OR REPLACE FUNCTION osp_caller_role() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  AS $$
    SELECT COALESCE(
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() ->> 'role',
      'viewer'
    )
  $$;

-- ── 1. Extensions — service_role only ────────────────────────────────────────

-- Remove the permissive "any authenticated user can read published" policy.
DROP POLICY IF EXISTS "extensions_read_published" ON extensions;

-- Direct Supabase client reads are blocked; all reads go through the gateway.
CREATE POLICY "extensions_service_read" ON extensions
  FOR SELECT USING (auth.role() = 'service_role');

-- ── 2. Extension hooks — service_role only ───────────────────────────────────

DROP POLICY IF EXISTS "extension_hooks_read_published" ON extension_hooks;

CREATE POLICY "extension_hooks_service_read" ON extension_hooks
  FOR SELECT USING (auth.role() = 'service_role');

-- ── 3. Audit logs — admin/owner see all; others see only own entries ─────────

-- Drop the old permissive all-users policy.
DROP POLICY IF EXISTS "tenant_audit_select" ON audit_logs;

CREATE POLICY "tenant_audit_select" ON audit_logs
  FOR SELECT USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND (
      -- Admins and owners can read all entries in their tenant
      osp_caller_role() IN ('admin', 'owner')
      -- Everyone else can only see their own actions
      OR actor_id = auth.uid()
    )
  );

-- Service role can INSERT audit entries (written by the gateway).
CREATE POLICY "audit_service_insert" ON audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ── 4. Snapshots — explicit service_role write policies ──────────────────────

-- SELECT already exists (tenant isolation). Add INSERT and DELETE so the
-- intent is explicit: only the gateway (service_role) can write snapshots.
DROP POLICY IF EXISTS "snapshots_service_insert" ON snapshots;
DROP POLICY IF EXISTS "snapshots_service_delete" ON snapshots;

CREATE POLICY "snapshots_service_insert" ON snapshots
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "snapshots_service_delete" ON snapshots
  FOR DELETE USING (auth.role() = 'service_role');

-- ── 5. Webhook delivery attempts — admin/owner only ──────────────────────────

-- Delivery logs may contain webhook payloads and URLs. Restrict to the roles
-- that actually configure webhooks (admin/owner). Viewers and operators should
-- not be able to enumerate webhook targets or delivery history.

DROP POLICY IF EXISTS "tenant_isolation" ON webhook_delivery_attempts;

CREATE POLICY "tenant_isolation_admin" ON webhook_delivery_attempts
  FOR SELECT USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND osp_caller_role() IN ('admin', 'owner')
  );

-- Service role can insert/update delivery records.
CREATE POLICY "webhook_attempts_service_write" ON webhook_delivery_attempts
  FOR ALL USING (auth.role() = 'service_role');
