# Operations Runbook

Procedures for deploying, monitoring, troubleshooting, and maintaining OSP in production.

---

## Table of Contents

1. [Deployment](#deployment)
2. [Health Checks](#health-checks)
3. [Monitoring](#monitoring)
4. [Common Issues](#common-issues)
5. [Disaster Recovery](#disaster-recovery)
6. [Maintenance](#maintenance)

---

## Deployment

### Pre-Deployment Checklist

Before deploying to production, verify all items in [docs/PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md).

### Deploying the Web App (Vercel)

```bash
# Web app auto-deploys on push to main
# Manual deployment:
bash scripts/deploy-vercel.sh
```

**Deployment status:**

- Check [vercel.com/dashboard](https://vercel.com/dashboard)
- View logs: Vercel Dashboard → your project → Deployments

**Rollback to previous version:**

1. Go to Vercel Dashboard → Deployments
2. Find the last working deployment
3. Click → Settings → Promote to Production

### Deploying the API Gateway (Fly.io)

```bash
# Deploy to production
bash scripts/deploy-fly.sh gateway

# Check deployment status
fly status

# View logs
fly logs
```

**Rollback:**

```bash
fly apps list
fly releases -a osp-gateway
fly releases rollback -a osp-gateway
```

### Deploying Go Services (Docker/Kubernetes)

**Build and push image:**

```bash
cd services/camera-ingest
docker build -t osp-ingest:latest .
docker tag osp-ingest:latest yourregistry/osp-ingest:latest
docker push yourregistry/osp-ingest:latest
```

**Apply Kubernetes deployment:**

```bash
kubectl apply -f infra/k8s/camera-ingest.yaml
kubectl rollout status deployment/camera-ingest
```

**Rollback:**

```bash
kubectl rollout undo deployment/camera-ingest
kubectl rollout status deployment/camera-ingest
```

### Deploying Database Migrations

**Test locally first:**

```bash
npx supabase migration list
npx supabase db reset --linked  # Dev/staging only!
```

**Apply to production:**

```bash
export SUPABASE_ACCESS_TOKEN=<your-token>
npx supabase db push --linked
```

**Verify:**

```bash
npx supabase migration list --linked
```

---

## Health Checks

### API Gateway Health

```bash
# Basic health check
curl https://api.yourdomain.com/health

# Detailed health check (includes all services)
curl https://api.yourdomain.com/health/detailed

# Prometheus metrics
curl https://api.yourdomain.com/health/metrics
```

**Expected responses:**

```json
{
  "status": "ok",
  "timestamp": "2025-03-21T10:00:00Z"
}
```

```json
{
  "status": "ok",
  "services": {
    "supabase": "connected",
    "redis": "connected",
    "go2rtc": "connected"
  },
  "metrics": {
    "uptime": 86400,
    "requests": 10000
  }
}
```

### Database Health

```bash
# Check Supabase connection
curl https://api.yourdomain.com/health/db

# Direct database query
psql $DATABASE_URL -c "SELECT NOW();"
```

### Redis Health

```bash
# Check Redis connection
redis-cli -u $REDIS_URL PING
# Expected: PONG

# Check memory usage
redis-cli -u $REDIS_URL INFO memory
```

### go2rtc Health

```bash
# Check go2rtc is running
curl http://go2rtc:1984/api/
# Expected: JSON response with version

# List connected streams
curl http://go2rtc:1984/api/streams
```

### WebRTC Connectivity (Browser)

1. Open https://yourdomain.com/cameras
2. Open browser console: F12 → Console
3. Check for WebRTC errors: `getStats()` in console

**Common issues:**

- `no route to host` — TURN server misconfigured
- `ICE connection timeout` — NAT traversal failing
- `permission denied` — Browser permissions or CORS issue

---

## Monitoring

### Logs

**Vercel (Web App):**

```
Vercel Dashboard → Deployments → Logs
```

**Fly.io (API Gateway):**

```bash
fly logs --follow
fly logs --region <region>
```

**Docker Compose (Local/Staging):**

```bash
docker compose -f infra/docker/docker-compose.yml logs -f gateway
docker compose -f infra/docker/docker-compose.yml logs -f camera-ingest
```

**Kubernetes:**

```bash
kubectl logs deployment/camera-ingest -f
kubectl logs deployment/video-pipeline -f
kubectl logs deployment/event-engine -f
```

### Metrics

**Prometheus (if enabled):**

```bash
curl http://localhost:9090/api/v1/query?query=up
```

**Key metrics to monitor:**

| Metric                  | Alert Threshold  |
| ----------------------- | ---------------- |
| API response time (p95) | > 1000ms         |
| Error rate              | > 1% of requests |
| Redis latency (p95)     | > 100ms          |
| Camera offline count    | > 25% of total   |
| Recording queue size    | > 1000 pending   |
| Disk usage              | > 85%            |

### Alerting

**Set up in monitoring tool (Datadog, New Relic, etc.):**

1. **API Gateway down:** `/health` returns non-200
2. **Database unreachable:** Connection pool exhausted
3. **Redis disconnected:** Cache misses spike
4. **go2rtc offline:** Cameras can't stream
5. **Storage running out:** Free disk < 10GB
6. **High error rate:** Error logs exceed threshold

**Notification channels:**

- Email: critical incidents
- Slack: all alerts
- PagerDuty: p1 incidents (API down, DB down, data loss)

---

## Common Issues

### API Gateway Not Responding

**Symptoms:**

- `/health` returns 500 or timeout
- Web app shows "Cannot reach server"
- New deployments fail

**Check:**

```bash
# Is the service running?
fly status
kubectl get pod -l app=gateway

# Check recent logs
fly logs --limit=100

# What's the last error?
kubectl describe pod <pod-name>
```

**Troubleshooting:**

1. **Out of memory:** Restart the service

   ```bash
   fly apps restart gateway
   # or
   kubectl rollout restart deployment/gateway
   ```

2. **Database connection pool exhausted:**

   ```bash
   # Check connection count
   psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

   # If > 100, kill idle connections
   psql $DATABASE_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle';"
   ```

3. **Redis unavailable:**

   ```bash
   redis-cli -u $REDIS_URL PING

   # If no response, restart Redis
   # (instructions depend on your Redis host)
   ```

4. **Supabase API down:**
   - Check [status.supabase.com](https://status.supabase.com)
   - Wait for Supabase to recover
   - Monitor `/health/detailed` until "supabase": "connected"

**Rollback if critical:**

```bash
fly releases rollback
# or
kubectl rollout undo deployment/gateway
```

---

### Cameras Going Offline

**Symptoms:**

- Live view shows "Camera offline"
- Motion events not triggering
- go2rtc reports "stream unreachable"

**Check:**

1. **Is camera reachable?**

   ```bash
   ping <camera-ip>
   curl -v rtsp://<camera-ip>:<port>/path
   ```

2. **Check camera-ingest service:**

   ```bash
   kubectl logs deployment/camera-ingest | grep <camera-id>
   ```

3. **Check go2rtc logs:**

   ```bash
   docker compose logs go2rtc | grep <camera-rtsp-url>
   ```

4. **Verify firewall rules:**
   - Cameras can reach go2rtc service (port 8554 for RTSP)
   - go2rtc can reach cameras (TCP 554, UDP for RTP)

**Resolution:**

1. **Restart go2rtc:**

   ```bash
   docker compose restart go2rtc
   # or
   kubectl rollout restart deployment/go2rtc
   ```

2. **Re-add camera in UI:**
   - Camera Settings → Delete
   - Add Camera → Enter RTSP URL again

3. **Update camera credentials:**
   - If password changed, update in OSP UI

---

### High Latency / Slow Live View

**Symptoms:**

- Live view has 5+ second lag
- WebRTC connection times out
- Mobile app unresponsive

**Check:**

1. **Network latency to go2rtc:**

   ```bash
   ping <go2rtc-host>
   # Should be < 100ms
   ```

2. **Camera frame rate:**
   - Check camera settings (should be 20-30 fps)
   - Verify RTSP URL is actually streaming

3. **API response time:**

   ```bash
   time curl https://api.yourdomain.com/health
   ```

4. **WebRTC codec:**
   - Browser console: check if using H.264 or VP9
   - VP9 = slower decoding

**Resolution:**

1. **Increase video bitrate (if possible):**
   - Affects streaming quality but not latency
   - Configure in camera settings

2. **Use MJPEG instead of WebRTC:**
   - Falls back automatically, lower latency but higher bandwidth
   - Check `apps/web/src/hooks/use-live-feed.ts`

3. **Closer geographic location:**
   - Move go2rtc to same region as cameras
   - Use CDN for web app distribution

4. **Reduce concurrent streams:**
   - Limit number of open live views
   - Close unused camera tabs

---

### Recording Not Saving

**Symptoms:**

- "Recordings" tab is empty
- Videos not appearing in R2 bucket
- Disk space filling up but no recordings

**Check:**

1. **Video pipeline is running:**

   ```bash
   kubectl get pod -l app=video-pipeline
   kubectl logs deployment/video-pipeline
   ```

2. **R2 credentials are valid:**

   ```bash
   aws s3 ls s3://osp-storage/ --endpoint-url https://your-account-id.r2.cloudflarestorage.com
   ```

3. **Storage quota not exceeded:**

   ```bash
   # Check R2 usage in Cloudflare dashboard
   # Or:
   aws s3 ls s3://osp-storage/ --summarize --human-readable
   ```

4. **Disk space available:**
   ```bash
   df -h
   # Should have > 10GB free
   ```

**Resolution:**

1. **Restart video pipeline:**

   ```bash
   kubectl rollout restart deployment/video-pipeline
   ```

2. **Adjust retention policy:**

   ```bash
   # In gateway config, set:
   RECORDING_RETENTION_DAYS=30
   ```

3. **Clear old recordings if disk full:**

   ```bash
   # List oldest recordings
   aws s3 ls s3://osp-storage/ --recursive | sort | head -20

   # Delete if necessary (careful!)
   aws s3 rm s3://osp-storage/<oldest-path>
   ```

---

### Push Notifications Not Sending

**Symptoms:**

- Mobile app doesn't receive alerts
- Email alerts not arriving
- No errors in logs

**Check:**

1. **APNS is configured:**

   ```bash
   # Check Fly.io secrets
   fly secrets list | grep APNS
   ```

2. **FCM is configured:**

   ```bash
   fly secrets list | grep FCM
   ```

3. **Device tokens are registered:**
   - Check Supabase `device_tokens` table

   ```bash
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM device_tokens WHERE active = true;"
   ```

4. **APNS/FCM services are up:**
   - Check Apple Developer status
   - Check Firebase status (Google Cloud)

**Resolution:**

1. **Re-generate APNS certificate:**
   - Go to [developer.apple.com](https://developer.apple.com)
   - Create new key, download `.p8` file
   - Update `APNS_KEY_ID`, `APNS_TEAM_ID`
   - Restart gateway

2. **Regenerate FCM key:**
   - Go to [firebase.google.com/console](https://firebase.google.com/console)
   - Service Accounts → Generate new private key
   - Update `FCM_SERVER_KEY`

3. **Delete old device tokens:**
   ```bash
   psql $DATABASE_URL -c "DELETE FROM device_tokens WHERE updated_at < NOW() - INTERVAL '30 days';"
   ```

---

### WebSocket Connection Drops

**Symptoms:**

- Real-time alerts delayed or missing
- "Connection lost" message in UI
- Mobile app loses connection after idle

**Check:**

1. **WebSocket server is running:**

   ```bash
   netstat -tuln | grep 3002
   # Should show listening on 0.0.0.0:3002
   ```

2. **Firewall allows WebSocket:**

   ```bash
   curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
     http://localhost:3002/events
   ```

3. **Redis pub/sub is working:**
   ```bash
   redis-cli -u $REDIS_URL SUBSCRIBE events
   # Should show "Subscribed"
   ```

**Resolution:**

1. **Restart gateway (includes WebSocket server):**

   ```bash
   fly apps restart gateway
   ```

2. **Check for connection leaks:**

   ```bash
   # Monitor open connections
   watch -n 1 'netstat -tuln | grep 3002'

   # If count keeps growing, memory leak
   # Restart gateway
   ```

3. **Increase connection timeout:**
   ```bash
   # In services/gateway/src/websocket.ts:
   # Change: ping interval from 30s to 60s
   setInterval(() => ws.ping(), 60000);
   ```

---

### Out of Disk Space

**Symptoms:**

- Services crashing with "No space left on device"
- Recording queue backs up
- Docker container eviction on Kubernetes

**Quick Fix:**

```bash
# Find large files/dirs
du -sh /* | sort -rh | head -20

# Clean up recordings
rm -rf ./recordings/*

# Clear Docker/container caches
docker system prune -a

# Delete old database backups
aws s3 rm s3://your-backup-bucket/ --recursive --exclude "*" --include "*2025-01-*"
```

**Permanent Fix:**

1. **Increase volume size:**
   - Kubernetes: Edit PersistentVolumeClaim
   - Docker Compose: Update `volumes:` in docker-compose.yml
   - Fly.io: `fly volumes extend storage -s 100` (adjust size)

2. **Implement retention policy:**

   ```env
   RECORDING_RETENTION_DAYS=7  # Keep only 7 days
   SNAPSHOT_RETENTION_DAYS=30  # Keep 30 days of snapshots
   ```

3. **Monitor proactively:**
   - Alert when disk > 75% full
   - Cron job to clean old recordings daily

---

## Disaster Recovery

### Database Backup/Restore

**Supabase (automatic):**

- Pro plan includes daily backups
- Access at [supabase.com/dashboard](https://supabase.com/dashboard) → Backups

**Manual backup:**

```bash
# Dump entire database
pg_dump $DATABASE_URL > backup.sql

# Restore from backup
psql $DATABASE_URL < backup.sql
```

### Restoring from Backup

**If production database is corrupted:**

1. **Restore Supabase backup:**
   - Dashboard → Backups → Restore
   - Takes 5-10 minutes, slight downtime
   - Monitor `/health/detailed` until "supabase": "connected"

2. **Notify users:**
   - Post to status page
   - Explain brief downtime, data consistency

3. **Verify after restore:**
   ```bash
   # Test key queries
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM cameras;"
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM events;"
   ```

### Recovering Deleted Data

**Within 30 days (Supabase Pro):**

- Use pitr (point-in-time recovery) from backups
- Contact Supabase support

**Beyond 30 days:**

- Data is permanently deleted
- Restore from your own backups (if available)

### Incident Response

**API Gateway is Down:**

1. **Immediate (0-5 min):**

   ```bash
   fly apps restart gateway
   kubectl rollout restart deployment/gateway
   ```

2. **Diagnose (5-15 min):**
   - Check logs: `fly logs`
   - Check metrics: `/health/detailed`
   - Check dependencies (database, Redis)

3. **Escalate (if not recovering):**
   - Rollback: `fly releases rollback`
   - Escalate to on-call engineer
   - Post status update

**Full System Outage:**

1. **Announce:** "We're experiencing a service outage"
2. **Investigate** root cause (database? network? deployment?)
3. **Mitigate:** Rollback, restart, or failover
4. **Resolve:** Fix underlying issue
5. **Post-mortem:** Document what happened and prevent repeat

---

## Maintenance

### Regular Tasks

**Daily:**

- Monitor `/health/detailed` endpoint
- Check error rates in Sentry
- Scan alert logs for patterns

**Weekly:**

- Review performance metrics
- Verify backups completed
- Update monitoring thresholds if needed

**Monthly:**

- Rotate secrets (API tokens, encryption keys)
- Upgrade dependencies (run `pnpm outdated`)
- Review access logs for suspicious activity
- Clean up old logs (Supabase logs older than 90 days)

**Quarterly:**

- Security audit (check CLAUDE.md security checklist)
- Capacity planning (disk, bandwidth, database connections)
- Disaster recovery test (restore from backup, verify)
- Load test (if expecting traffic spike)

### Scaling the System

**API Gateway becoming saturated:**

```bash
# Increase replica count
fly scale count 3  # Run 3 instances instead of 1

# Monitor
fly status
```

**Database connections exhausted:**

```bash
# Increase connection limit in Supabase
# (Settings → Database → Connection limit)
# Typical: 100 for Free, 500 for Pro

# Also check code for connection leaks
```

**Redis memory full:**

```bash
# Increase Redis instance size (Upstash dashboard)
# Or: implement LRU eviction policy
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

**Storage running out:**

```bash
# Upgrade R2 bucket (automatic)
# Or: delete old recordings
# Or: implement tiering (hot/cold storage)
```

### Version Upgrades

**Node.js (web app):**

1. Update `package.json` engines field
2. Test locally: `nvm use 21`
3. Update Vercel Node.js version in project settings
4. Deploy and verify

**Go (services):**

1. Update `go.mod` and `go.sum`
2. Run `go mod tidy`
3. Test: `go test ./...`
4. Rebuild Docker images
5. Deploy and monitor

**TypeScript:**

```bash
pnpm add -D typescript@latest
pnpm type-check
```

**Dependencies:**

```bash
# Check for updates
pnpm outdated

# Update carefully (test each major version)
pnpm up --interactive
pnpm test
```

---

## See Also

- [docs/guide.md](./guide.md) — Development setup
- [docs/ENV.md](./ENV.md) — Environment variables reference
- [docs/PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md) — Pre-launch verification
- [CLAUDE.md](../CLAUDE.md) — Architecture and standards
