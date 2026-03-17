import { createMiddleware } from "hono/factory";
import type { Env } from "../app.js";
import { ApiError } from "./error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import type { UserRole } from "@osp/shared";
import { hasRole } from "@osp/shared";

export function requireAuth(minimumRole: UserRole = "viewer") {
  return createMiddleware<Env>(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new ApiError("AUTH_TOKEN_MISSING", "Authorization token required", 401);
    }

    const token = authHeader.slice(7);
    const supabase = getSupabase();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new ApiError("AUTH_TOKEN_INVALID", "Invalid or expired token", 401);
    }

    const tenantId = user.user_metadata?.["tenant_id"] as string | undefined;
    const userRole = user.user_metadata?.["role"] as UserRole | undefined;

    if (!tenantId || !userRole) {
      throw new ApiError("AUTH_TOKEN_INVALID", "Token missing tenant context", 401);
    }

    if (!hasRole(userRole, minimumRole)) {
      throw new ApiError(
        "AUTH_INSUFFICIENT_ROLE",
        `This action requires ${minimumRole} role or higher`,
        403,
      );
    }

    c.set("tenantId", tenantId);
    c.set("userId", user.id);
    c.set("userRole", userRole);

    await next();
  });
}
