-- Add floor_plan JSONB column to locations table.
-- Stores the visual floor plan layout as an array of objects
-- (rooms, walls, doors, windows, cameras, furniture, labels).
ALTER TABLE locations ADD COLUMN floor_plan jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN locations.floor_plan IS 'Visual floor plan layout — array of objects with type, position, size, rotation, and metadata';
