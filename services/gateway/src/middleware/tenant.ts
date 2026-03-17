import { createMiddleware } from "hono/factory";
import type { Env } from "../app.js";
import { PLAN_LIMITS } from "@osp/shared";
import type { TenantPlan } from "@osp/shared";
import { getCacheService } from "../lib/cache.js";
import { getSupabase } from "../lib/supabase.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("tenant-middleware");

export type TenantEnv = {
  Variables: Env["Variables"] & {
    tenantPlan: TenantPlan;
    tenantLimits: (typeof PLAN_LIMITS)[TenantPlan];
  };
};

/**
 * Loads tenant plan and limits into request context.
 * Must run after auth middleware (requires tenantId in context).
 * Uses Redis cache with DB fallback.
 */
export function tenantContext() {
  return createMiddleware<TenantEnv>(async (c, next) => {
    const tenantId = c.get("tenantId");
    if (!tenantId) {
      await next();
      return;
    }

    const cache = getCacheService();
    let plan = await cache.getTenantPlan(tenantId);

    if (!plan) {
      plan = await loadTenantPlanFromDb(tenantId);
      if (plan) {
        await cache.setTenantPlan(tenantId, plan);
      }
    }

    const resolvedPlan: TenantPlan = plan ?? "free";
    const limits = PLAN_LIMITS[resolvedPlan];

    c.set("tenantPlan", resolvedPlan);
    c.set("tenantLimits", limits);

    await next();
  });
}

async function loadTenantPlanFromDb(tenantId: string): Promise<TenantPlan | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("tenants")
      .select("plan")
      .eq("id", tenantId)
      .single();

    if (error || !data) {
      logger.warn("Failed to load tenant plan from DB", { tenantId, error: String(error) });
      return null;
    }

    return data.plan as TenantPlan;
  } catch (err) {
    logger.error("Error loading tenant plan", { tenantId, error: String(err) });
    return null;
  }
}
