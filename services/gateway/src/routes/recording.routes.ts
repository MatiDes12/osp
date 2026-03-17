import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { createSuccessResponse } from "@osp/shared";

export const recordingRoutes = new Hono<Env>();

// List recordings
recordingRoutes.get("/", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const page = parseInt(c.req.query("page") ?? "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const cameraId = c.req.query("cameraId");
  const trigger = c.req.query("trigger");
  const status = c.req.query("status");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const offset = (page - 1) * limit;

  let query = supabase
    .from("recordings")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (cameraId) {
    query = query.eq("camera_id", cameraId);
  }
  if (trigger) {
    query = query.eq("trigger", trigger);
  }
  if (status) {
    query = query.eq("status", status);
  }
  if (from) {
    query = query.gte("started_at", from);
  }
  if (to) {
    query = query.lte("started_at", to);
  }

  const { data: recordings, count, error } = await query;

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch recordings", 500);
  }

  return c.json(
    createSuccessResponse(recordings ?? [], {
      total: count ?? 0,
      page,
      limit,
      hasMore: (count ?? 0) > offset + limit,
    }),
  );
});

// Timeline data for a camera on a specific date
recordingRoutes.get("/timeline", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const cameraId = c.req.query("cameraId");
  const date = c.req.query("date");

  if (!cameraId || !date) {
    throw new ApiError("VALIDATION_ERROR", "cameraId and date are required", 400);
  }

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  const { data: recordings, error } = await supabase
    .from("recordings")
    .select("id, started_at, ended_at, trigger, status")
    .eq("tenant_id", tenantId)
    .eq("camera_id", cameraId)
    .gte("started_at", dayStart)
    .lte("started_at", dayEnd)
    .order("started_at", { ascending: true });

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch timeline", 500);
  }

  const segments = (recordings ?? []).map((r) => ({
    id: r.id as string,
    startedAt: r.started_at as string,
    endedAt: r.ended_at as string | null,
    trigger: r.trigger as string,
    status: r.status as string,
  }));

  return c.json(
    createSuccessResponse({
      cameraId,
      date,
      segments,
    }),
  );
});

// Get recording by ID with playback URL
recordingRoutes.get("/:id", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const recordingId = c.req.param("id");
  const supabase = getSupabase();

  const { data: recording, error } = await supabase
    .from("recordings")
    .select("*")
    .eq("id", recordingId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !recording) {
    throw new ApiError("RECORDING_NOT_FOUND", "Recording not found", 404);
  }

  // Placeholder signed URL - will be replaced with actual S3/storage signed URL
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  const playbackUrl = `https://storage.placeholder.local/recordings/${tenantId}/${recordingId}/stream.m3u8?token=placeholder&expires=${encodeURIComponent(expiresAt)}`;

  return c.json(
    createSuccessResponse({
      ...recording,
      playbackUrl,
      playbackExpiresAt: expiresAt,
    }),
  );
});

// Delete recording
recordingRoutes.delete("/:id", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const recordingId = c.req.param("id");
  const supabase = getSupabase();

  const { error } = await supabase
    .from("recordings")
    .delete()
    .eq("id", recordingId)
    .eq("tenant_id", tenantId);

  if (error) {
    throw new ApiError("RECORDING_NOT_FOUND", "Recording not found", 404);
  }

  // TODO: Delete actual storage files via storage service

  return c.json(createSuccessResponse({ deleted: true }));
});
