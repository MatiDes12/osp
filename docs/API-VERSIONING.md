# OSP API Versioning Strategy

## Current state

All routes live at `/api/v1/*`. The gateway responds with:

```
API-Version: 1
```

on every API response so clients can assert the version they were built against.

---

## Rules

### 1. Non-breaking changes — no new version needed

These changes can be made to the existing v1 API without a version bump:

- Adding new **optional** request fields
- Adding new response fields (clients must ignore unknown fields)
- Adding new endpoints
- Fixing bugs that don't change the contract

### 2. Breaking changes — require v2

Create `/api/v2/*` routes when any of the following is necessary:

- Removing or renaming a field
- Changing a field's type or format
- Changing HTTP method or URL structure
- Changing error codes or envelope shape
- Removing an endpoint

### 3. Deprecation lifecycle

When v2 ships, v1 enters a **6-month deprecation window**:

```
Deprecation: true
Sunset: Mon, 31 Dec 2026 00:00:00 GMT
Link: </docs>; rel="deprecation"; type="text/html"
```

These headers are added automatically using the `deprecated()` middleware helper:

```typescript
import { deprecated } from "../middleware/api-version.js";

router.get("/old-endpoint", deprecated("2026-12-31"), handler);
```

After the sunset date, v1 endpoints return `410 Gone`.

---

## Client guidance

### Asserting a version

Clients may send `Accept-Version: 1` to pin to v1. Once v2 exists, sending `Accept-Version: 2` will route to v2 automatically.

```
GET /api/v1/cameras
Accept-Version: 1
Authorization: Bearer <token>
```

### Detecting deprecation

Check for `Deprecation: true` in responses. Display a warning and plan migration before the `Sunset` date.

---

## Implementation

| File | Purpose |
|------|---------|
| `services/gateway/src/middleware/api-version.ts` | `apiVersion()` middleware, `deprecated()` helper, `getRequestedVersion()` parser |
| `services/gateway/src/app.ts` | `apiVersion()` applied to all `/api/*` routes; root endpoint exposes version metadata |

---

## Adding v2 (future)

1. Create route files in `services/gateway/src/routes/v2/`
2. Mount them: `app.route("/api/v2/cameras", cameraRoutesV2)`
3. Update root endpoint: `supportedVersions: ["1", "2"]`, `deprecatedVersions: ["1"]`
4. Apply `deprecated("YYYY-MM-DD")` to all v1 routes that have v2 replacements
5. After sunset date: replace handlers with `410 Gone` responses, then remove after another 3 months
