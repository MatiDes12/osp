import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { invalidateCache } from "../lib/config.js";
import { createSuccessResponse } from "@osp/shared";

export const configRoutes = new Hono<Env>();

const SetConfigSchema = z.object({
  value: z.string(),
  scope: z.enum(["global", "tenant"]).optional().default("global"),
});

// List config keys (no values, for security)
configRoutes.get("/keys", requireAuth("admin"), async (c) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("config_secrets")
    .select("key, scope")
    .eq("scope", "global")
    .is("tenant_id", null);

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to list config keys", 500);
  }

  const keys = (data ?? []).map((r) => r.key as string);
  return c.json(createSuccessResponse({ keys }));
});

// Set a config value (admin only)
configRoutes.put("/keys/:key", requireAuth("admin"), async (c) => {
  const key = c.req.param("key");
  const body = await c.req.json();
  const input = SetConfigSchema.parse(body);

  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) {
    throw new ApiError("VALIDATION_ERROR", "Invalid config key format", 400);
  }

  const supabase = getSupabase();
  const tenantId = input.scope === "tenant" ? c.get("tenantId") : null;

  const { data: existing } = await supabase
    .from("config_secrets")
    .select("id")
    .eq("key", key)
    .is("tenant_id", tenantId)
    .maybeSingle();

  const now = new Date().toISOString();
  if (existing) {
    const { error } = await supabase
      .from("config_secrets")
      .update({ value: input.value, updated_at: now })
      .eq("id", existing.id);
    if (error) throw new ApiError("INTERNAL_ERROR", "Failed to update config", 500);
  } else {
    const { error } = await supabase.from("config_secrets").insert({
      key,
      value: input.value,
      scope: input.scope,
      tenant_id: tenantId,
    });
    if (error) throw new ApiError("INTERNAL_ERROR", "Failed to insert config", 500);
  }

  invalidateCache();
  return c.json(createSuccessResponse({ key, updated: true }));
});
