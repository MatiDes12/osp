import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { createSuccessResponse } from "@osp/shared";

export const userRoutes = new Hono<Env>();

const UpdatePushTokenSchema = z.object({
  pushToken: z.string().min(1),
});

// PATCH /api/v1/users/push-token
// Stores the Expo push token for the currently authenticated user.
userRoutes.patch("/push-token", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const supabase = getSupabase();

  const body = await c.req.json().catch(() => ({}));
  const input = UpdatePushTokenSchema.parse(body);

  const { error } = await supabase
    .from("users")
    .update({ push_token: input.pushToken })
    .eq("id", userId)
    .eq("tenant_id", tenantId);

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to save push token", 500);
  }

  return c.json(
    createSuccessResponse({ saved: true, pushToken: input.pushToken }),
  );
});
