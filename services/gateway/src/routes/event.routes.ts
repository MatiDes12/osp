import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { publishEvent } from "../lib/event-publisher.js";
import {
  ListEventsSchema,
  BulkAcknowledgeSchema,
  EventTypeSchema,
  EventSeveritySchema,
} from "@osp/shared";
import { createSuccessResponse } from "@osp/shared";

export const eventRoutes = new Hono<Env>();

// ---------- Create event ----------

const CreateEventSchema = z.object({
  cameraId: z.string().uuid(),
  type: EventTypeSchema,
  severity: EventSeveritySchema,
  metadata: z.record(z.unknown()).default({}),
  zoneId: z.string().uuid().optional(),
  intensity: z.number().min(0).max(100).default(50),
});

eventRoutes.post("/", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const input = CreateEventSchema.parse(body);
  const supabase = getSupabase();

  // Look up camera name (and verify it belongs to the tenant)
  const { data: camera, error: cameraError } = await supabase
    .from("cameras")
    .select("id, name")
    .eq("id", input.cameraId)
    .eq("tenant_id", tenantId)
    .single();

  if (cameraError || !camera) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found or does not belong to tenant", 404);
  }

  // Optionally look up zone name
  let zoneName: string | null = null;
  if (input.zoneId) {
    const { data: zone } = await supabase
      .from("zones")
      .select("name")
      .eq("id", input.zoneId)
      .eq("tenant_id", tenantId)
      .single();
    zoneName = (zone?.name as string) ?? null;
  }

  const now = new Date().toISOString();

  const eventRow = {
    camera_id: input.cameraId,
    zone_id: input.zoneId ?? null,
    tenant_id: tenantId,
    type: input.type,
    severity: input.severity,
    detected_at: now,
    metadata: input.metadata,
    intensity: input.intensity,
    acknowledged: false,
  };

  const { data: created, error: insertError } = await supabase
    .from("events")
    .insert(eventRow)
    .select("*")
    .single();

  if (insertError || !created) {
    throw new ApiError("INTERNAL_ERROR", "Failed to create event", 500);
  }

  const ospEvent = {
    id: created.id as string,
    cameraId: created.camera_id as string,
    cameraName: (camera.name as string) ?? "Unknown",
    zoneId: (created.zone_id as string | null) ?? null,
    zoneName,
    tenantId,
    type: created.type as string,
    severity: created.severity as string,
    detectedAt: created.detected_at as string,
    metadata: created.metadata as Record<string, unknown>,
    snapshotUrl: null,
    clipUrl: null,
    intensity: created.intensity as number,
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
    createdAt: created.created_at as string,
  };

  // Publish to Redis so all WS clients receive the event in real-time
  await publishEvent(tenantId, ospEvent);

  return c.json(createSuccessResponse(ospEvent), 201);
});

// ---------- List events ----------

// List events
eventRoutes.get("/", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const input = ListEventsSchema.parse({
    cameraId: c.req.query("cameraId"),
    zoneId: c.req.query("zoneId"),
    type: c.req.query("type"),
    severity: c.req.query("severity"),
    acknowledged: c.req.query("acknowledged"),
    from: c.req.query("from"),
    to: c.req.query("to"),
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  });

  const offset = (input.page - 1) * input.limit;

  let query = supabase
    .from("events")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + input.limit - 1);

  if (input.cameraId) {
    query = query.eq("camera_id", input.cameraId);
  }
  if (input.zoneId) {
    query = query.eq("zone_id", input.zoneId);
  }
  if (input.type) {
    query = query.eq("type", input.type);
  }
  if (input.severity) {
    query = query.eq("severity", input.severity);
  }
  if (input.acknowledged !== undefined) {
    query = query.eq("acknowledged", input.acknowledged);
  }
  if (input.from) {
    query = query.gte("created_at", input.from);
  }
  if (input.to) {
    query = query.lte("created_at", input.to);
  }

  const { data: events, count, error } = await query;

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch events", 500);
  }

  return c.json(
    createSuccessResponse(events ?? [], {
      total: count ?? 0,
      page: input.page,
      limit: input.limit,
      hasMore: (count ?? 0) > offset + input.limit,
    }),
  );
});

// Event summary
eventRoutes.get("/summary", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const from = c.req.query("from") ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const to = c.req.query("to") ?? new Date().toISOString();

  // Counts by type
  const { data: byType, error: typeError } = await supabase
    .from("events")
    .select("type")
    .eq("tenant_id", tenantId)
    .gte("created_at", from)
    .lte("created_at", to);

  if (typeError) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch event summary", 500);
  }

  const typeCounts: Record<string, number> = {};
  const severityCounts: Record<string, number> = {};
  const cameraCounts: Record<string, number> = {};

  // Fetch full details for aggregation
  const { data: allEvents, error: allError } = await supabase
    .from("events")
    .select("type, severity, camera_id")
    .eq("tenant_id", tenantId)
    .gte("created_at", from)
    .lte("created_at", to);

  if (allError) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch event summary", 500);
  }

  for (const event of allEvents ?? []) {
    const eventType = event.type as string;
    const eventSeverity = event.severity as string;
    const cameraId = event.camera_id as string;

    typeCounts[eventType] = (typeCounts[eventType] ?? 0) + 1;
    severityCounts[eventSeverity] = (severityCounts[eventSeverity] ?? 0) + 1;
    cameraCounts[cameraId] = (cameraCounts[cameraId] ?? 0) + 1;
  }

  return c.json(
    createSuccessResponse({
      from,
      to,
      total: (allEvents ?? []).length,
      byType: typeCounts,
      bySeverity: severityCounts,
      byCamera: cameraCounts,
    }),
  );
});

// Get event by ID
eventRoutes.get("/:id", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const eventId = c.req.param("id");
  const supabase = getSupabase();

  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !event) {
    throw new ApiError("EVENT_NOT_FOUND", "Event not found", 404);
  }

  return c.json(createSuccessResponse(event));
});

// Acknowledge event
eventRoutes.patch("/:id/acknowledge", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const eventId = c.req.param("id");
  const supabase = getSupabase();

  const { data: event, error } = await supabase
    .from("events")
    .update({
      acknowledged: true,
      acknowledged_by: userId,
      acknowledged_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error || !event) {
    throw new ApiError("EVENT_NOT_FOUND", "Event not found", 404);
  }

  return c.json(createSuccessResponse(event));
});

// Bulk acknowledge events
eventRoutes.post("/bulk-acknowledge", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const body = await c.req.json();
  const input = BulkAcknowledgeSchema.parse(body);
  const supabase = getSupabase();

  const { data: events, error } = await supabase
    .from("events")
    .update({
      acknowledged: true,
      acknowledged_by: userId,
      acknowledged_at: new Date().toISOString(),
    })
    .in("id", input.eventIds)
    .eq("tenant_id", tenantId)
    .select();

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to acknowledge events", 500);
  }

  return c.json(
    createSuccessResponse({
      acknowledged: (events ?? []).length,
      eventIds: (events ?? []).map((e) => e.id as string),
    }),
  );
});
