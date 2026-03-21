# Contributing to OSP

Thank you for your interest in contributing to Open Surveillance Platform (OSP)! This guide covers development setup, code style, testing, and pull request process.

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/MatiDes12/osp.git
cd osp
pnpm install

# Build shared packages first
pnpm --filter @osp/shared build

# Copy env file
cp .env.example .env
# Edit .env with your local credentials (see docs/ENV.md)

# Start infrastructure
docker compose -f infra/docker/docker-compose.yml up -d redis go2rtc clickhouse

# Start development
pnpm dev
```

For detailed platform-specific setup (mobile, desktop), see [docs/guide.md](./guide.md).

---

## Development Workspace

<!-- AUTO-GENERATED: Root Scripts -->
### Root Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start all services (Turborepo) |
| `pnpm build` | Build all packages |
| `pnpm lint` | Lint all packages |
| `pnpm type-check` | Type check all packages |
| `pnpm test` | Run all tests |
| `pnpm test:integration` | Run integration tests |
| `pnpm clean` | Clean build artifacts |
| `pnpm format` | Format code with Prettier |
| `pnpm smoke:motion` | Run motion detection smoke test |

<!-- /AUTO-GENERATED -->

### Workspace Structure

```
osp/
├── apps/
│   ├── web/              # Next.js 15 dashboard (port 3001)
│   ├── mobile/           # React Native + Expo
│   └── desktop/          # Tauri v2 wrapper
├── packages/
│   ├── shared/           # Shared types, utils, API client
│   ├── ui/               # UI component library (shadcn/ui)
│   └── sdk/              # Extension SDK
├── services/
│   ├── gateway/          # Hono/Bun API gateway (port 3000)
│   ├── camera-ingest/    # Go — camera management
│   ├── video-pipeline/   # Go — transcoding, recording
│   ├── event-engine/     # Go — rule evaluation
│   ├── extension-runtime/# Go — sandboxed extensions
│   └── edge-agent/       # Go — optional edge compute
└── infra/
    ├── docker/           # Docker Compose configs
    ├── k8s/              # Kubernetes manifests
    └── supabase/         # DB migrations, RLS policies
```

### App-Specific Commands

#### Web Dashboard

```bash
cd apps/web
pnpm dev           # Run on http://localhost:3001
pnpm build
pnpm type-check
pnpm lint
pnpm test          # Unit tests (Vitest)
pnpm test:e2e      # E2E tests (Playwright)
pnpm clean
```

#### Mobile App (Expo)

```bash
cd apps/mobile
pnpm start         # Start Expo dev server
pnpm android       # Open in Android Emulator
pnpm ios           # Open in iOS Simulator (macOS only)
pnpm web           # Run in web browser
pnpm lint
pnpm type-check
pnpm clean
```

#### Desktop App (Tauri)

```bash
cd apps/desktop
pnpm dev           # Run in dev mode with HMR
pnpm build         # Create production binary
pnpm type-check
pnpm clean
```

#### API Gateway

```bash
cd services/gateway
pnpm dev           # Watch mode (port 3000)
pnpm build
pnpm type-check
pnpm lint
pnpm test          # Unit tests
pnpm test:integration  # Integration tests with real Supabase
pnpm clean
```

---

## Code Style

### TypeScript/JavaScript

**File naming:**
- Components: `PascalCase` (`CameraGrid.tsx`)
- Utilities: `kebab-case` (`use-live-feed.ts`, `camera-service.ts`)
- Constants: `SCREAMING_SNAKE_CASE`

**Formatting:**
```bash
# Run before every commit
pnpm format

# Verify during CI
pnpm lint
pnpm type-check
```

**Rules:**
- No `I` prefix on interfaces (use `PascalCase`)
- Use arrow functions for callbacks
- Prefer `const` and `let` (no `var`)
- Use template literals for strings with variables
- Export types with `export type` keyword

**Example:**
```typescript
// ❌ Bad
interface IUser {
  id: string;
  name: string;
}

// ✅ Good
export type User = {
  id: string;
  name: string;
};

export const fetchUser = async (id: string): Promise<User> => {
  // ...
};
```

### Go Code

**File naming:** `snake_case` (e.g., `camera_ingest.go`)

**Package names:** lowercase, single word (e.g., `ingest`, `transcode`, `events`)

**Exports:**
- Public: `PascalCase`
- Private: `camelCase`

**Style:** Run `gofmt` before committing:
```bash
cd services/camera-ingest
gofmt -w .
```

### API Routes

**Naming:**
```
kebab-case, plural
/api/v1/alert-rules/:id
/api/v1/camera-zones
```

**Query params:** camelCase
```
?startDate=&cameraId=
```

**Request/Response bodies:** camelCase JSON
```json
{
  "cameraId": "uuid",
  "alertRuleId": "uuid",
  "createdAt": "2025-03-21T10:00:00Z"
}
```

### Database

**Tables:** `snake_case`, plural
```sql
users, camera_zones, alert_rules
```

**Columns:** `snake_case`
```sql
created_at, tenant_id, is_active
```

**Indexes:** `idx_{table}_{columns}`
```sql
CREATE INDEX idx_alert_rules_camera_id ON alert_rules(camera_id);
```

**Foreign keys:** `fk_{table}_{ref_table}`
```sql
ALTER TABLE alert_rules
ADD CONSTRAINT fk_alert_rules_cameras
FOREIGN KEY (camera_id) REFERENCES cameras(id);
```

---

## Testing

### Test Requirements

- **Unit tests:** 80% code coverage minimum (Vitest for TS, `go test` for Go)
- **Integration tests:** API endpoints with real Supabase (Vitest + Supertest)
- **E2E tests:** Critical user paths (Playwright for web)
- **Load tests:** High concurrency (k6)

### Running Tests

```bash
# Run all tests
pnpm test

# Run integration tests
pnpm test:integration

# Run E2E tests (web app only)
pnpm --filter @osp/web test:e2e

# Watch mode
pnpm --filter @osp/gateway test -- --watch

# Coverage
pnpm --filter @osp/web test -- --coverage
```

### Writing Tests

**TypeScript (Vitest):**
```typescript
import { describe, it, expect } from 'vitest';
import { getUserByEmail } from './user-service';

describe('UserService', () => {
  it('should fetch user by email', async () => {
    const user = await getUserByEmail('test@example.com');
    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
  });
});
```

**Go:**
```go
func TestCreateCamera(t *testing.T) {
  camera, err := CreateCamera("Test Camera", "rtsp://stream")
  assert.NoError(t, err)
  assert.NotEmpty(t, camera.ID)
}
```

**E2E (Playwright):**
```typescript
import { test, expect } from '@playwright/test';

test('user can add a camera', async ({ page }) => {
  await page.goto('http://localhost:3001/login');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('text=Sign in');

  await page.click('text=Add Camera');
  await page.fill('[name="rtspUrl"]', 'rtsp://example.com/stream');
  await page.click('text=Save');

  await expect(page.locator('text=Test Camera')).toBeVisible();
});
```

---

## Git Workflow

### Branch Naming

```
feature/short-description    # New features
fix/bug-description          # Bug fixes
refactor/what-changed        # Refactoring
docs/what-was-updated        # Documentation
chore/dependency-upgrade     # Dependencies, tooling
```

### Commit Messages

Follow the format: `type: description`

```
feat: add motion detection to camera zones
fix: resolve WebSocket connection timeout on mobile
docs: update environment variables documentation
refactor: extract camera stream logic into separate service
chore: upgrade Next.js to 15.2.0
```

**Keep commits atomic:** each commit should do one thing and leave the codebase in a working state.

### Pull Request Process

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes and test:**
   ```bash
   pnpm lint
   pnpm type-check
   pnpm test
   ```

3. **Format code:**
   ```bash
   pnpm format
   ```

4. **Push and create PR:**
   ```bash
   git push origin feature/my-feature
   ```

5. **PR checklist** — before requesting review:

   - [ ] Code passes `pnpm lint` and `pnpm type-check`
   - [ ] Tests written and passing (`pnpm test`)
   - [ ] No hardcoded secrets or credentials
   - [ ] RLS policies added for new database tables
   - [ ] Input validation on new API endpoints
   - [ ] Rate limiting on public endpoints (if applicable)
   - [ ] Database migrations include rollback steps
   - [ ] Comments explaining complex logic
   - [ ] Commit messages are clear and atomic
   - [ ] Changes don't break existing functionality

6. **Review and merge:**
   - Request review from maintainers
   - Address feedback in new commits (don't amend)
   - Maintainer will squash and merge to main

### Security Checklist (for All PRs)

- [ ] No hardcoded secrets (API keys, passwords)
- [ ] No AWS/GCP credentials in code
- [ ] RLS policies on new tables (Supabase)
- [ ] Input validation on all new endpoints
- [ ] Signed URLs for video streams (R2)
- [ ] Rate limiting on public endpoints
- [ ] No debug endpoints in production code
- [ ] Sensitive operations logged for audit trail
- [ ] No data exfiltration in error messages

---

## Architecture Decisions

When proposing significant changes, document the decision in a comment. Key architectural principles:

1. **Go for video services** — High concurrency, low memory per connection
2. **Hono/Bun for gateway** — Fast, shared TypeScript with frontend
3. **Supabase for database** — Built-in auth, RLS, realtime
4. **Extension SDK in TypeScript** — Largest developer ecosystem
5. **Multi-tenancy by default** — All data tenant-scoped via RLS

For architecture discussions, see [CLAUDE.md](../CLAUDE.md).

---

## Performance Guidelines

### Frontend

- Keep component bundles under 100KB (tree-shake unused code)
- Use Next.js Image component for optimization
- Lazy-load non-critical features
- Memoize expensive computations (`useMemo`, `useCallback`)

### Backend

- Cache frequently accessed data (Redis)
- Use database indexes for all query predicates
- Batch operations where possible (e.g., video transcoding)
- Monitor response times with logs

### Video Pipeline

- Use hardware acceleration (GPU) for transcoding when available
- Stream video chunks progressively (don't wait for full encode)
- Garbage collect old recordings based on retention policy

---

## Documentation

All new features should include:

1. **API documentation** — OpenAPI/Swagger specs with examples
2. **TypeScript definitions** — Exported types for SDK users
3. **README updates** — Any new setup or configuration steps
4. **Migration guide** — If breaking changes to database or API

---

## Troubleshooting Development Issues

### Port already in use

```bash
# Find what's using a port (macOS/Linux)
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Dependencies not installing

```bash
# Clear pnpm cache
pnpm store prune

# Reinstall everything
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Supabase migrations not applying

```bash
# Check migration status
npx supabase migration list --linked

# If stuck, reset the database (dev only!)
npx supabase db reset --linked
```

### Docker containers not starting

```bash
# Check logs
docker compose -f infra/docker/docker-compose.yml logs redis

# Restart
docker compose -f infra/docker/docker-compose.yml down
docker compose -f infra/docker/docker-compose.yml up -d
```

### TypeScript errors in IDE

Try restarting the TypeScript language server:
- VS Code: `Cmd/Ctrl + Shift + P` → "TypeScript: Restart TS Server"

---

## Getting Help

- **GitHub Issues** — Report bugs and request features
- **Discussions** — Ask questions and share ideas
- **Code Review** — Ask in PR comments if unsure about approach

---

**Thank you for contributing! We appreciate your help making OSP better.**
