-- Add last_snapshot_url column to cameras table.
-- Populated by the edge agent after uploading a snapshot to R2.
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS last_snapshot_url text;
