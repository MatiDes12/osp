-- Expo push notifications support
-- Adds a device push token to the tenant-scoped users table.

ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token text;

-- Allow a user to update ONLY their own row (tenant-scoped) so they can register
-- their Expo push token.
CREATE POLICY "tenant_users_update_self_push_token" ON users
  FOR UPDATE
  USING (
    id = auth.uid()
    AND tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    id = auth.uid()
    AND tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  );

