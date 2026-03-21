import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { createSuccessResponse } from "@osp/shared";
import { createLogger } from "../lib/logger.js";
import { isLprConfigured } from "../services/lpr.service.js";

const logger = createLogger("lpr-routes");

const AddWatchlistSchema = z.object({
  plate: z
    .string()
    .min(1)
    .max(20)
    .transform((s) => s.toUpperCase().replace(/\s+/g, "")),
  label: z.string().max(100).default(""),
  alertOnDetect: z.boolean().default(true),
});

const UpdateWatchlistSchema = z.object({
  label: z.string().max(100).optional(),
  alertOnDetect: z.boolean().optional(),
});

export const lprRoutes = new Hono<Env>();

// LPR status + provider info
lprRoutes.get("/status", requireAuth("viewer"), (c) => {
  return c.json(
    createSuccessResponse({
      configured: isLprConfigured(),
      provider: "platerecognizer",
      docsUrl: "https://docs.platerecognizer.com",
    }),
  );
});

// List watchlist entries
lprRoutes.get("/watchlist", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("lpr_watchlist")
    .select("id, plate, label, alert_on_detect, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error)
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch watchlist", 500);

  return c.json(createSuccessResponse(data ?? []));
});

// Add plate to watchlist
lprRoutes.post("/watchlist", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const body = await c.req.json();
  const input = AddWatchlistSchema.parse(body);
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("lpr_watchlist")
    .insert({
      tenant_id: tenantId,
      created_by: userId,
      plate: input.plate,
      label: input.label,
      alert_on_detect: input.alertOnDetect,
    })
    .select("id, plate, label, alert_on_detect, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApiError(
        "LPR_DUPLICATE_PLATE",
        `Plate ${input.plate} is already on the watchlist`,
        409,
      );
    }
    throw new ApiError("INTERNAL_ERROR", "Failed to add plate", 500);
  }

  logger.info("Plate added to watchlist", { tenantId, plate: input.plate });
  return c.json(createSuccessResponse(data), 201);
});

// Update watchlist entry
lprRoutes.patch("/watchlist/:id", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  const body = await c.req.json();
  const input = UpdateWatchlistSchema.parse(body);
  const supabase = getSupabase();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.label !== undefined) updates["label"] = input.label;
  if (input.alertOnDetect !== undefined)
    updates["alert_on_detect"] = input.alertOnDetect;

  const { data, error } = await supabase
    .from("lpr_watchlist")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, plate, label, alert_on_detect, updated_at")
    .single();

  if (error || !data)
    throw new ApiError("INTERNAL_ERROR", "Failed to update plate", 500);

  return c.json(createSuccessResponse(data));
});

// Remove plate from watchlist
lprRoutes.delete("/watchlist/:id", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  const supabase = getSupabase();

  const { error } = await supabase
    .from("lpr_watchlist")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error)
    throw new ApiError("INTERNAL_ERROR", "Failed to remove plate", 500);

  logger.info("Plate removed from watchlist", { tenantId, id });
  return c.json(createSuccessResponse({ deleted: true }));
});

// Recent LPR detections (events of type lpr.detected or lpr.alert)
lprRoutes.get("/detections", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);

  const { data, error } = await supabase
    .from("events")
    .select(
      "id, camera_id, type, severity, detected_at, metadata, acknowledged",
    )
    .eq("tenant_id", tenantId)
    .in("type", ["lpr.detected", "lpr.alert"])
    .order("detected_at", { ascending: false })
    .limit(limit);

  if (error)
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch LPR detections", 500);

  return c.json(createSuccessResponse(data ?? []));
});
