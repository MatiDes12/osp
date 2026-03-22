-- Add go2rtc_url to edge_agents so the gateway knows where to proxy
-- WebRTC signaling for cameras managed by this agent.
-- Set via GO2RTC_PUBLIC_URL env var on the edge agent (e.g. a Cloudflare Tunnel URL).

ALTER TABLE edge_agents ADD COLUMN go2rtc_url text;

COMMENT ON COLUMN edge_agents.go2rtc_url IS
  'Publicly reachable go2rtc API URL reported by the agent (e.g. https://xxx.trycloudflare.com). '
  'Used by the gateway WHEP proxy to forward WebRTC signaling to the correct go2rtc instance.';
