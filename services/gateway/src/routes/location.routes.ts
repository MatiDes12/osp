import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { createLogger } from "../lib/logger.js";
import { CreateLocationSchema, UpdateLocationSchema } from "@osp/shared";
import { createSuccessResponse } from "@osp/shared";

const logger = createLogger("location-routes");

export const locationRoutes = new Hono<Env>();

// List locations for tenant
locationRoutes.get("/", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const page = parseInt(c.req.query("page") ?? "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const search = c.req.query("search");
  const offset = (page - 1) * limit;

  let query = supabase
    .from("locations")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data: locations, count, error } = await query;

  if (error) {
    logger.error("Failed to fetch locations", { error: String(error) });
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch locations", 500);
  }

  // Attach camera counts
  const locationIds = (locations ?? []).map((l: Record<string, unknown>) => l.id as string);

  let cameraCounts: Record<string, number> = {};
  if (locationIds.length > 0) {
    const { data: cameraRows } = await supabase
      .from("cameras")
      .select("location_id")
      .eq("tenant_id", tenantId)
      .in("location_id", locationIds);

    if (cameraRows) {
      for (const row of cameraRows) {
        const locId = (row as Record<string, unknown>).location_id as string;
        cameraCounts[locId] = (cameraCounts[locId] ?? 0) + 1;
      }
    }
  }

  const enriched = (locations ?? []).map((loc: Record<string, unknown>) => ({
    ...loc,
    camera_count: cameraCounts[loc.id as string] ?? 0,
  }));

  return c.json(
    createSuccessResponse(enriched, {
      total: count ?? 0,
      page,
      limit,
      hasMore: (count ?? 0) > offset + limit,
    }),
  );
});

// Create location
locationRoutes.post("/", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const input = CreateLocationSchema.parse(body);
  const supabase = getSupabase();

  const { data: location, error } = await supabase
    .from("locations")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      address: input.address ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      timezone: input.timezone,
      floor_plan: input.floor_plan ?? [],
    })
    .select()
    .single();

  if (error) {
    logger.error("Failed to create location", { error: String(error) });
    throw new ApiError("INTERNAL_ERROR", "Failed to create location", 500);
  }

  return c.json(createSuccessResponse({ ...location, camera_count: 0 }), 201);
});

// Get location by ID with camera count
locationRoutes.get("/:id", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const locationId = c.req.param("id");
  const supabase = getSupabase();

  const { data: location, error } = await supabase
    .from("locations")
    .select("*")
    .eq("id", locationId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !location) {
    throw new ApiError("NOT_FOUND", "Location not found", 404);
  }

  const { count: cameraCount } = await supabase
    .from("cameras")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("location_id", locationId);

  return c.json(
    createSuccessResponse({ ...location, camera_count: cameraCount ?? 0 }),
  );
});

// Update location
locationRoutes.patch("/:id", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const locationId = c.req.param("id");
  const body = await c.req.json();
  const input = UpdateLocationSchema.parse(body);
  const supabase = getSupabase();

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates["name"] = input.name;
  if (input.address !== undefined) updates["address"] = input.address;
  if (input.city !== undefined) updates["city"] = input.city;
  if (input.country !== undefined) updates["country"] = input.country;
  if (input.lat !== undefined) updates["lat"] = input.lat;
  if (input.lng !== undefined) updates["lng"] = input.lng;
  if (input.timezone !== undefined) updates["timezone"] = input.timezone;
  if (input.floor_plan !== undefined) updates["floor_plan"] = input.floor_plan;
  updates["updated_at"] = new Date().toISOString();

  const { data: location, error } = await supabase
    .from("locations")
    .update(updates)
    .eq("id", locationId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error || !location) {
    throw new ApiError("NOT_FOUND", "Location not found", 404);
  }

  return c.json(createSuccessResponse(location));
});

// Delete location (cameras set to null via ON DELETE SET NULL)
locationRoutes.delete("/:id", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const locationId = c.req.param("id");
  const supabase = getSupabase();

  const { data: location, error: fetchError } = await supabase
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("tenant_id", tenantId)
    .single();

  if (fetchError || !location) {
    throw new ApiError("NOT_FOUND", "Location not found", 404);
  }

  const { error: deleteError } = await supabase
    .from("locations")
    .delete()
    .eq("id", locationId)
    .eq("tenant_id", tenantId);

  if (deleteError) {
    logger.error("Failed to delete location", { error: String(deleteError) });
    throw new ApiError("INTERNAL_ERROR", "Failed to delete location", 500);
  }

  return c.json(createSuccessResponse({ deleted: true }));
});

// List cameras at a location
locationRoutes.get("/:id/cameras", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const locationId = c.req.param("id");
  const supabase = getSupabase();

  const { data: cameras, error } = await supabase
    .from("cameras")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("location_id", locationId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch cameras", 500);
  }

  return c.json(createSuccessResponse(cameras ?? []));
});
