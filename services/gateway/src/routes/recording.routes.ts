import { existsSync, statSync, createReadStream } from "fs";
import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { getRecordingService } from "../services/recording.service.js";
import { createSuccessResponse } from "@osp/shared";
import { Readable } from "stream";

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
    .order("start_time", { ascending: false })
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
    query = query.gte("start_time", from);
  }
  if (to) {
    query = query.lte("start_time", to);
  }

  const { data: recordings, count, error } = await query;

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch recordings", 500);
  }

  // Enrich recordings with camera name and playback URL
  const recordingService = getRecordingService();
  const enriched = await enrichRecordings(recordings ?? [], recordingService);

  return c.json(
    createSuccessResponse(enriched, {
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
    .select("id, start_time, end_time, trigger, status")
    .eq("tenant_id", tenantId)
    .eq("camera_id", cameraId)
    .gte("start_time", dayStart)
    .lte("start_time", dayEnd)
    .order("start_time", { ascending: true });

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch timeline", 500);
  }

  const segments = (recordings ?? []).map((r) => ({
    id: r.id as string,
    startTime: r.start_time as string,
    endTime: r.end_time as string | null,
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

  const recordingService = getRecordingService();
  const cameraId = recording.camera_id as string;
  const playbackUrl = recordingService.getPlaybackUrl(recordingId);

  // Look up camera name
  const cameraName = await getCameraName(cameraId);

  return c.json(
    createSuccessResponse({
      ...recording,
      camera_name: cameraName,
      playback_url: playbackUrl,
    }),
  );
});

// Stream recorded MP4 file for playback
recordingRoutes.get("/:id/play", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const recordingId = c.req.param("id");
  const supabase = getSupabase();

  const { data: recording, error } = await supabase
    .from("recordings")
    .select("id, tenant_id, storage_path, status")
    .eq("id", recordingId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !recording) {
    throw new ApiError("RECORDING_NOT_FOUND", "Recording not found", 404);
  }

  const filePath = recording.storage_path as string;
  if (!filePath || !existsSync(filePath)) {
    throw new ApiError(
      "RECORDING_FILE_NOT_FOUND",
      "Recording file not found on disk",
      404,
    );
  }

  const stats = statSync(filePath);
  const fileSize = stats.size;
  const rangeHeader = c.req.header("Range");

  // Support range requests for seeking
  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0] ?? "0", 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
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

  return c.json(createSuccessResponse({ deleted: true }));
});

// ── Helpers ──

async function getCameraName(cameraId: string): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("cameras")
    .select("name")
    .eq("id", cameraId)
    .single();
  return (data?.name as string) ?? "Unknown Camera";
}

async function enrichRecordings(
  recordings: Record<string, unknown>[],
  recordingService: ReturnType<typeof getRecordingService>,
): Promise<Record<string, unknown>[]> {
  // Collect unique camera IDs to batch-lookup names
  const cameraIds = [...new Set(recordings.map((r) => r.camera_id as string))];
  const supabase = getSupabase();

  const nameMap = new Map<string, string>();
  if (cameraIds.length > 0) {
    const { data: cameras } = await supabase
      .from("cameras")
      .select("id, name")
      .in("id", cameraIds);
    for (const cam of cameras ?? []) {
      nameMap.set(cam.id as string, cam.name as string);
    }
  }

  return recordings.map((r) => {
    const cameraId = r.camera_id as string;
    const recId = r.id as string;
    return {
      ...r,
      camera_name: nameMap.get(cameraId) ?? "Unknown Camera",
      playback_url: recordingService.getPlaybackUrl(recId),
    };
  });
}
