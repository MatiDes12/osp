-- Add direct snapshot URL column to events table.
-- The existing snapshot_id FK references the snapshots table which requires
-- a full snapshot row. For motion events from the edge agent we just store
-- the presigned URL (or R2 path) directly to keep the insert simple.
ALTER TABLE events ADD COLUMN IF NOT EXISTS snapshot_url text;
