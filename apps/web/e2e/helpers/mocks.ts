import type { Page } from "@playwright/test";

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

export const MOCK_CAMERAS = [
  {
    id: "cam-1",
    tenantId: "t-1",
    name: "Front Door",
    protocol: "rtsp",
    connectionUri: "rtsp://192.168.1.10:554/stream",
    status: "online",
    ptzCapable: false,
    manufacturer: "Hikvision",
    model: "DS-2CD2143G0-I",
    firmwareVersion: "5.6.3",
    locationId: null,
    location: { label: "Building A" },
    capabilities: { resolution: "2560x1440" },
    config: { recordingMode: "continuous" },
    lastSeenAt: new Date().toISOString(),
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "cam-2",
    tenantId: "t-1",
    name: "Parking Lot",
    protocol: "onvif",
    connectionUri: "http://192.168.1.20:80/onvif/device_service",
    status: "online",
    ptzCapable: true,
    manufacturer: "Dahua",
    model: "IPC-HDW5442T",
    firmwareVersion: "2.8.1",
    locationId: null,
    location: { label: "Lot B" },
    capabilities: { resolution: "1920x1080" },
    config: { recordingMode: "motion" },
    lastSeenAt: new Date().toISOString(),
    createdAt: "2025-01-02T00:00:00Z",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "cam-3",
    tenantId: "t-1",
    name: "Server Room",
    protocol: "rtsp",
    connectionUri: "rtsp://192.168.1.30:554/stream",
    status: "offline",
    ptzCapable: false,
    manufacturer: "Axis",
    model: "P3245-V",
    firmwareVersion: "10.12.0",
    locationId: null,
    location: { label: "Floor 2" },
    capabilities: { resolution: "1920x1080" },
    config: { recordingMode: "off" },
    lastSeenAt: "2025-06-01T12:00:00Z",
    createdAt: "2025-01-03T00:00:00Z",
    updatedAt: "2025-06-01T12:00:00Z",
  },
] as const;

export const MOCK_EVENTS = [
  {
    id: "evt-1",
    tenantId: "t-1",
    cameraId: "cam-1",
    cameraName: "Front Door",
    type: "person",
    severity: "high",
    detectedAt: new Date().toISOString(),
    acknowledged: false,
    acknowledgedAt: null,
    snapshotUrl: null,
    clipUrl: null,
    zoneName: "Entrance",
    metadata: {},
    createdAt: new Date().toISOString(),
  },
  {
    id: "evt-2",
    tenantId: "t-1",
    cameraId: "cam-2",
    cameraName: "Parking Lot",
    type: "vehicle",
    severity: "medium",
    detectedAt: new Date(Date.now() - 300_000).toISOString(),
    acknowledged: false,
    acknowledgedAt: null,
    snapshotUrl: null,
    clipUrl: null,
    zoneName: null,
    metadata: {},
    createdAt: new Date(Date.now() - 300_000).toISOString(),
  },
  {
    id: "evt-3",
    tenantId: "t-1",
    cameraId: "cam-1",
    cameraName: "Front Door",
    type: "motion",
    severity: "low",
    detectedAt: new Date(Date.now() - 600_000).toISOString(),
    acknowledged: true,
    acknowledgedAt: new Date(Date.now() - 500_000).toISOString(),
    snapshotUrl: null,
    clipUrl: null,
    zoneName: null,
    metadata: {},
    createdAt: new Date(Date.now() - 600_000).toISOString(),
  },
  {
    id: "evt-4",
    tenantId: "t-1",
    cameraId: "cam-3",
    cameraName: "Server Room",
    type: "camera_offline",
    severity: "critical",
    detectedAt: new Date(Date.now() - 3_600_000).toISOString(),
    acknowledged: false,
    acknowledgedAt: null,
    snapshotUrl: null,
    clipUrl: null,
    zoneName: null,
    metadata: {},
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
] as const;

export const MOCK_EVENT_SUMMARY = {
  total: 4,
  unacknowledged: 3,
  byType: { person: 1, vehicle: 1, motion: 1, camera_offline: 1 },
  bySeverity: { critical: 1, high: 1, medium: 1, low: 1 },
  byCamera: { "cam-1": 2, "cam-2": 1, "cam-3": 1 },
} as const;

export const MOCK_ZONES = [
  {
    id: "zone-1",
    cameraId: "cam-1",
    name: "Entrance Area",
    polygon: [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ],
    colorHex: "#3b82f6",
    sensitivity: 7,
    alertEnabled: true,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
] as const;

export const MOCK_RULES = [
  {
    id: "rule-1",
    tenantId: "t-1",
    name: "Person at Front Door",
    description: "Alert when a person is detected at the front entrance",
    triggerEvent: "person",
    cameraIds: ["cam-1"],
    enabled: true,
    conditions: {
      operator: "AND",
      children: [{ field: "confidence", operator: "gt", value: 0.8 }],
    },
    actions: [
      { type: "push_notification", config: {} },
      { type: "email", config: { to: "admin@acme.com" } },
    ],
    lastTriggeredAt: new Date(Date.now() - 1_800_000).toISOString(),
    triggerCount24h: 12,
    createdAt: "2025-01-10T00:00:00Z",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "rule-2",
    tenantId: "t-1",
    name: "Vehicle in Parking Lot",
    description: "Record when a vehicle enters the lot",
    triggerEvent: "vehicle",
    cameraIds: ["cam-2"],
    enabled: false,
    conditions: { operator: "AND", children: [] },
    actions: [{ type: "start_recording", config: {} }],
    lastTriggeredAt: null,
    triggerCount24h: 0,
    createdAt: "2025-02-01T00:00:00Z",
    updatedAt: "2025-02-01T00:00:00Z",
  },
  {
    id: "rule-3",
    tenantId: "t-1",
    name: "Camera Offline Alert",
    description: "Notify ops when any camera goes offline",
    triggerEvent: "camera_offline",
    cameraIds: [],
    enabled: true,
    conditions: { operator: "AND", children: [] },
    actions: [{ type: "webhook", config: { url: "https://hooks.slack.com/xxx" } }],
    lastTriggeredAt: new Date(Date.now() - 86_400_000).toISOString(),
    triggerCount24h: 1,
    createdAt: "2025-03-01T00:00:00Z",
    updatedAt: "2025-03-01T00:00:00Z",
  },
] as const;

export const MOCK_USERS = [
  {
    id: "user-1",
    tenantId: "t-1",
    email: "admin@acme.com",
    displayName: "Admin User",
    role: "owner",
    avatarUrl: null,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "user-2",
    tenantId: "t-1",
    email: "operator@acme.com",
    displayName: "Ops User",
    role: "operator",
    avatarUrl: null,
    createdAt: "2025-02-01T00:00:00Z",
    updatedAt: new Date().toISOString(),
  },
] as const;

export const MOCK_TENANT = {
  id: "t-1",
  name: "Acme Corp",
  slug: "acme-corp",
  plan: "pro",
  status: "active",
  maxCameras: 16,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: new Date().toISOString(),
} as const;

export const MOCK_RECORDINGS = [
  {
    id: "rec-1",
    cameraId: "cam-1",
    cameraName: "Front Door",
    startedAt: new Date(Date.now() - 7_200_000).toISOString(),
    endedAt: new Date(Date.now() - 3_600_000).toISOString(),
    durationSec: 3600,
    fileSizeMb: 512,
    url: "https://storage.example.com/rec-1.mp4",
  },
] as const;

export const MOCK_ACTIVITY = [
  {
    id: "act-1",
    cameraId: "cam-1",
    cameraName: "Front Door",
    type: "motion",
    severity: "low",
    detectedAt: new Date().toISOString(),
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Route interceptor                                                  */
/* ------------------------------------------------------------------ */

const API_BASE = "http://localhost:3000";

/**
 * Intercept all API fetch calls and return mock data.
 * Call this early in each test that needs a mocked API backend.
 */
export async function setupApiMocks(page: Page): Promise<void> {
  // ── Auth ────────────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/auth/login`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          accessToken: "test-token",
          refreshToken: "test-refresh",
        },
      }),
    }),
  );

  await page.route(`${API_BASE}/api/v1/auth/register`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          accessToken: "test-token",
          refreshToken: "test-refresh",
        },
      }),
    }),
  );

  // ── Tenants ─────────────────────────────────────────────────────────────
  // Both /api/v1/tenant and /api/v1/tenants variants are used across pages
  await page.route(`${API_BASE}/api/v1/tenant**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { ...MOCK_TENANT } }),
    }),
  );

  await page.route(`${API_BASE}/api/v1/tenants/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          plan: "pro",
          cameras: { used: 3, limit: 16 },
          users: { used: 2, limit: 10 },
          storage: { usedBytes: 536_870_912, limitBytes: 107_374_182_400 },
          extensions: { used: 1, limit: 5 },
          recordings: { totalCount: 1, totalDurationHours: 1 },
        },
      }),
    }),
  );

  // ── Cameras ─────────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/cameras`, (route) => {
    if (route.request().method() === "POST") {
      const newCamera = {
        ...MOCK_CAMERAS[0],
        id: "cam-new",
        name: "New Camera",
        createdAt: new Date().toISOString(),
      };
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: newCamera }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [...MOCK_CAMERAS] }),
    });
  });

  // Camera detail, zones, tags, stream
  await page.route(`${API_BASE}/api/v1/cameras/**`, (route) => {
    const url = route.request().url();

    if (url.includes("/zones")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: [...MOCK_ZONES] }),
      });
    }

    if (url.includes("/tags")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: [] }),
      });
    }

    if (url.includes("/stream")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { url: "http://localhost:1984/stream" } }),
      });
    }

    if (url.includes("/test")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { reachable: true } }),
      });
    }

    if (url.includes("/discover")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { cameras: [], usb: [], network: [], scanDurationMs: 500 },
        }),
      });
    }

    // Single camera by ID
    const idMatch = url.match(/cameras\/(cam-[^/?#]+)/);
    const cameraId = idMatch?.[1] ?? "cam-1";
    const camera =
      (MOCK_CAMERAS as readonly (typeof MOCK_CAMERAS)[number][]).find(
        (c) => c.id === cameraId,
      ) ?? MOCK_CAMERAS[0];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { ...camera } }),
    });
  });

  // ── Locations ───────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/locations**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    }),
  );

  // ── Tags ────────────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/tags**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    }),
  );

  // ── Events ──────────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/events**`, (route) => {
    const url = route.request().url();

    if (url.includes("/acknowledge")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: null }),
      });
    }

    if (url.includes("/bulk-acknowledge")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: null }),
      });
    }

    if (url.includes("/summary")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { ...MOCK_EVENT_SUMMARY } }),
      });
    }

    if (url.includes("/stream")) {
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: "",
      });
    }

    // Event list with pagination meta
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [...MOCK_EVENTS],
        meta: { total: 4, page: 1, limit: 50, hasMore: false },
      }),
    });
  });

  // ── Rules ───────────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/rules**`, (route) => {
    if (route.request().method() === "PATCH") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { ...MOCK_RULES[0] } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [...MOCK_RULES] }),
    });
  });

  // ── Users ────────────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/users**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [...MOCK_USERS] }),
    }),
  );

  // ── Recordings ───────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/recordings**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [...MOCK_RECORDINGS] }),
    }),
  );

  // ── Activity feed ────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/activity**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [...MOCK_ACTIVITY] }),
    }),
  );

  // ── Extensions ───────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/extensions**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    }),
  );

  // ── Marketplace ──────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/marketplace**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    }),
  );

  // ── API Keys ─────────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/api-keys**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    }),
  );

  // ── Config / secrets ─────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/config**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { value: "10000" } }),
    }),
  );

  // ── SSO providers ─────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/sso**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    }),
  );

  // ── LPR ──────────────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/lpr**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    }),
  );

  // ── Edge agents ──────────────────────────────────────────────────────────
  await page.route(`${API_BASE}/api/v1/edge**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    }),
  );
}
