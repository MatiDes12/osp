/**
 * Admin routes — OSP superadmin panel API.
 * All routes require the is_superadmin flag in the caller's JWT.
 *
 * Mounted at: /api/v1/admin
 */
import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireSuperAdmin } from "../middleware/superadmin.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";

const adminRoutes = new Hono<Env>();

// All admin routes require superadmin
adminRoutes.use("*", requireSuperAdmin());

// ─── GET /api/v1/admin/stats ──────────────────────────────────────────────────
// Global system totals: tenants, cameras, events, recordings, storage.
adminRoutes.get("/stats", async (c) => {
  const supabase = getSupabase();

  const [tenantsRes, camerasRes, eventsRes, recordingsRes] = await Promise.all([
    supabase.from("tenants").select("id, status, plan", { count: "exact", head: false }),
    supabase.from("cameras").select("id, status", { count: "exact", head: false }),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    supabase.from("recordings").select("id", { count: "exact", head: true }),
  ]);

  const tenants = tenantsRes.data ?? [];
  const cameras = camerasRes.data ?? [];

  return c.json({
    success: true,
    data: {
      tenants: {
        total: tenantsRes.count ?? 0,
        active: tenants.filter((t) => t.status === "active").length,
        suspended: tenants.filter((t) => t.status === "suspended").length,
      },
      cameras: {
        total: camerasRes.count ?? 0,
        online: cameras.filter((cam) => cam.status === "online").length,
        offline: cameras.filter((cam) => cam.status !== "online").length,
      },
      events: {
        last24h: eventsRes.count ?? 0,
      },
      recordings: {
        total: recordingsRes.count ?? 0,
      },
    },
  });
});

// ─── GET /api/v1/admin/tenants ────────────────────────────────────────────────
// List all tenants with per-tenant usage stats.
adminRoutes.get("/tenants", async (c) => {
  const supabase = getSupabase();
  const search = c.req.query("search") ?? "";
  const status = c.req.query("status"); // active | suspended | all
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? "25")));
  const offset = (page - 1) * limit;

  let query = supabase
    .from("admin_tenant_stats")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.ilike("tenant_name", `%${search}%`);
  }
  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new ApiError("TENANT_FETCH_FAILED", "Failed to fetch tenants", 500, error.message);
  }

  return c.json({
    success: true,
    data: data ?? [],
    meta: {
      total: count ?? 0,
      page,
      limit,
      pages: Math.ceil((count ?? 0) / limit),
    },
  });
});

// ─── GET /api/v1/admin/tenants/:id ───────────────────────────────────────────
// Single tenant detail: info + cameras + recent events.
adminRoutes.get("/tenants/:id", async (c) => {
  const tenantId = c.req.param("id");
  const supabase = getSupabase();

  const [tenantRes, camerasRes, eventsRes, recordingsRes] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", tenantId).single(),
    supabase
      .from("cameras")
      .select("id, name, status, protocol, last_seen_at")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("events")
      .select("id, type, severity, created_at, camera_id")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("recordings")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
  ]);

  if (tenantRes.error || !tenantRes.data) {
    throw new ApiError("TENANT_NOT_FOUND", "Tenant not found", 404);
  }

  return c.json({
    success: true,
    data: {
      tenant: tenantRes.data,
      cameras: camerasRes.data ?? [],
      recentEvents: eventsRes.data ?? [],
      recordingCount: recordingsRes.count ?? 0,
    },
  });
});

// ─── GET /api/v1/admin/tenants/:id/users ─────────────────────────────────────
// List users belonging to a tenant.
adminRoutes.get("/tenants/:id/users", async (c) => {
  const tenantId = c.req.param("id");
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("tenant_users")
    .select("id, user_id, role, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at");

  if (error) {
    throw new ApiError("USER_FETCH_FAILED", "Failed to fetch users", 500);
  }

  return c.json({ success: true, data: data ?? [] });
});

// ─── PATCH /api/v1/admin/tenants/:id ─────────────────────────────────────────
// Update tenant — suspend / unsuspend / change plan.
adminRoutes.patch("/tenants/:id", async (c) => {
  const tenantId = c.req.param("id");
  const body = await c.req.json<{ status?: string; plan?: string; name?: string }>();
  const supabase = getSupabase();

  const allowed: Record<string, unknown> = {};
  if (body.status !== undefined) allowed["status"] = body.status;
  if (body.plan !== undefined) allowed["plan"] = body.plan;
  if (body.name !== undefined) allowed["name"] = body.name;

  if (Object.keys(allowed).length === 0) {
    throw new ApiError("VALIDATION_ERROR", "No updatable fields provided", 400);
  }

  const { data, error } = await supabase
    .from("tenants")
    .update({ ...allowed, updated_at: new Date().toISOString() })
    .eq("id", tenantId)
    .select()
    .single();

  if (error || !data) {
    throw new ApiError("TENANT_UPDATE_FAILED", "Failed to update tenant", 500, error?.message);
  }

  return c.json({ success: true, data });
});

// ─── DELETE /api/v1/admin/tenants/:id ────────────────────────────────────────
// Permanently delete a tenant and all their data.
// Cascades via FK: cameras, events, recordings, rules, zones, etc.
adminRoutes.delete("/tenants/:id", async (c) => {
  const tenantId = c.req.param("id");
  const supabase = getSupabase();

  const { error } = await supabase.from("tenants").delete().eq("id", tenantId);

  if (error) {
    throw new ApiError("TENANT_DELETE_FAILED", "Failed to delete tenant", 500, error.message);
  }

  return c.json({ success: true, data: { deleted: tenantId } });
});

// ─── GET /api/v1/admin/users ──────────────────────────────────────────────────
// List superadmin users (is_superadmin = true in user_metadata).
adminRoutes.get("/users", async (c) => {
  const supabase = getSupabase();

  // Use the admin API to search user_metadata
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });

  if (error) {
    throw new ApiError("USER_FETCH_FAILED", "Failed to fetch users", 500);
  }

  const superadmins = (data?.users ?? [])
    .filter((u) => u.user_metadata?.["is_superadmin"] === true)
    .map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at,
    }));

  return c.json({ success: true, data: superadmins });
});

export { adminRoutes };
