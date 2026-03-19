# OSP — Production Launch Checklist

Work through every item before going live. Check off each one in a separate copy of this document.

---

## Environment & Secrets

- [ ] `.env` file (or platform env vars) set for all required variables:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DATABASE_URL` (with correct password)
  - `OSP_ENCRYPTION_KEY` (generate: `openssl rand -hex 32`)
- [ ] Optional but recommended:
  - `SENTRY_DSN` (error monitoring)
  - `RESEND_API_KEY` (email alerts)
  - `AI_PROVIDER` + `OPENAI_API_KEY` (AI detection)
- [ ] Redis password set: `REDIS_PASSWORD=<strong-password>`
- [ ] Secrets rotated from default/dev values
- [ ] No secrets committed to git (`.env` is in `.gitignore`)

---

## Database

- [ ] All 14 migrations applied to production Supabase:
  ```bash
  export SUPABASE_ACCESS_TOKEN=<your-token>
  npx supabase db push --linked
  ```
- [ ] RLS policies verified (test cross-tenant access is blocked)
- [ ] Extension marketplace seed data applied:
  ```sql
  -- Run infra/supabase/seed/extensions.sql in Supabase SQL editor
  ```
- [ ] Backup strategy confirmed (Supabase automatic backups on Pro plan)

---

## Infrastructure

- [ ] Redis deployed with persistence (`appendonly yes`) and password
- [ ] go2rtc accessible from the internet (required for remote WebRTC)
- [ ] TURN server configured for WebRTC NAT traversal:
  - Add to `infra/docker/go2rtc.yaml`:
    ```yaml
    webrtc:
      turn:
        listen: ":3478"
        username: "osp"
        password: "<strong-password>"
    ```
  - Or use Cloudflare TURN: `NEXT_PUBLIC_TURN_URL=turns:...`
- [ ] Docker resource limits configured (see `infra/docker/docker-compose.prod.yml`)

---

## Web App (Vercel)

- [ ] Vercel project connected to `MatiDes12/osp` repo
- [ ] Root directory set to `apps/web`
- [ ] Build command: `cd ../.. && pnpm --filter @osp/shared build && pnpm --filter @osp/web build`
- [ ] Environment variables added in Vercel dashboard:
  - `NEXT_PUBLIC_API_URL` (your gateway URL)
  - `NEXT_PUBLIC_WS_URL` (your WebSocket URL)
  - `NEXT_PUBLIC_GO2RTC_URL` (your go2rtc URL)
  - `NEXT_PUBLIC_SENTRY_DSN` (optional)
- [ ] Custom domain configured
- [ ] SSL certificate issued (Vercel handles this automatically)
- [ ] Deploy: `bash scripts/deploy-vercel.sh`

---

## API Gateway (Fly.io)

- [ ] Fly.io app created: `fly apps create osp-gateway`
- [ ] Secrets set: `fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...`
- [ ] Deploy: `bash scripts/deploy-fly.sh gateway`
- [ ] Health check passing: `https://your-app.fly.dev/health/ready`
- [ ] CORS origins updated: `GATEWAY_CORS_ORIGINS=https://your-domain.com`

---

## Security

- [ ] HTTPS enforced everywhere (no HTTP endpoints)
- [ ] CORS origins restricted to production domain only
- [ ] Rate limiting active (verify via `/health/metrics`)
- [ ] Supabase RLS tested with a non-admin user
- [ ] No debug endpoints exposed in production (`/api/v1/dev/*` disabled)
- [ ] Audit logs enabled for admin actions

---

## Monitoring

- [ ] Sentry configured and receiving events
- [ ] `/health/detailed` endpoint returning healthy for all services
- [ ] Prometheus metrics accessible at `/health/metrics`
- [ ] Uptime monitoring set up (e.g., Uptime Robot pinging `/health`)
- [ ] Alert on camera_offline events configured

---

## Go2rtc (WebRTC)

- [ ] go2rtc accessible on ports 1984, 8554, 8555
- [ ] STUN server working (test at http://go2rtc-url:1984)
- [ ] TURN server configured for clients behind NAT
- [ ] go2rtc CORS enabled: `api.origin: "*"`
- [ ] Firewall allows UDP on port 8555 (WebRTC media)

---

## Post-Launch

- [ ] Add first real cameras
- [ ] Create at least one alert rule
- [ ] Test push notifications (mobile)
- [ ] Test email notifications (if Resend configured)
- [ ] Verify recordings are being saved
- [ ] Check storage usage and set retention policy
