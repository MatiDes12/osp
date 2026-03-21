/**
 * OpenAPI 3.1 specification for the OSP Gateway API.
 *
 * This is a static spec that documents every public endpoint. It is served
 * at /docs/openapi.json and rendered by Swagger UI at /docs.
 */

const bearerAuth = {
  type: "http" as const,
  scheme: "bearer",
  bearerFormat: "JWT",
  description:
    "Supabase JWT access token obtained from /api/v1/auth/login or /api/v1/auth/register",
};

const paginationMeta = {
  type: "object" as const,
  properties: {
    total: {
      type: "integer",
      description: "Total number of items matching the query",
    },
    page: { type: "integer", description: "Current page number (1-based)" },
    limit: { type: "integer", description: "Items per page" },
    hasMore: { type: "boolean", description: "Whether more pages exist" },
  },
};

const errorResponse = {
  type: "object" as const,
  properties: {
    success: { type: "boolean", enum: [false] },
    data: { type: "null" as const },
    error: {
      type: "object" as const,
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {},
        requestId: { type: "string", format: "uuid" },
        timestamp: { type: "string", format: "date-time" },
      },
    },
    meta: { type: "null" as const },
  },
};

function successEnvelope(
  dataSchema: Record<string, unknown>,
  meta?: Record<string, unknown>,
) {
  const schema: Record<string, unknown> = {
    type: "object",
    properties: {
      success: { type: "boolean", enum: [true] },
      data: dataSchema,
      error: { type: "null" },
      meta: meta ?? { type: "null" },
    },
  };
  return schema;
}

function ref(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "OSP — Open Surveillance Platform API",
    version: "0.1.0",
    description:
      "RESTful API for the Open Surveillance Platform. Provides endpoints for camera management, live streaming, event detection, recording, alert rules, tenant administration, and extensions.",
    contact: {
      name: "OSP Team",
      url: "https://github.com/MatiDes12/osp",
    },
    license: {
      name: "MIT",
    },
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local development",
    },
  ],

  // ── Tags ──────────────────────────────────────────────────────────────
  tags: [
    { name: "Auth", description: "Authentication and session management" },
    {
      name: "Cameras",
      description: "Camera CRUD, streaming, PTZ, recording controls",
    },
    {
      name: "Camera Zones",
      description: "Detection zone management per camera",
    },
    {
      name: "Events",
      description: "Security event listing, acknowledgement, and summary",
    },
    {
      name: "Recordings",
      description: "Recording playback, timeline, and management",
    },
    { name: "Rules", description: "Alert rule CRUD and testing" },
    {
      name: "Tenants",
      description: "Tenant settings, branding, users, and usage",
    },
    {
      name: "Extensions",
      description: "Marketplace browsing, installation, and configuration",
    },
    { name: "Locations", description: "Physical location management" },
    { name: "Tags", description: "Camera tag management and assignment" },
    {
      name: "Health",
      description: "Service health checks and Prometheus metrics",
    },
    { name: "Dev", description: "Development-only utilities" },
  ],

  // ── Paths ─────────────────────────────────────────────────────────────
  paths: {
    // ── Auth ────────────────────────────────────────────────────────────
    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new account",
        description: "Creates a new user, tenant, and returns JWT tokens.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: ref("RegisterInput"),
            },
          },
        },
        responses: {
          201: {
            description: "Account created successfully",
            content: {
              "application/json": {
                schema: successEnvelope(ref("AuthResponse")),
              },
            },
          },
          409: {
            description: "Email already registered",
            content: { "application/json": { schema: errorResponse } },
          },
          422: {
            description: "Validation error",
            content: { "application/json": { schema: errorResponse } },
          },
        },
      },
    },

    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in with email and password",
        description:
          "Authenticates the user and returns JWT tokens with tenant context.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: ref("LoginInput"),
            },
          },
        },
        responses: {
          200: {
            description: "Login successful",
            content: {
              "application/json": {
                schema: successEnvelope(ref("AuthResponse")),
              },
            },
          },
          401: {
            description: "Invalid credentials",
            content: { "application/json": { schema: errorResponse } },
          },
        },
      },
    },

    "/api/v1/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh access token",
        description:
          "Uses a refresh token to obtain a new access/refresh token pair.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: {
                  refreshToken: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Tokens refreshed",
            content: {
              "application/json": {
                schema: successEnvelope({
                  type: "object",
                  properties: {
                    accessToken: { type: "string" },
                    refreshToken: { type: "string" },
                    expiresAt: { type: "string", format: "date-time" },
                  },
                }),
              },
            },
          },
          401: {
            description: "Invalid refresh token",
            content: { "application/json": { schema: errorResponse } },
          },
        },
      },
    },

    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out current session",
        description: "Invalidates the current session.",
        responses: {
          200: { description: "Logged out" },
        },
      },
    },

    // ── Cameras ─────────────────────────────────────────────────────────
    "/api/v1/cameras": {
      get: {
        tags: ["Cameras"],
        summary: "List cameras",
        description:
          "Returns a paginated list of cameras for the current tenant. Supports filtering by status, search term, and location.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 20, maximum: 100 },
          },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["online", "offline", "error", "connecting", "disabled"],
            },
          },
          {
            name: "search",
            in: "query",
            schema: { type: "string" },
            description: "Filter by camera name (case-insensitive)",
          },
          {
            name: "locationId",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: {
            description: "Camera list",
            content: {
              "application/json": {
                schema: successEnvelope(
                  { type: "array", items: ref("Camera") },
                  paginationMeta,
                ),
              },
            },
          },
        },
      },
      post: {
        tags: ["Cameras"],
        summary: "Create a camera",
        description:
          "Adds a new camera to the tenant. Registers the RTSP stream in go2rtc automatically.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("CreateCameraInput") } },
        },
        responses: {
          201: {
            description: "Camera created",
            content: {
              "application/json": { schema: successEnvelope(ref("Camera")) },
            },
          },
          403: {
            description: "Camera limit reached",
            content: { "application/json": { schema: errorResponse } },
          },
          409: {
            description: "Duplicate connection URI",
            content: { "application/json": { schema: errorResponse } },
          },
        },
      },
    },

    "/api/v1/cameras/{id}": {
      get: {
        tags: ["Cameras"],
        summary: "Get camera by ID",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: {
            description: "Camera details",
            content: {
              "application/json": { schema: successEnvelope(ref("Camera")) },
            },
          },
          404: {
            description: "Camera not found",
            content: { "application/json": { schema: errorResponse } },
          },
        },
      },
      patch: {
        tags: ["Cameras"],
        summary: "Update camera",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("UpdateCameraInput") } },
        },
        responses: {
          200: {
            description: "Camera updated",
            content: {
              "application/json": { schema: successEnvelope(ref("Camera")) },
            },
          },
          404: { description: "Camera not found" },
        },
      },
      delete: {
        tags: ["Cameras"],
        summary: "Delete camera",
        description:
          "Removes the camera and its go2rtc stream. Cascades to zones, events, and recordings.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Camera deleted" },
          404: { description: "Camera not found" },
        },
      },
    },

    "/api/v1/cameras/{id}/stream": {
      get: {
        tags: ["Cameras"],
        summary: "Get stream connection info",
        description:
          "Returns the WHEP URL, ICE servers, and fallback HLS URL for WebRTC streaming.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: {
            description: "Stream info",
            content: {
              "application/json": {
                schema: successEnvelope({
                  type: "object",
                  properties: {
                    whepUrl: { type: "string", format: "uri" },
                    token: { type: "string" },
                    fallbackHlsUrl: { type: "string", format: "uri" },
                    iceServers: { type: "array", items: { type: "object" } },
                  },
                }),
              },
            },
          },
          404: { description: "Camera not found" },
          409: { description: "Camera is disabled" },
        },
      },
    },

    "/api/v1/cameras/{id}/snapshot": {
      get: {
        tags: ["Cameras"],
        summary: "Get current camera snapshot",
        description: "Returns a JPEG image of the camera's current frame.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: {
            description: "JPEG snapshot",
            content: {
              "image/jpeg": { schema: { type: "string", format: "binary" } },
            },
          },
          404: { description: "Camera not found" },
        },
      },
    },

    "/api/v1/cameras/{id}/reconnect": {
      post: {
        tags: ["Cameras"],
        summary: "Force reconnect camera stream",
        description:
          "Removes and re-adds the stream in go2rtc. Useful when a camera goes offline.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Reconnect initiated" },
          404: { description: "Camera not found" },
          409: { description: "Camera is disabled" },
        },
      },
    },

    "/api/v1/cameras/discover": {
      post: {
        tags: ["Cameras"],
        summary: "Discover cameras on the network",
        description:
          "Performs a network scan for RTSP-enabled devices. Marks cameras already added to the tenant.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  subnet: {
                    type: "string",
                    description:
                      "Subnet to scan (e.g. '192.168.1.0/24'). Defaults to local network.",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Discovered cameras" },
        },
      },
    },

    "/api/v1/cameras/{id}/ptz": {
      post: {
        tags: ["Cameras"],
        summary: "Send PTZ command",
        description: "Sends a Pan/Tilt/Zoom command to the camera.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("PTZCommand") } },
        },
        responses: {
          200: { description: "Command accepted" },
          404: { description: "Camera not found" },
        },
      },
    },

    "/api/v1/cameras/{id}/record/start": {
      post: {
        tags: ["Cameras"],
        summary: "Start recording",
        description:
          "Starts recording for a camera. Returns the new recording ID.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  trigger: {
                    type: "string",
                    enum: [
                      "manual",
                      "motion",
                      "continuous",
                      "rule",
                      "ai_detection",
                    ],
                    default: "manual",
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Recording started" },
        },
      },
    },

    "/api/v1/cameras/{id}/record/stop": {
      post: {
        tags: ["Cameras"],
        summary: "Stop active recording",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Recording stopped" },
          404: { description: "No active recording" },
        },
      },
    },

    "/api/v1/cameras/{id}/record/status": {
      get: {
        tags: ["Cameras"],
        summary: "Get recording status",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: {
            description: "Recording status",
            content: {
              "application/json": {
                schema: successEnvelope({
                  type: "object",
                  properties: {
                    isRecording: { type: "boolean" },
                    recording: { type: "object", nullable: true },
                  },
                }),
              },
            },
          },
        },
      },
    },

    // ── Camera Zones ────────────────────────────────────────────────────
    "/api/v1/cameras/{id}/zones": {
      get: {
        tags: ["Camera Zones"],
        summary: "List zones for a camera",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: {
            description: "Zone list",
            content: {
              "application/json": {
                schema: successEnvelope({ type: "array", items: ref("Zone") }),
              },
            },
          },
        },
      },
      post: {
        tags: ["Camera Zones"],
        summary: "Create a zone",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("CreateZoneInput") } },
        },
        responses: {
          201: { description: "Zone created" },
        },
      },
    },

    "/api/v1/cameras/{id}/zones/{zoneId}": {
      patch: {
        tags: ["Camera Zones"],
        summary: "Update a zone",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "zoneId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("UpdateZoneInput") } },
        },
        responses: {
          200: { description: "Zone updated" },
          404: { description: "Zone not found" },
        },
      },
      delete: {
        tags: ["Camera Zones"],
        summary: "Delete a zone",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "zoneId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Zone deleted" },
        },
      },
    },

    // ── Events ──────────────────────────────────────────────────────────
    "/api/v1/events": {
      get: {
        tags: ["Events"],
        summary: "List events",
        description:
          "Returns a paginated list of security events. Supports filtering by camera, zone, type, severity, acknowledgement status, and date range.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "cameraId",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "zoneId",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "type",
            in: "query",
            schema: {
              type: "string",
              enum: [
                "motion",
                "person",
                "vehicle",
                "animal",
                "camera_offline",
                "camera_online",
                "tampering",
                "audio",
                "custom",
              ],
            },
          },
          {
            name: "severity",
            in: "query",
            schema: {
              type: "string",
              enum: ["low", "medium", "high", "critical"],
            },
          },
          { name: "acknowledged", in: "query", schema: { type: "boolean" } },
          {
            name: "from",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "to",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 50, maximum: 100 },
          },
        ],
        responses: {
          200: {
            description: "Event list",
            content: {
              "application/json": {
                schema: successEnvelope(
                  { type: "array", items: ref("Event") },
                  paginationMeta,
                ),
              },
            },
          },
        },
      },
      post: {
        tags: ["Events"],
        summary: "Create an event",
        description:
          "Creates a new security event, publishes it via WebSocket, evaluates alert rules, and may trigger auto-recording.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("CreateEventInput") } },
        },
        responses: {
          201: {
            description: "Event created",
            content: {
              "application/json": { schema: successEnvelope(ref("Event")) },
            },
          },
          404: { description: "Camera not found" },
        },
      },
    },

    "/api/v1/events/summary": {
      get: {
        tags: ["Events"],
        summary: "Get event summary",
        description:
          "Returns aggregate counts of events grouped by type, severity, and camera for a date range.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "from",
            in: "query",
            schema: { type: "string", format: "date-time" },
            description: "Defaults to 24 hours ago",
          },
          {
            name: "to",
            in: "query",
            schema: { type: "string", format: "date-time" },
            description: "Defaults to now",
          },
        ],
        responses: {
          200: {
            description: "Event summary",
            content: {
              "application/json": {
                schema: successEnvelope({
                  type: "object",
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    total: { type: "integer" },
                    byType: {
                      type: "object",
                      additionalProperties: { type: "integer" },
                    },
                    bySeverity: {
                      type: "object",
                      additionalProperties: { type: "integer" },
                    },
                    byCamera: {
                      type: "object",
                      additionalProperties: { type: "integer" },
                    },
                  },
                }),
              },
            },
          },
        },
      },
    },

    "/api/v1/events/{id}": {
      get: {
        tags: ["Events"],
        summary: "Get event by ID",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: {
            description: "Event details",
            content: {
              "application/json": { schema: successEnvelope(ref("Event")) },
            },
          },
          404: { description: "Event not found" },
        },
      },
    },

    "/api/v1/events/{id}/acknowledge": {
      patch: {
        tags: ["Events"],
        summary: "Acknowledge an event",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Event acknowledged" },
          404: { description: "Event not found" },
        },
      },
    },

    "/api/v1/events/bulk-acknowledge": {
      post: {
        tags: ["Events"],
        summary: "Bulk acknowledge events",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["eventIds"],
                properties: {
                  eventIds: {
                    type: "array",
                    items: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Events acknowledged" },
        },
      },
    },

    // ── Recordings ──────────────────────────────────────────────────────
    "/api/v1/recordings": {
      get: {
        tags: ["Recordings"],
        summary: "List recordings",
        description:
          "Returns a paginated list of recordings with camera names and playback URLs.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "cameraId",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "trigger",
            in: "query",
            schema: {
              type: "string",
              enum: ["manual", "motion", "continuous", "rule", "ai_detection"],
            },
          },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["recording", "completed", "failed"],
            },
          },
          {
            name: "from",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "to",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 20, maximum: 100 },
          },
        ],
        responses: {
          200: {
            description: "Recording list",
            content: {
              "application/json": {
                schema: successEnvelope(
                  { type: "array", items: ref("Recording") },
                  paginationMeta,
                ),
              },
            },
          },
        },
      },
    },

    "/api/v1/recordings/timeline": {
      get: {
        tags: ["Recordings"],
        summary: "Get recording timeline",
        description:
          "Returns recording segments for a camera on a specific date, useful for timeline visualization.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "cameraId",
            in: "query",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "date",
            in: "query",
            required: true,
            schema: { type: "string", format: "date" },
            description: "Date in YYYY-MM-DD format",
          },
        ],
        responses: {
          200: { description: "Timeline segments" },
          400: { description: "Missing required parameters" },
        },
      },
    },

    "/api/v1/recordings/{id}": {
      get: {
        tags: ["Recordings"],
        summary: "Get recording by ID",
        description:
          "Returns recording details with camera name and playback URL.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Recording details" },
          404: { description: "Recording not found" },
        },
      },
      delete: {
        tags: ["Recordings"],
        summary: "Delete a recording",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Recording deleted" },
          404: { description: "Recording not found" },
        },
      },
    },

    "/api/v1/recordings/{id}/play": {
      get: {
        tags: ["Recordings"],
        summary: "Play recorded video",
        description:
          "Streams the recorded MP4 file. Supports HTTP range requests for seeking.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: {
            description: "MP4 video stream",
            content: {
              "video/mp4": { schema: { type: "string", format: "binary" } },
            },
          },
          206: { description: "Partial content (range request)" },
          404: { description: "Recording or file not found" },
        },
      },
    },

    // ── Rules ───────────────────────────────────────────────────────────
    "/api/v1/rules": {
      get: {
        tags: ["Rules"],
        summary: "List alert rules",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Rule list",
            content: {
              "application/json": {
                schema: successEnvelope({ type: "array", items: ref("Rule") }),
              },
            },
          },
        },
      },
      post: {
        tags: ["Rules"],
        summary: "Create an alert rule",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("CreateRuleInput") } },
        },
        responses: {
          201: { description: "Rule created" },
        },
      },
    },

    "/api/v1/rules/webhook-attempts": {
      get: {
        tags: ["Rules"],
        summary: "List webhook delivery attempts",
        description:
          "Admin-only. Returns tracked webhook delivery attempts with optional rule/event/status filters.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "ruleId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "eventId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "status",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["delivered", "failed"] },
          },
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          200: {
            description: "Webhook delivery attempts",
            content: {
              "application/json": {
                schema: successEnvelope({
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", format: "uuid" },
                      tenant_id: { type: "string", format: "uuid" },
                      rule_id: { type: "string", format: "uuid" },
                      event_id: {
                        type: "string",
                        format: "uuid",
                        nullable: true,
                      },
                      url: { type: "string" },
                      attempt_number: { type: "integer" },
                      delivery_status: {
                        type: "string",
                        enum: ["delivered", "failed"],
                      },
                      response_status: { type: "integer", nullable: true },
                      error_message: { type: "string", nullable: true },
                      created_at: { type: "string", format: "date-time" },
                    },
                  },
                }),
              },
            },
          },
        },
      },
    },

    "/api/v1/rules/{id}": {
      get: {
        tags: ["Rules"],
        summary: "Get rule by ID",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Rule details" },
          404: { description: "Rule not found" },
        },
      },
      patch: {
        tags: ["Rules"],
        summary: "Update a rule",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("UpdateRuleInput") } },
        },
        responses: {
          200: { description: "Rule updated" },
          404: { description: "Rule not found" },
        },
      },
      delete: {
        tags: ["Rules"],
        summary: "Delete a rule",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Rule deleted" },
        },
      },
    },

    "/api/v1/rules/{id}/test": {
      post: {
        tags: ["Rules"],
        summary: "Test a rule against recent events",
        description:
          "Evaluates the rule against the last 50 matching events and returns how many would have triggered.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: {
            description: "Test results",
            content: {
              "application/json": {
                schema: successEnvelope({
                  type: "object",
                  properties: {
                    ruleId: { type: "string" },
                    ruleName: { type: "string" },
                    testedAgainst: { type: "integer" },
                    matched: { type: "integer" },
                    sampleMatches: { type: "array", items: { type: "object" } },
                  },
                }),
              },
            },
          },
          404: { description: "Rule not found" },
        },
      },
    },

    // ── Tenants ─────────────────────────────────────────────────────────
    "/api/v1/tenants/current": {
      get: {
        tags: ["Tenants"],
        summary: "Get current tenant",
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: "Tenant details" },
        },
      },
      patch: {
        tags: ["Tenants"],
        summary: "Update tenant settings",
        description:
          "Owner-only. Updates tenant name and/or settings (retention, recording mode, timezone, notifications).",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 100 },
                  settings: {
                    type: "object",
                    properties: {
                      defaultRetentionDays: {
                        type: "integer",
                        minimum: 1,
                        maximum: 365,
                      },
                      defaultRecordingMode: {
                        type: "string",
                        enum: ["motion", "continuous", "off"],
                      },
                      defaultMotionSensitivity: {
                        type: "integer",
                        minimum: 1,
                        maximum: 10,
                      },
                      timezone: { type: "string" },
                      notificationPreferences: {
                        type: "object",
                        properties: {
                          emailDigest: {
                            type: "string",
                            enum: ["none", "daily", "weekly"],
                          },
                          pushEnabled: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Tenant updated" },
        },
      },
    },

    "/api/v1/tenants/current/branding": {
      patch: {
        tags: ["Tenants"],
        summary: "Update tenant branding",
        description: "Owner-only. Updates colors, font, logo, and favicon.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  primaryColor: { type: "string" },
                  accentColor: { type: "string" },
                  fontFamily: { type: "string", nullable: true },
                  faviconUrl: { type: "string", format: "uri", nullable: true },
                  logoUrl: { type: "string", format: "uri", nullable: true },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Branding updated" },
        },
      },
    },

    "/api/v1/tenants/current/users": {
      get: {
        tags: ["Tenants"],
        summary: "List tenant users",
        description:
          "Returns all users in the current tenant with their roles.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: "User list with roles" },
        },
      },
    },

    "/api/v1/tenants/current/users/invite": {
      post: {
        tags: ["Tenants"],
        summary: "Invite a user",
        description: "Sends an invitation email to join the tenant.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "role"],
                properties: {
                  email: { type: "string", format: "email" },
                  role: {
                    type: "string",
                    enum: ["admin", "operator", "viewer"],
                  },
                  cameraIds: {
                    type: "array",
                    items: { type: "string", format: "uuid" },
                  },
                  message: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Invitation created and email sent" },
          403: { description: "User limit reached" },
          409: { description: "User already exists in tenant" },
        },
      },
    },

    "/api/v1/tenants/current/users/{userId}/role": {
      patch: {
        tags: ["Tenants"],
        summary: "Change user role",
        description: "Owner-only. Changes a user's role within the tenant.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "userId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["role"],
                properties: {
                  role: {
                    type: "string",
                    enum: ["admin", "operator", "viewer"],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Role updated" },
          403: { description: "Cannot change owner role" },
          404: { description: "User not found" },
        },
      },
    },

    "/api/v1/tenants/current/usage": {
      get: {
        tags: ["Tenants"],
        summary: "Get tenant usage stats",
        description:
          "Returns current usage of cameras, users, storage, extensions, and recordings against plan limits.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Usage stats",
            content: {
              "application/json": {
                schema: successEnvelope({
                  type: "object",
                  properties: {
                    plan: { type: "string" },
                    cameras: {
                      type: "object",
                      properties: {
                        used: { type: "integer" },
                        limit: { type: "integer" },
                      },
                    },
                    users: {
                      type: "object",
                      properties: {
                        used: { type: "integer" },
                        limit: { type: "integer" },
                      },
                    },
                    storage: {
                      type: "object",
                      properties: {
                        usedBytes: { type: "integer" },
                        limitBytes: { type: "integer" },
                      },
                    },
                    extensions: {
                      type: "object",
                      properties: {
                        used: { type: "integer" },
                        limit: { type: "integer" },
                      },
                    },
                    recordings: {
                      type: "object",
                      properties: {
                        totalCount: { type: "integer" },
                        totalDurationHours: { type: "number" },
                      },
                    },
                  },
                }),
              },
            },
          },
        },
      },
    },

    // ── Extensions ──────────────────────────────────────────────────────
    "/api/v1/extensions/marketplace": {
      get: {
        tags: ["Extensions"],
        summary: "Browse marketplace",
        description:
          "Returns a paginated list of published extensions sorted by popularity.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 20, maximum: 100 },
          },
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Extension list" },
        },
      },
    },

    "/api/v1/extensions/marketplace/{id}": {
      get: {
        tags: ["Extensions"],
        summary: "Get marketplace extension details",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Extension details" },
          404: { description: "Extension not found" },
        },
      },
    },

    "/api/v1/extensions": {
      get: {
        tags: ["Extensions"],
        summary: "List installed extensions",
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: "Installed extensions" },
        },
      },
      post: {
        tags: ["Extensions"],
        summary: "Install an extension",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["extensionId"],
                properties: {
                  extensionId: { type: "string", format: "uuid" },
                  config: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Extension installed" },
          404: { description: "Extension not found" },
          409: { description: "Already installed" },
        },
      },
    },

    "/api/v1/extensions/{id}/config": {
      patch: {
        tags: ["Extensions"],
        summary: "Update extension configuration",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["config"],
                properties: {
                  config: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Config updated" },
          404: { description: "Extension not found" },
        },
      },
    },

    "/api/v1/extensions/{id}/toggle": {
      patch: {
        tags: ["Extensions"],
        summary: "Enable or disable an extension",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["enabled"],
                properties: {
                  enabled: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Extension toggled" },
          404: { description: "Extension not found" },
        },
      },
    },

    "/api/v1/extensions/{id}": {
      delete: {
        tags: ["Extensions"],
        summary: "Uninstall an extension",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Extension uninstalled" },
          404: { description: "Extension not found" },
        },
      },
    },

    // ── Locations ───────────────────────────────────────────────────────
    "/api/v1/locations": {
      get: {
        tags: ["Locations"],
        summary: "List locations",
        description: "Returns paginated locations with camera counts.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 50, maximum: 100 },
          },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Location list" },
        },
      },
      post: {
        tags: ["Locations"],
        summary: "Create a location",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: ref("CreateLocationInput") },
          },
        },
        responses: {
          201: { description: "Location created" },
        },
      },
    },

    "/api/v1/locations/{id}": {
      get: {
        tags: ["Locations"],
        summary: "Get location by ID",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Location details with camera count" },
          404: { description: "Location not found" },
        },
      },
      patch: {
        tags: ["Locations"],
        summary: "Update a location",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: ref("UpdateLocationInput") },
          },
        },
        responses: {
          200: { description: "Location updated" },
          404: { description: "Location not found" },
        },
      },
      delete: {
        tags: ["Locations"],
        summary: "Delete a location",
        description:
          "Deletes the location. Cameras at this location have their location_id set to null.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Location deleted" },
          404: { description: "Location not found" },
        },
      },
    },

    "/api/v1/locations/{id}/cameras": {
      get: {
        tags: ["Locations"],
        summary: "List cameras at a location",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Camera list" },
        },
      },
    },

    // ── Tags ────────────────────────────────────────────────────────────
    "/api/v1/tags": {
      get: {
        tags: ["Tags"],
        summary: "List tags",
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: "Tag list" },
        },
      },
      post: {
        tags: ["Tags"],
        summary: "Create a tag",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string" },
                  color: { type: "string", default: "#3B82F6" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Tag created" },
          409: { description: "Duplicate tag name" },
        },
      },
    },

    "/api/v1/tags/{id}": {
      delete: {
        tags: ["Tags"],
        summary: "Delete a tag",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Tag deleted" },
          404: { description: "Tag not found" },
        },
      },
    },

    "/api/v1/cameras/{id}/tags": {
      get: {
        tags: ["Tags"],
        summary: "List tags assigned to a camera",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Tag assignments" },
        },
      },
      post: {
        tags: ["Tags"],
        summary: "Assign tags to a camera",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["tagIds"],
                properties: {
                  tagIds: {
                    type: "array",
                    items: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Tags assigned" },
        },
      },
    },

    "/api/v1/cameras/{id}/tags/{tagId}": {
      delete: {
        tags: ["Tags"],
        summary: "Remove a tag from a camera",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "tagId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: { description: "Tag removed" },
        },
      },
    },

    // ── Health ──────────────────────────────────────────────────────────
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Basic health check",
        description:
          "Returns OK/degraded status based on Supabase and Redis connectivity.",
        responses: {
          200: {
            description: "Health status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", enum: ["ok", "degraded"] },
                    service: { type: "string" },
                    version: { type: "string" },
                    timestamp: { type: "string", format: "date-time" },
                    checks: {
                      type: "object",
                      properties: {
                        supabase: { type: "string" },
                        redis: { type: "string" },
                        go2rtc: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/health/detailed": {
      get: {
        tags: ["Health"],
        summary: "Detailed health check",
        description:
          "Returns full health snapshot including latency for each service, gRPC service status, WebSocket connections, and camera/event/recording stats.",
        responses: {
          200: { description: "Detailed health snapshot" },
        },
      },
    },

    "/health/metrics": {
      get: {
        tags: ["Health"],
        summary: "Prometheus metrics",
        description:
          "Returns metrics in Prometheus exposition format including request counts, latencies, camera stats, event counts, and WebSocket connections.",
        responses: {
          200: {
            description: "Prometheus text format",
            content: { "text/plain": { schema: { type: "string" } } },
          },
        },
      },
    },

    // ── Dev ─────────────────────────────────────────────────────────────
    "/api/v1/dev/simulate-motion": {
      post: {
        tags: ["Dev"],
        summary: "Simulate a motion event",
        description:
          "Development-only. Creates a fake motion event for the specified camera and broadcasts it via WebSocket.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["cameraId"],
                properties: {
                  cameraId: { type: "string", format: "uuid" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Simulated event created" },
          403: { description: "Only available in development mode" },
          404: { description: "Camera not found" },
        },
      },
    },
  },

  // ── Components ──────────────────────────────────────────────────────
  components: {
    securitySchemes: {
      BearerAuth: bearerAuth,
    },
    schemas: {
      RegisterInput: {
        type: "object",
        required: ["email", "password", "displayName", "tenantName"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          displayName: { type: "string" },
          tenantName: { type: "string" },
        },
      },
      LoginInput: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
      },
      AuthResponse: {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              email: { type: "string", format: "email" },
              displayName: { type: "string" },
              role: { type: "string" },
            },
          },
          tenant: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string" },
              slug: { type: "string" },
              plan: { type: "string" },
            },
          },
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          expiresAt: { type: "string", format: "date-time" },
        },
      },
      Camera: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          tenant_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          protocol: { type: "string", enum: ["rtsp", "rtmp", "hls", "webrtc"] },
          connection_uri: { type: "string" },
          status: {
            type: "string",
            enum: ["online", "offline", "error", "connecting", "disabled"],
          },
          location: { type: "object" },
          capabilities: { type: "object" },
          config: { type: "object" },
          ptz_capable: { type: "boolean" },
          audio_capable: { type: "boolean" },
          location_id: { type: "string", format: "uuid", nullable: true },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      CreateCameraInput: {
        type: "object",
        required: ["name", "protocol", "connectionUri"],
        properties: {
          name: { type: "string" },
          protocol: { type: "string", enum: ["rtsp", "rtmp", "hls", "webrtc"] },
          connectionUri: { type: "string" },
          location: { type: "object" },
          config: { type: "object" },
        },
      },
      UpdateCameraInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          location: { type: "object" },
          config: { type: "object" },
        },
      },
      PTZCommand: {
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string", enum: ["move", "stop", "preset", "home"] },
          pan: { type: "number" },
          tilt: { type: "number" },
          zoom: { type: "number" },
          speed: { type: "number" },
          presetId: { type: "string" },
        },
      },
      Zone: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          camera_id: { type: "string", format: "uuid" },
          tenant_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          polygon_coordinates: { type: "array", items: { type: "object" } },
          alert_enabled: { type: "boolean" },
          sensitivity: { type: "integer" },
          color_hex: { type: "string" },
          visible_to_roles: { type: "array", items: { type: "string" } },
        },
      },
      CreateZoneInput: {
        type: "object",
        required: ["name", "polygonCoordinates"],
        properties: {
          name: { type: "string" },
          polygonCoordinates: { type: "array", items: { type: "object" } },
          alertEnabled: { type: "boolean" },
          sensitivity: { type: "integer" },
          colorHex: { type: "string" },
          visibleToRoles: { type: "array", items: { type: "string" } },
        },
      },
      UpdateZoneInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          polygonCoordinates: { type: "array", items: { type: "object" } },
          alertEnabled: { type: "boolean" },
          sensitivity: { type: "integer" },
          colorHex: { type: "string" },
          visibleToRoles: { type: "array", items: { type: "string" } },
        },
      },
      Event: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          camera_id: { type: "string", format: "uuid" },
          zone_id: { type: "string", format: "uuid", nullable: true },
          tenant_id: { type: "string", format: "uuid" },
          type: {
            type: "string",
            enum: [
              "motion",
              "person",
              "vehicle",
              "animal",
              "camera_offline",
              "camera_online",
              "tampering",
              "audio",
              "custom",
            ],
          },
          severity: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
          },
          detected_at: { type: "string", format: "date-time" },
          metadata: { type: "object" },
          intensity: { type: "integer", minimum: 0, maximum: 100 },
          acknowledged: { type: "boolean" },
          acknowledged_by: { type: "string", format: "uuid", nullable: true },
          acknowledged_at: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          created_at: { type: "string", format: "date-time" },
        },
      },
      CreateEventInput: {
        type: "object",
        required: ["cameraId", "type", "severity"],
        properties: {
          cameraId: { type: "string", format: "uuid" },
          type: {
            type: "string",
            enum: [
              "motion",
              "person",
              "vehicle",
              "animal",
              "camera_offline",
              "camera_online",
              "tampering",
              "audio",
              "custom",
            ],
          },
          severity: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
          },
          metadata: { type: "object", default: {} },
          zoneId: { type: "string", format: "uuid" },
          intensity: { type: "integer", minimum: 0, maximum: 100, default: 50 },
        },
      },
      Recording: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          camera_id: { type: "string", format: "uuid" },
          tenant_id: { type: "string", format: "uuid" },
          trigger: {
            type: "string",
            enum: ["manual", "motion", "continuous", "rule", "ai_detection"],
          },
          status: {
            type: "string",
            enum: ["recording", "completed", "failed"],
          },
          start_time: { type: "string", format: "date-time" },
          end_time: { type: "string", format: "date-time", nullable: true },
          duration_sec: { type: "integer" },
          file_size_bytes: { type: "integer" },
          storage_path: { type: "string" },
          camera_name: { type: "string" },
          playback_url: { type: "string", format: "uri" },
        },
      },
      Rule: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          tenant_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          trigger_event: { type: "string" },
          conditions: { type: "object" },
          actions: { type: "array", items: { type: "object" } },
          camera_ids: {
            type: "array",
            items: { type: "string", format: "uuid" },
          },
          zone_ids: {
            type: "array",
            items: { type: "string", format: "uuid" },
          },
          schedule: { type: "object", nullable: true },
          cooldown_sec: { type: "integer" },
          enabled: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      CreateRuleInput: {
        type: "object",
        required: ["name", "triggerEvent", "conditions", "actions"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          triggerEvent: { type: "string" },
          conditions: { type: "object" },
          actions: { type: "array", items: { type: "object" } },
          cameraIds: {
            type: "array",
            items: { type: "string", format: "uuid" },
          },
          zoneIds: { type: "array", items: { type: "string", format: "uuid" } },
          schedule: { type: "object" },
          cooldownSec: { type: "integer" },
          enabled: { type: "boolean", default: true },
        },
      },
      UpdateRuleInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          triggerEvent: { type: "string" },
          conditions: { type: "object" },
          actions: { type: "array", items: { type: "object" } },
          cameraIds: {
            type: "array",
            items: { type: "string", format: "uuid" },
          },
          zoneIds: { type: "array", items: { type: "string", format: "uuid" } },
          schedule: { type: "object" },
          cooldownSec: { type: "integer" },
          enabled: { type: "boolean" },
        },
      },
      CreateLocationInput: {
        type: "object",
        required: ["name", "timezone"],
        properties: {
          name: { type: "string" },
          address: { type: "string" },
          city: { type: "string" },
          country: { type: "string" },
          lat: { type: "number" },
          lng: { type: "number" },
          timezone: { type: "string" },
        },
      },
      UpdateLocationInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          address: { type: "string" },
          city: { type: "string" },
          country: { type: "string" },
          lat: { type: "number" },
          lng: { type: "number" },
          timezone: { type: "string" },
        },
      },
    },
  },

  security: [{ BearerAuth: [] }],
} as const;
