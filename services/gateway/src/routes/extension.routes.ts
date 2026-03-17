import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { createSuccessResponse } from "@osp/shared";
import { z } from "zod";

const InstallExtensionSchema = z.object({
  extensionId: z.string().uuid(),
  config: z.record(z.unknown()).optional(),
});

const UpdateExtensionConfigSchema = z.object({
  config: z.record(z.unknown()),
});

const ToggleExtensionSchema = z.object({
  enabled: z.boolean(),
});

export const extensionRoutes = new Hono<Env>();

// Browse marketplace
extensionRoutes.get("/marketplace", requireAuth("viewer"), async (c) => {
  const supabase = getSupabase();

  const page = parseInt(c.req.query("page") ?? "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const category = c.req.query("category");
  const search = c.req.query("search");
  const offset = (page - 1) * limit;

  let query = supabase
    .from("extensions")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .order("install_count", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) {
    query = query.contains("categories", [category]);
  }
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data: extensions, count, error } = await query;

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch marketplace extensions", 500);
  }

  return c.json(
    createSuccessResponse(extensions ?? [], {
      total: count ?? 0,
      page,
      limit,
      hasMore: (count ?? 0) > offset + limit,
    }),
  );
});

// Get marketplace extension details
extensionRoutes.get("/marketplace/:id", requireAuth("viewer"), async (c) => {
  const extensionId = c.req.param("id");
  const supabase = getSupabase();

  const { data: extension, error } = await supabase
    .from("extensions")
    .select("*")
    .eq("id", extensionId)
    .eq("status", "published")
    .single();

  if (error || !extension) {
    throw new ApiError("EXTENSION_NOT_FOUND", "Extension not found", 404);
  }

  return c.json(createSuccessResponse(extension));
});

// List installed extensions
extensionRoutes.get("/", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const { data: installed, error } = await supabase
    .from("tenant_extensions")
    .select("*, extension:extensions(*)")
    .eq("tenant_id", tenantId)
    .order("installed_at", { ascending: false });

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch installed extensions", 500);
  }

  return c.json(createSuccessResponse(installed ?? []));
});

// Install extension
extensionRoutes.post("/", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const input = InstallExtensionSchema.parse(body);
  const supabase = getSupabase();

  // Verify extension exists and is published
  const { data: extension } = await supabase
    .from("extensions")
    .select("id, version, manifest")
    .eq("id", input.extensionId)
    .eq("status", "published")
    .single();

  if (!extension) {
    throw new ApiError("EXTENSION_NOT_FOUND", "Extension not found or not available", 404);
  }

  // Check if already installed
  const { data: existing } = await supabase
    .from("tenant_extensions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("extension_id", input.extensionId)
    .single();

  if (existing) {
    throw new ApiError("EXTENSION_ALREADY_INSTALLED", "Extension is already installed", 409);
  }

  const { data: installed, error } = await supabase
    .from("tenant_extensions")
    .insert({
      tenant_id: tenantId,
      extension_id: input.extensionId,
      installed_version: extension.version as string,
      config: input.config ?? {},
      enabled: true,
    })
    .select("*, extension:extensions(*)")
    .single();

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to install extension", 500);
  }

  // Increment install count
  const { data: currentExt } = await supabase
    .from("extensions")
    .select("install_count")
    .eq("id", input.extensionId)
    .single();
  const currentCount = (currentExt?.install_count as number) ?? 0;
  await supabase
    .from("extensions")
    .update({ install_count: currentCount + 1 })
    .eq("id", input.extensionId);

  return c.json(createSuccessResponse(installed), 201);
});

// Update extension config
extensionRoutes.patch("/:id/config", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const installedId = c.req.param("id");
  const body = await c.req.json();
  const input = UpdateExtensionConfigSchema.parse(body);
  const supabase = getSupabase();

  const { data: installed, error } = await supabase
    .from("tenant_extensions")
    .update({
      config: input.config,
      updated_at: new Date().toISOString(),
    })
    .eq("id", installedId)
    .eq("tenant_id", tenantId)
    .select("*, extension:extensions(*)")
    .single();

  if (error || !installed) {
    throw new ApiError("EXTENSION_NOT_FOUND", "Installed extension not found", 404);
  }

  return c.json(createSuccessResponse(installed));
});

// Toggle extension enabled/disabled
extensionRoutes.patch("/:id/toggle", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const installedId = c.req.param("id");
  const body = await c.req.json();
  const input = ToggleExtensionSchema.parse(body);
  const supabase = getSupabase();

  const { data: installed, error } = await supabase
    .from("tenant_extensions")
    .update({
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", installedId)
    .eq("tenant_id", tenantId)
    .select("*, extension:extensions(*)")
    .single();

  if (error || !installed) {
    throw new ApiError("EXTENSION_NOT_FOUND", "Installed extension not found", 404);
  }

  return c.json(createSuccessResponse(installed));
});

// Uninstall extension
extensionRoutes.delete("/:id", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const installedId = c.req.param("id");
  const supabase = getSupabase();

  // Get extension_id before deleting for decrementing count
  const { data: installed } = await supabase
    .from("tenant_extensions")
    .select("extension_id")
    .eq("id", installedId)
    .eq("tenant_id", tenantId)
    .single();

  if (!installed) {
    throw new ApiError("EXTENSION_NOT_FOUND", "Installed extension not found", 404);
  }

  const { error } = await supabase
    .from("tenant_extensions")
    .delete()
    .eq("id", installedId)
    .eq("tenant_id", tenantId);

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to uninstall extension", 500);
  }

  return c.json(createSuccessResponse({ deleted: true }));
});
