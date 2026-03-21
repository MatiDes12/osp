-- License Plate Recognition (LPR)
-- Stores per-tenant plate watchlists. Detections are stored as event metadata
-- (type = 'lpr.detected' or 'lpr.alert' for watchlist hits).

CREATE TABLE lpr_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plate text NOT NULL,                        -- normalised uppercase, e.g. "ABC1234"
  label text NOT NULL DEFAULT '',             -- human note, e.g. "Staff - John", "BANNED"
  alert_on_detect boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One watchlist entry per (tenant, plate)
CREATE UNIQUE INDEX idx_lpr_watchlist_tenant_plate ON lpr_watchlist(tenant_id, plate);
CREATE INDEX idx_lpr_watchlist_tenant ON lpr_watchlist(tenant_id, created_at DESC);

ALTER TABLE lpr_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON lpr_watchlist
  USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);
