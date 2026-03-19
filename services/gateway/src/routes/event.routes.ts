import { existsSync, statSync, createReadStream, mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { publishEvent } from "../lib/event-publisher.js";
import { evaluateRules } from "../lib/rule-evaluator.js";
import { executeActions } from "../lib/action-executor.js";
import { getRecordingService } from "../services/recording.service.js";
import { createLogger } from "../lib/logger.js";
import {
  getAIDetectionService,
  type DetectionResult,
} from "../services/ai-detection.service.js";
import {
  ListEventsSchema,
  BulkAcknowledgeSchema,
  EventTypeSchema,
  EventSeveritySchema,
  createSuccessResponse,
} from "@osp/shared";

const ruleLogger = createLogger("rule-engine");
const aiLogger = createLogger("ai-detection");

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

  // --- Rule Engine: evaluate and execute matching rules ---
  // Run asynchronously so event creation response is not delayed
  (async () => {
    try {
      const { data: enabledRules } = await supabase
        .from("alert_rules")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("enabled", true);

      if (!enabledRules || enabledRules.length === 0) return;

      const matched = evaluateRules(ospEvent, enabledRules);

      if (matched.length > 0) {
        ruleLogger.info("Rules matched for event", {
          eventId: ospEvent.id,
          eventType: ospEvent.type,
          matchedCount: String(matched.length),
          ruleNames: matched.map((m) => m.ruleName).join(", "),
        });

        for (const match of matched) {
          await executeActions(match, ospEvent, tenantId);
        }
      }
    } catch (err) {
      ruleLogger.error("Rule evaluation failed", {
        eventId: ospEvent.id,
        error: String(err),
      });
    }
  })();

  // --- Auto-record on motion events ---
  if (input.type === "motion") {
    (async () => {
      try {
        // Check if the camera has recording_mode set to "motion"
        const { data: cameraConfig } = await supabase
          .from("cameras")
          .select("config")
          .eq("id", input.cameraId)
          .eq("tenant_id", tenantId)
          .single();

        const config = cameraConfig?.config as Record<string, unknown> | null;
        const recordingMode = config?.recording_mode ?? config?.recordingMode;

        if (recordingMode === "motion") {
          const recordingService = getRecordingService();
          const recordingId = await recordingService.startTimedRecording(
            input.cameraId,
            tenantId,
            "motion",
            30_000, // 30 seconds
          );
          ruleLogger.info("Auto-started motion recording", {
            eventId: ospEvent.id,
            cameraId: input.cameraId,
            recordingId,
          });
        }
      } catch (err) {
        ruleLogger.warn("Failed to auto-start motion recording", {
          eventId: ospEvent.id,
          cameraId: input.cameraId,
          error: String(err),
        });
      }
    })();
  }

  // --- AI detection on motion events (fire-and-forget) ---
  if (input.type === "motion") {
    (async () => {
      try {
        const aiService = getAIDetectionService();
        if (!aiService.isConfigured()) return;

        // Only analyze when the camera is online.
        const { data: cameraStatus } = await supabase
          .from("cameras")
          .select("status")
          .eq("id", input.cameraId)
          .eq("tenant_id", tenantId)
          .single();

        if (cameraStatus?.status !== "online") return;

        const go2rtcUrl =
          process.env["GO2RTC_URL"] ?? "http://localhost:1984";

        const snapshotRes = await fetch(
          `${go2rtcUrl}/api/frame.jpeg?src=${encodeURIComponent(input.cameraId)}`,
          { signal: AbortSignal.timeout(5000) },
        ).catch(() => null);

        if (!snapshotRes?.ok) return;

        const buf = Buffer.from(await snapshotRes.arrayBuffer());
        const detections = await aiService.analyzeFrame(input.cameraId, buf);

        if (detections.length === 0) return;

        // Attach detections to the original motion event.
        await supabase
          .from("events")
          .update({
            metadata: {
              ...input.metadata,
              detections,
            },
          })
          .eq("id", ospEvent.id);

        // Create typed events for high-confidence detections.
        const typedDetections = detections.filter(
          (d): d is DetectionResult & {
            type: Exclude<DetectionResult["type"], "unknown">;
          } => d.type !== "unknown" && d.confidence > 0.7,
        );
        if (typedDetections.length === 0) return;

        // Pre-load enabled rules once to avoid N x rule queries.
        const { data: enabledRules } = await supabase
          .from("alert_rules")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("enabled", true);

        for (const d of typedDetections) {
          const createdEventAt = new Date().toISOString();
          const typedEventRow = {
            camera_id: input.cameraId,
            zone_id: input.zoneId ?? null,
            tenant_id: tenantId,
            type: d.type,
            severity: input.severity,
            detected_at: createdEventAt,
            metadata: {
              ...input.metadata,
              detection: d,
              confidence: d.confidence,
              label: d.label,
            },
            intensity: input.intensity,
            acknowledged: false,
          };

          const { data: created, error: insertError } = await supabase
            .from("events")
            .insert(typedEventRow)
            .select("*")
            .single();

          if (insertError || !created) {
            aiLogger.warn("Failed to insert typed AI event", {
              tenantId,
              cameraId: input.cameraId,
              type: d.type,
              error: String(insertError),
            });
            continue;
          }

          const typedOspEvent = {
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

          // Publish + run rules so typed AI events trigger actions.
          await publishEvent(tenantId, typedOspEvent);

          if (enabledRules && enabledRules.length > 0) {
            const matched = evaluateRules(typedOspEvent, enabledRules);
            for (const match of matched) {
              await executeActions(match, typedOspEvent, tenantId);
            }
          }
        }
      } catch (err) {
        aiLogger.warn("AI motion detection failed", {
          eventId: ospEvent.id,
          cameraId: input.cameraId,
          error: String(err),
        });
      }
    })();
  }

  // --- Save a 10-second event clip for detection events (fire-and-forget) ---
  const clipEventTypes = ["motion", "person", "vehicle"];
  if (clipEventTypes.includes(input.type)) {
    const eventId = ospEvent.id;
    const cameraId = input.cameraId;
    (async () => {
      try {
        const go2rtcUrl = process.env["GO2RTC_URL"] ?? "http://localhost:1984";
        const recordingsDir = process.env["RECORDINGS_DIR"] ?? "./recordings";
        const clipDir = join(recordingsDir, tenantId, "clips");
        mkdirSync(clipDir, { recursive: true });

        const clipPath = join(clipDir, `${eventId}.mp4`);
        const clipUrl = `${go2rtcUrl}/api/stream.mp4?src=${encodeURIComponent(cameraId)}&duration=10`;

        const res = await fetch(clipUrl, {
          signal: AbortSignal.timeout(20_000),
        });

        if (res.ok && res.body) {
          const fileStream = createWriteStream(clipPath);
          const reader = res.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              fileStream.write(value);
            }
          } finally {
            fileStream.end();
          }

          // Update event with clip path
          await supabase
            .from("events")
            .update({ clip_path: clipPath })
            .eq("id", eventId);

          ruleLogger.info("Event clip saved", {
            eventId,
            cameraId,
            clipPath,
          });
        }
      } catch (err) {
        ruleLogger.warn("Failed to save event clip", {
          eventId,
          error: String(err),
        });
      }
    })();
  }

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
  const { error: typeError } = await supabase
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

// Stream event clip
eventRoutes.get("/:id/clip", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const eventId = c.req.param("id");
  const supabase = getSupabase();

  const { data: event, error } = await supabase
    .from("events")
    .select("id, tenant_id, clip_path")
    .eq("id", eventId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !event) {
    throw new ApiError("EVENT_NOT_FOUND", "Event not found", 404);
  }

  const filePath = event.clip_path as string | null;
  if (!filePath || !existsSync(filePath)) {
    throw new ApiError("CLIP_NOT_FOUND", "Event clip not found on disk", 404);
  }

  const stats = statSync(filePath);
  const fileSize = stats.size;
  const rangeHeader = c.req.header("Range");

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = Number.parseInt(parts[0] ?? "0", 10);
    const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const nodeStream = createReadStream(filePath, { start, end });
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(webStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": "video/mp4",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Content-Type": "video/mp4",
      "Cache-Control": "private, max-age=3600",
    },
  });
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
