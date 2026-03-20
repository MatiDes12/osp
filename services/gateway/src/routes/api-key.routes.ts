import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { createSuccessResponse } from "@osp/shared";
import { createLogger } from "../lib/logger.js";
import { createHash } from "node:crypto";
import { z } from "zod";

const logger = createLogger("api-key-routes");

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

export const apiKeyRoutes = new Hono<Env>();

// List API keys (hash never returned)
apiKeyRoutes.get("/", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("api_keys")
    .select(
      "id, name, key_prefix, last_used_at, expires_at, revoked_at, created_at, created_by",
    )
    .eq("tenant_id", tenantId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to list API keys", 500);
  }

  return c.json(createSuccessResponse(data ?? []));
});

// Create API key — returns full key ONCE
apiKeyRoutes.post("/", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const body = await c.req.json();
  const input = CreateApiKeySchema.parse(body);
  const supabase = getSupabase();

  // Generate key: osp_ + 32 random hex chars
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const fullKey = `osp_${randomHex}`;
  const keyPrefix = randomHex.substring(0, 8);
  const keyHash = createHash("sha256").update(fullKey).digest("hex");

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      tenant_id: tenantId,
      created_by: userId,
      name: input.name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      expires_at: input.expiresAt ?? null,
    })
    .select("id, name, key_prefix, expires_at, created_at")
    .single();

  if (error || !data) {
    throw new ApiError("INTERNAL_ERROR", "Failed to create API key", 500);
  }

  logger.info("API key created", { tenantId, keyId: data.id as string });

  // Return the full key in this response only — it cannot be retrieved again
  return c.json(createSuccessResponse({ ...data, key: fullKey }), 201);
});

// Revoke API key
apiKeyRoutes.delete("/:id", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const keyId = c.req.param("id");
  const supabase = getSupabase();

  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("tenant_id", tenantId)
    .is("revoked_at", null);

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to revoke API key", 500);
  }

  logger.info("API key revoked", { tenantId, keyId });

  return c.json(createSuccessResponse({ revoked: true }));
});
