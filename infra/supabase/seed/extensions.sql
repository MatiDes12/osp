INSERT INTO extensions (name, version, author_name, author_email, description, status, categories, manifest) VALUES
  ('Slack Alerts', '1.0.0', 'OSP Team', 'team@osp.dev', 'Send camera alerts to Slack channels with snapshots and event details.', 'published', '{"alerts","integrations"}', '{"permissions":["events:read","notifications:send"]}'),
  ('Email Digest', '1.0.0', 'OSP Team', 'team@osp.dev', 'Daily or weekly email summaries of camera events and system health.', 'published', '{"alerts","reports"}', '{"permissions":["events:read","cameras:read"]}'),
  ('People Counter', '1.2.0', 'Analytics Co', 'dev@analytics.co', 'Count people entering and exiting zones with AI detection. Generates hourly reports.', 'published', '{"analytics","ai"}', '{"permissions":["events:read","cameras:read","storage:write"]}'),
  ('License Plate Reader', '0.9.0', 'AutoVision', 'hello@autovision.io', 'Recognize license plates from parking camera feeds and log entries.', 'published', '{"ai","security"}', '{"permissions":["cameras:read","events:write","storage:write"]}'),
  ('Webhook Relay', '1.1.0', 'OSP Team', 'team@osp.dev', 'Forward events to any HTTP endpoint with customizable payload templates.', 'published', '{"integrations"}', '{"permissions":["events:read"]}'),
  ('Heatmap Generator', '0.8.0', 'Analytics Co', 'dev@analytics.co', 'Generate foot traffic heatmaps from camera zones over configurable time periods.', 'published', '{"analytics"}', '{"permissions":["events:read","cameras:read","storage:write"]}'),
  ('PagerDuty Alerts', '1.0.0', 'OSP Team', 'team@osp.dev', 'Create PagerDuty incidents for critical camera events.', 'published', '{"alerts","integrations"}', '{"permissions":["events:read","notifications:send"]}'),
  ('Recording Archiver', '1.0.0', 'OSP Team', 'team@osp.dev', 'Automatically archive recordings to long-term cold storage after retention period.', 'published', '{"storage"}', '{"permissions":["recordings:read","storage:write"]}')
ON CONFLICT (name) DO NOTHING;
