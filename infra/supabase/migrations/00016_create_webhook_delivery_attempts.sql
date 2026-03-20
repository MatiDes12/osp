-- Webhook delivery attempts log
-- Tracks every HTTP POST attempt made by the rules engine, including retries.

CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id)      ON DELETE CASCADE,
  rule_id          uuid        NOT NULL REFERENCES alert_rules(id)  ON DELETE CASCADE,
  event_id         uuid                 REFERENCES events(id)       ON DELETE SET NULL,
  url              text        NOT NULL,
  request_payload  jsonb       NOT NULL DEFAULT '{}',
  request_headers  jsonb       NOT NULL DEFAULT '{}',
  attempt_number   integer     NOT NULL CHECK (attempt_number >= 1),
  delivery_status  text        NOT NULL CHECK (delivery_status IN ('delivered', 'failed')),
  response_status  integer,
  response_body    text,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Fast lookups by tenant (most common query: "show me all attempts for my tenant")
CREATE INDEX idx_webhook_attempts_tenant_time
  ON webhook_delivery_attempts (tenant_id, created_at DESC);

-- Filter by rule (delivery log panel on the rules page)
CREATE INDEX idx_webhook_attempts_rule
  ON webhook_delivery_attempts (rule_id, created_at DESC);

-- Filter by event (event detail page future use)
CREATE INDEX idx_webhook_attempts_event
  ON webhook_delivery_attempts (event_id)
  WHERE event_id IS NOT NULL;

-- Filter by status (show only failures / successes)
CREATE INDEX idx_webhook_attempts_status
  ON webhook_delivery_attempts (tenant_id, delivery_status, created_at DESC);

-- RLS: tenants can only see their own attempts
ALTER TABLE webhook_delivery_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON webhook_delivery_attempts
  USING (tenant_id = (
    SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1
  ));

-- Auto-purge attempts older than 90 days to keep the table lean.
-- Run manually or via pg_cron:
--   SELECT cron.schedule('purge-webhook-attempts', '0 3 * * *',
--     $$DELETE FROM webhook_delivery_attempts WHERE created_at < now() - interval '90 days'$$);
