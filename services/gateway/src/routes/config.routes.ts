import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { invalidateCache, get } from "../lib/config.js";
import { createSuccessResponse } from "@osp/shared";
import { isR2Configured, uploadBufferToR2 } from "../lib/r2.js";

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

// Get a specific config value (admin only)
configRoutes.get("/keys/:key", requireAuth("admin"), async (c) => {
  const key = c.req.param("key");
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("config_secrets")
    .select("key, value, scope")
    .eq("key", key)
    .is("tenant_id", null)
    .maybeSingle();

  if (error) throw new ApiError("INTERNAL_ERROR", "Failed to get config", 500);
  if (!data) {
    return c.json(createSuccessResponse({ key, value: null }));
  }
  return c.json(createSuccessResponse({ key, value: data.value as string }));
});

// Set a config value.
// Admins can set global or tenant-scoped keys.
// Operators/owners can only set tenant-scoped keys (their own tenant settings).
configRoutes.put("/keys/:key", requireAuth("operator"), async (c) => {
  const key = c.req.param("key");
  const body = await c.req.json();
  const input = SetConfigSchema.parse(body);

  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) {
    throw new ApiError("VALIDATION_ERROR", "Invalid config key format", 400);
  }

  // Non-admins can only write tenant-scoped keys, never global
  const userRole = c.get("userRole");
  if (userRole !== "admin" && input.scope !== "tenant") {
    throw new ApiError("AUTH_INSUFFICIENT_ROLE", "Only admins can set global config keys", 403);
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
    if (error)
      throw new ApiError("INTERNAL_ERROR", "Failed to update config", 500);
  } else {
    const { error } = await supabase.from("config_secrets").insert({
      key,
      value: input.value,
      scope: input.scope,
      tenant_id: tenantId,
    });
    if (error)
      throw new ApiError("INTERNAL_ERROR", "Failed to insert config", 500);
  }

  invalidateCache();
  return c.json(createSuccessResponse({ key, updated: true }));
});

// POST /api/v1/config/test-r2 — verify R2 credentials by uploading a tiny test object
configRoutes.post("/test-r2", requireAuth("admin"), async (c) => {
  if (!isR2Configured()) {
    throw new ApiError("CONFIG_MISSING", "R2 is not configured — set R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY", 400);
  }
  try {
    await uploadBufferToR2(
      Buffer.from("osp-r2-test"),
      `_osp_test/connectivity-check.txt`,
      "text/plain",
    );
    return c.json(createSuccessResponse({ ok: true }));
  } catch (err) {
    throw new ApiError("R2_CONNECTION_FAILED", `R2 connection failed: ${String(err)}`, 502);
  }
});
