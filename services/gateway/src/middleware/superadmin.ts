import { createMiddleware } from "hono/factory";
import type { Env } from "../app.js";
import { ApiError } from "./error-handler.js";
import { getSupabase } from "../lib/supabase.js";

/**
 * requireSuperAdmin — gates routes to OSP company superadmins only.
 *
 * The flag is stored in auth.users.raw_user_meta_data as { is_superadmin: true }.
 * Grant with: SELECT grant_superadmin('<user-id>'); in Supabase SQL editor.
 */
export function requireSuperAdmin() {
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

    const isSuperAdmin = user.user_metadata?.["is_superadmin"] === true;
    if (!isSuperAdmin) {
      throw new ApiError(
        "AUTH_SUPERADMIN_REQUIRED",
        "This endpoint requires superadmin privileges",
        403,
      );
    }

    c.set("userId", user.id);
    // tenantId is not meaningful for superadmin routes, but set a sentinel value
    // so downstream code that might call c.get("tenantId") doesn't crash.
    c.set("tenantId", "__superadmin__");
    c.set("userRole", "owner");

    await next();
  });
}
