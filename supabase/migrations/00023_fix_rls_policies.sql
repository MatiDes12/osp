-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00023: Fix broken RLS policies + add missing RLS on extension tables
--
-- Problems fixed:
--   1. api_keys   — policy used current_setting('app.tenant_id') which is never
--                   set by the gateway; fails closed (NULL = UUID → false) but is
--                   inconsistent with every other table. Replace with auth.jwt().
--   2. lpr_watchlist — same broken current_setting() pattern.
--   3. extensions / extension_hooks — RLS was never enabled; any direct Supabase
--                   client call could read/write all extensions.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Fix api_keys ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation ON api_keys;

CREATE POLICY tenant_isolation ON api_keys
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── 2. Fix lpr_watchlist ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation ON lpr_watchlist;

CREATE POLICY tenant_isolation ON lpr_watchlist
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── 3. Enable RLS on extensions ──────────────────────────────────────────────

ALTER TABLE extensions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read published extensions (marketplace)
CREATE POLICY "extensions_read_published" ON extensions
  FOR SELECT USING (status = 'published');

-- Only service_role (gateway admin) can write
CREATE POLICY "extensions_service_write" ON extensions
  FOR ALL USING (auth.role() = 'service_role');

-- ── 4. Enable RLS on extension_hooks ─────────────────────────────────────────

ALTER TABLE extension_hooks ENABLE ROW LEVEL SECURITY;

-- Hooks are readable for published extensions
CREATE POLICY "extension_hooks_read_published" ON extension_hooks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM extensions
      WHERE extensions.id = extension_hooks.extension_id
        AND extensions.status = 'published'
    )
  );

-- Only service_role can write
CREATE POLICY "extension_hooks_service_write" ON extension_hooks
  FOR ALL USING (auth.role() = 'service_role');
