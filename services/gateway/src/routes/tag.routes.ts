import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { createLogger } from "../lib/logger.js";
import { createSuccessResponse } from "@osp/shared";

const logger = createLogger("tag-routes");

// ── Tag management routes (mounted at /api/v1/tags) ──

export const tagRoutes = new Hono<Env>();

// List tenant's tags
tagRoutes.get("/", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const { data: tags, error } = await supabase
    .from("camera_tags")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) {
    logger.error("Failed to fetch tags", { error: String(error) });
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch tags", 500);
  }

  return c.json(createSuccessResponse(tags ?? []));
});

// Create tag
tagRoutes.post("/", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const { name, color } = body as { name?: string; color?: string };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    throw new ApiError("VALIDATION_ERROR", "Tag name is required", 422);
  }

  const supabase = getSupabase();

  const { data: tag, error } = await supabase
    .from("camera_tags")
    .insert({
      tenant_id: tenantId,
      name: name.trim(),
      color: color ?? "#3B82F6",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApiError(
        "DUPLICATE_TAG",
        "A tag with this name already exists",
        409,
      );
    }
    logger.error("Failed to create tag", { error: String(error) });
    throw new ApiError("INTERNAL_ERROR", "Failed to create tag", 500);
  }

  return c.json(createSuccessResponse(tag), 201);
});

// Delete tag
tagRoutes.delete("/:id", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const tagId = c.req.param("id");
  const supabase = getSupabase();

  const { data: tag, error: fetchError } = await supabase
    .from("camera_tags")
    .select("id")
    .eq("id", tagId)
    .eq("tenant_id", tenantId)
    .single();

  if (fetchError || !tag) {
    throw new ApiError("NOT_FOUND", "Tag not found", 404);
  }

  const { error: deleteError } = await supabase
    .from("camera_tags")
    .delete()
    .eq("id", tagId)
    .eq("tenant_id", tenantId);

  if (deleteError) {
    logger.error("Failed to delete tag", { error: String(deleteError) });
    throw new ApiError("INTERNAL_ERROR", "Failed to delete tag", 500);
  }

  return c.json(createSuccessResponse({ deleted: true }));
});

// ── Camera-tag assignment routes (mounted at /api/v1/cameras) ──

export const cameraTagRoutes = new Hono<Env>();

// List tag assignments for a camera
cameraTagRoutes.get("/:id/tags", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");
  const supabase = getSupabase();

  // Verify camera belongs to tenant
  const { data: camera } = await supabase
    .from("cameras")
    .select("id")
    .eq("id", cameraId)
    .eq("tenant_id", tenantId)
    .single();

  if (!camera) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
  }

  const { data: assignments, error } = await supabase
    .from("camera_tag_assignments")
    .select("*")
    .eq("camera_id", cameraId);

  if (error) {
    logger.error("Failed to fetch tag assignments", { error: String(error) });
    throw new ApiError(
      "INTERNAL_ERROR",
      "Failed to fetch tag assignments",
      500,
    );
  }

  return c.json(createSuccessResponse(assignments ?? []));
});

// Assign tags to a camera
cameraTagRoutes.post("/:id/tags", requireAuth("operator"), async (c) => {
  const tenantId = c.get("tenantId");
  const cameraId = c.req.param("id");
  const body = await c.req.json();
  const { tagIds } = body as { tagIds?: string[] };

  if (!Array.isArray(tagIds) || tagIds.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "tagIds array is required", 422);
  }

  const supabase = getSupabase();

  // Verify camera belongs to tenant
  const { data: camera, error: cameraError } = await supabase
    .from("cameras")
    .select("id")
    .eq("id", cameraId)
    .eq("tenant_id", tenantId)
    .single();

  if (cameraError || !camera) {
    throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
  }

  // Verify tags belong to tenant
  const { data: validTags } = await supabase
    .from("camera_tags")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", tagIds);

  const validTagIds = new Set(
    (validTags ?? []).map((t: { id: string }) => t.id),
  );
  const rows = tagIds
    .filter((tid) => validTagIds.has(tid))
    .map((tid) => ({ camera_id: cameraId, tag_id: tid }));

  if (rows.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "No valid tags provided", 422);
  }

  const { error } = await supabase
    .from("camera_tag_assignments")
    .upsert(rows, { onConflict: "camera_id,tag_id" });

  if (error) {
    logger.error("Failed to assign tags", { error: String(error) });
    throw new ApiError("INTERNAL_ERROR", "Failed to assign tags", 500);
  }

  return c.json(createSuccessResponse({ assigned: rows.length }));
});

// Remove tag from a camera
cameraTagRoutes.delete(
  "/:id/tags/:tagId",
  requireAuth("operator"),
  async (c) => {
    const tenantId = c.get("tenantId");
    const cameraId = c.req.param("id");
    const tagId = c.req.param("tagId");
    const supabase = getSupabase();

    // Verify camera belongs to tenant
    const { data: camera } = await supabase
      .from("cameras")
      .select("id")
      .eq("id", cameraId)
      .eq("tenant_id", tenantId)
      .single();

    if (!camera) {
      throw new ApiError("CAMERA_NOT_FOUND", "Camera not found", 404);
    }

    const { error } = await supabase
      .from("camera_tag_assignments")
      .delete()
      .eq("camera_id", cameraId)
      .eq("tag_id", tagId);

    if (error) {
      logger.error("Failed to remove tag", { error: String(error) });
      throw new ApiError("INTERNAL_ERROR", "Failed to remove tag", 500);
    }

    return c.json(createSuccessResponse({ deleted: true }));
  },
);
