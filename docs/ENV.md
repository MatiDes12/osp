# Environment Variables

All environment variables for OSP are documented here. Copy `.env.example` to `.env` and fill in the required values for your deployment.

---

## Quick Reference

<!-- AUTO-GENERATED: Environment Variables from .env.example -->

### Supabase (Required)

| Variable                    | Default                                                   | Description                                              |
| --------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| `SUPABASE_URL`              | `http://localhost:54321`                                  | Supabase API endpoint (project URL from dashboard)       |
| `SUPABASE_ANON_KEY`         | `your-anon-key`                                           | Public anonymous key for browser/mobile clients          |
| `SUPABASE_SERVICE_ROLE_KEY` | `your-service-role-key`                                   | Private key for server-to-server requests (backend only) |
| `DATABASE_URL`              | `postgresql://postgres:postgres@localhost:54322/postgres` | Direct PostgreSQL connection string (backend services)   |

**How to get Supabase keys:**

1. Log into [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to Settings → API
4. Copy the Project URL → `SUPABASE_URL`
5. Copy the anon (public) key → `SUPABASE_ANON_KEY`
6. Copy the service_role (secret) key → `SUPABASE_SERVICE_ROLE_KEY`

**Database URL note:** Use the **direct connection** URL (port 5432), not the pooler (port 6543). For Supabase, construct it as:

```
postgresql://postgres:[YOUR_PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres?sslmode=require
```

---

### Redis (Required for Production)

| Variable    | Default                  | Description                                  |
| ----------- | ------------------------ | -------------------------------------------- |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL for caching and pub/sub |

**Local development:**

```bash
docker run -d -p 6379:6379 redis:latest
```

**Production:** Use Upstash, AWS ElastiCache, or self-hosted Redis with persistence.

---

### Object Storage (R2 or S3)

| Variable               | Default                                            | Description                      |
| ---------------------- | -------------------------------------------------- | -------------------------------- |
| `R2_ACCOUNT_ID`        | `your-account-id`                                  | Cloudflare account ID            |
| `R2_ACCESS_KEY_ID`     | `your-access-key`                                  | Access key for R2 API            |
| `R2_SECRET_ACCESS_KEY` | `your-secret-key`                                  | Secret key for R2 API            |
| `R2_BUCKET_NAME`       | `osp-storage`                                      | R2 bucket name (create it first) |
| `R2_ENDPOINT`          | `https://your-account-id.r2.cloudflarestorage.com` | R2 endpoint URL                  |

**Alternatives:**

- **AWS S3:** Use `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`, `AWS_REGION`
- **Google Cloud Storage:** Use `GCS_PROJECT_ID`, `GCS_BUCKET_NAME`, `GCS_CREDENTIALS_JSON`

**Storage structure:** Videos and snapshots are stored at:

```
{tenant_id}/{camera_id}/{timestamp}.mp4
```

---

### API Gateway (Hono/Bun)

| Variable               | Default                 | Description                                                                                    |
| ---------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `GATEWAY_PORT`         | `3000`                  | Port for REST API (also ws://port/events for WebSocket)                                        |
| `GATEWAY_CORS_ORIGINS` | `http://localhost:3001` | Comma-separated list of allowed origins for CORS                                               |
| `RATE_LIMIT_FAIL_OPEN` | `true`                  | If `true`, allow requests when Redis is down (fail-open). If `false`, return 503 (fail-closed) |
| `API_URL`              | `http://localhost:3000` | URL for services to call the gateway (used by camera-ingest for callbacks)                     |
| `API_TOKEN`            | `your-api-token`        | Secret token for service-to-service API calls                                                  |

**Production CORS:**

```
GATEWAY_CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

---

### Go Services (gRPC Ports)

| Variable              | Default | Description                             |
| --------------------- | ------- | --------------------------------------- |
| `INGEST_GRPC_PORT`    | `50051` | gRPC port for camera-ingest service     |
| `VIDEO_GRPC_PORT`     | `50052` | gRPC port for video-pipeline service    |
| `EVENT_GRPC_PORT`     | `50053` | gRPC port for event-engine service      |
| `EXTENSION_GRPC_PORT` | `50054` | gRPC port for extension-runtime service |

These are used for internal service-to-service communication. Don't expose these publicly.

---

### go2rtc (Camera Stream Manager)

| Variable             | Default                 | Description                                  |
| -------------------- | ----------------------- | -------------------------------------------- |
| `GO2RTC_API_URL`     | `http://localhost:1984` | go2rtc management API endpoint               |
| `GO2RTC_RTSP_PORT`   | `8554`                  | RTSP re-stream port (for local RTSP clients) |
| `GO2RTC_WEBRTC_PORT` | `8555`                  | WebRTC media port (for peer connections)     |

---

### TURN Server (WebRTC NAT Traversal)

Required for remote viewers (not on same LAN as camera). Optional for local-only setups.

| Variable                 | Default               | Description                              |
| ------------------------ | --------------------- | ---------------------------------------- |
| `TURN_SERVER_URL`        | `turn:localhost:3478` | TURN server address (protocol:host:port) |
| `TURN_SERVER_USERNAME`   | `osp`                 | TURN server username                     |
| `TURN_SERVER_CREDENTIAL` | `osp`                 | TURN server password                     |

**Options:**

- **Self-hosted coturn:** [coturn GitHub](https://github.com/coturn/coturn) — recommended for full control
- **Cloudflare TURN:** `turns:your-account.cloudflareturn.com` — free for some regions
- **Twilio TURN:** Paid tier, fully managed

**To skip TURN (local testing only):**

```
TURN_SERVER_URL=""
```

---

### Recording Storage

| Variable         | Default        | Description                                                                         |
| ---------------- | -------------- | ----------------------------------------------------------------------------------- |
| `RECORDINGS_DIR` | `./recordings` | Local directory for storing video recordings (if using local storage instead of R2) |

**Local development:** Keep as `./recordings`
**Production:** Use R2 or S3 (see Object Storage section)

---

### Encryption

| Variable             | Default                       | Description                                                       |
| -------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `OSP_ENCRYPTION_KEY` | `generate-a-32-byte-key-here` | 32-byte encryption key for sensitive data (credentials, API keys) |

**Generate a key:**

```bash
# macOS / Linux
openssl rand -hex 32

# Node.js
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Store this securely (e.g., in a secrets manager). Never commit to git.

---

### Push Notifications

#### Apple Push Notification service (APNS)

| Variable           | Default        | Description                                                 |
| ------------------ | -------------- | ----------------------------------------------------------- |
| `APNS_KEY_ID`      | `your-key-id`  | 10-character key ID from Apple Developer                    |
| `APNS_TEAM_ID`     | `your-team-id` | 10-character team ID (Team → Settings in App Store Connect) |
| `APNS_KEY_CONTENT` | (optional)     | Full `.p8` certificate content (if not in file)             |

**Setup:**

1. Go to [developer.apple.com/account](https://developer.apple.com/account)
2. Certificates, IDs & Profiles → Keys
3. Create a new key with APNs capability
4. Download the `.p8` file (save in `infra/secrets/APNS_KEY.p8`)
5. Note the Key ID and Team ID

#### Google Cloud Messaging (FCM)

| Variable         | Default        | Description                          |
| ---------------- | -------------- | ------------------------------------ |
| `FCM_SERVER_KEY` | `your-fcm-key` | Server API key from Firebase Console |

**Setup:**

1. Go to [firebase.google.com/console](https://firebase.google.com/console)
2. Create or select a project
3. Settings → Service Accounts → Generate new private key
4. Use the `server_key` from the JSON

---

### Email Notifications

| Variable         | Default                 | Description                           |
| ---------------- | ----------------------- | ------------------------------------- |
| `RESEND_API_KEY` | `your-resend-api-key`   | API key from Resend email service     |
| `EMAIL_FROM`     | `alerts@yourdomain.com` | Sender email address for alert emails |

**Alternatives:** Postmark, SendGrid, AWS SES

---

### Error Monitoring (Optional)

| Variable     | Default | Description                                        |
| ------------ | ------- | -------------------------------------------------- |
| `SENTRY_DSN` | (empty) | Sentry error tracking DSN (leave empty to disable) |

Get your DSN from [sentry.io](https://sentry.io) after creating a project.

---

## Environment Files

### `.env` (Local Development)

Copy from `.env.example`:

```bash
cp .env.example .env
```

Used by all services. Loaded via `dotenv` in backend, `NEXT_PUBLIC_*` in frontend.

### `.env.local` (Next.js Web App)

Create in `apps/web/`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3002
NEXT_PUBLIC_GO2RTC_URL=http://localhost:1984
```

### `.env` (Mobile App)

Create in `apps/mobile/`:

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000
EXPO_PUBLIC_WS_URL=ws://192.168.x.x:3002
EXPO_PUBLIC_GO2RTC_URL=http://192.168.x.x:1984
```

Replace `192.168.x.x` with your dev machine's LAN IP (from `ipconfig` on Windows, `ifconfig` on macOS).

---

## Production Deployment

### Environment Variables per Platform

**Vercel (Web App):**

- Add via dashboard: Settings → Environment Variables
- Common variables:
  - `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`
  - `NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com`
  - `NEXT_PUBLIC_GO2RTC_URL=https://rtc.yourdomain.com`
  - `NEXT_PUBLIC_SENTRY_DSN` (optional)

**Fly.io (API Gateway):**

```bash
fly secrets set \
  SUPABASE_URL=https://... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  DATABASE_URL=postgresql://... \
  REDIS_URL=redis://... \
  OSP_ENCRYPTION_KEY=... \
  API_TOKEN=<generate-random-secret>
```

**Kubernetes:**

- Create ConfigMap for non-sensitive vars
- Create Secret for sensitive values
- Reference in Deployment specs

---

## Validation and Defaults

### Required Variables (Fail if Missing)

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `REDIS_URL`
- `OSP_ENCRYPTION_KEY`
- `API_TOKEN`

### Optional Variables (With Defaults)

- `GATEWAY_PORT` → `3000`
- `GATEWAY_CORS_ORIGINS` → `http://localhost:3001`
- `RATE_LIMIT_FAIL_OPEN` → `true`
- `TURN_SERVER_URL` → `turn:localhost:3478`
- `RECORDINGS_DIR` → `./recordings`
- `SENTRY_DSN` → (disabled if empty)

---

## Rotating Secrets

For production, rotate secrets regularly:

1. **API_TOKEN:** Generate new random value, update in all services
2. **OSP_ENCRYPTION_KEY:** Can't rotate without re-encrypting all data
3. **R2_SECRET_ACCESS_KEY:** Rotate in Cloudflare dashboard, update everywhere
4. **TURN credentials:** Update in TURN server, then in OSP_ENCRYPTION_KEY
5. **Database password:** Change in Supabase → Database → Settings, update `DATABASE_URL`

After rotating, redeploy all services.

---

## Troubleshooting

### Variables not being read

1. Check spelling (case-sensitive)
2. Ensure file is `.env` in project root
3. Restart dev server after changing `.env`
4. Check for spaces around `=`: `KEY=value` (not `KEY = value`)

### Frontend not connecting to backend

Check these in browser console:

```javascript
console.log(process.env.NEXT_PUBLIC_API_URL);
console.log(process.env.NEXT_PUBLIC_WS_URL);
```

Both should be defined. If undefined, they weren't prefixed with `NEXT_PUBLIC_` in the `.env` file.

### gRPC services not connecting

Check ports are open:

```bash
netstat -tuln | grep 5005
```

If not listening, ensure services are started:

```bash
# In separate terminals
cd services/camera-ingest && go run .
cd services/video-pipeline && go run .
```

---

## See Also

- [docs/guide.md](./guide.md) — Setup walkthrough
- [docs/PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md) — Pre-launch verification
- [.env.example](../.env.example) — Template with all variables
