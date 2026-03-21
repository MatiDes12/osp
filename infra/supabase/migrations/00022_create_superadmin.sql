-- Migration: 00022_create_superadmin
-- Adds superadmin support: flag on user_metadata + helper functions for OSP company admins.
-- Superadmins bypass tenant RLS and can view/manage all tenants.

-- ─── Add status column to tenants (active | suspended) ──────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'suspended'));

-- ─── Grant superadmin to a user ──────────────────────────────────────────────
-- Usage: SELECT grant_superadmin('user-uuid-here');
CREATE OR REPLACE FUNCTION grant_superadmin(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || '{"is_superadmin": true}'::jsonb
  WHERE id = target_user_id;
END;
$$;

-- ─── Revoke superadmin from a user ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION revoke_superadmin(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data - 'is_superadmin'
  WHERE id = target_user_id;
END;
$$;

-- ─── Admin stats view (service role only) ────────────────────────────────────
-- Aggregate counts across all tenants. Used by the /admin/stats endpoint.
CREATE OR REPLACE VIEW admin_tenant_stats AS
SELECT
  t.id                                            AS tenant_id,
  t.name                                          AS tenant_name,
  t.plan,
  t.status,
  t.created_at,
  COUNT(DISTINCT c.id)                            AS camera_count,
  COUNT(DISTINCT CASE WHEN c.status = 'online' THEN c.id END) AS cameras_online,
  COUNT(DISTINCT e.id)                            AS event_count_7d,
  COUNT(DISTINCT r.id)                            AS recording_count,
  MAX(c.last_seen_at)                             AS last_active_at
FROM tenants t
LEFT JOIN cameras c       ON c.tenant_id = t.id
LEFT JOIN events e        ON e.tenant_id = t.id
  AND e.created_at >= NOW() - INTERVAL '7 days'
LEFT JOIN recordings r    ON r.tenant_id = t.id
GROUP BY t.id, t.name, t.plan, t.status, t.created_at;

-- Only service role can read this view (bypasses RLS)
REVOKE ALL ON admin_tenant_stats FROM anon, authenticated;
GRANT SELECT ON admin_tenant_stats TO service_role;
