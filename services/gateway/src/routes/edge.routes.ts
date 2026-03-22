// ---------------------------------------------------------------------------
//  Edge Agent routes
//  These endpoints are called by on-premise OSP Edge Agent binaries.
//
//  Agent-facing (authenticated via API key in Authorization header):
//    POST /api/v1/edge/agents/register          register / upsert an agent
//    POST /api/v1/edge/agents/:agentId/heartbeat update status + stats
//
//  Dashboard-facing (user JWT required):
//    GET  /api/v1/edge/agents                   list all agents for tenant
//    GET  /api/v1/edge/agents/:agentId          get single agent
//    PATCH /api/v1/edge/agents/:agentId         update name / location
//    DELETE /api/v1/edge/agents/:agentId        remove agent record
// ---------------------------------------------------------------------------

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { createSuccessResponse } from "@osp/shared";
import { createLogger } from "../lib/logger.js";
import { z } from "zod";

const logger = createLogger("edge-routes");

export const edgeRoutes = new Hono<Env>();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve tenantId either from JWT context or X-Tenant-Id header. */
function resolveTenantId(c: Context<Env>): string | null {
  return c.get("tenantId") ?? c.req.header("X-Tenant-Id") ?? null;
}

// ── Register / upsert agent ───────────────────────────────────────────────────
// Called by the edge agent on startup to announce itself to the cloud.

const RegisterSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  location: z.string().optional(),
  version: z.string().optional(),
});

edgeRoutes.post("/agents/register", async (c) => {
  const tenantId = resolveTenantId(c);
  if (!tenantId) {
    throw new ApiError(
      "AUTH_MISSING",
      "X-Tenant-Id header or JWT required",
      401,
    );
  }

  const body = await c.req.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  });
  const input = RegisterSchema.parse(body);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("edge_agents")
    .upsert(
      {
        tenant_id: tenantId,
        agent_id: input.agentId,
        name: input.name,
        location: input.location ?? null,
        version: input.version ?? null,
        status: "online",
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,agent_id", ignoreDuplicates: false },
    )
    .select()
    .single();

  if (error) {
    logger.error("register agent failed", { error, agentId: input.agentId });
    throw new ApiError("INTERNAL_ERROR", "Failed to register edge agent", 500);
  }

  logger.info("edge agent registered", { agentId: input.agentId, tenantId });
  return c.json(createSuccessResponse(data), 201);
});

// ── Heartbeat ─────────────────────────────────────────────────────────────────
// Edge agent POSTs here every sync interval to report status and queue depth.

const HeartbeatSchema = z.object({
  status: z.enum(["online", "offline", "error"]).default("online"),
  pendingEvents: z.number().int().min(0).default(0),
  syncedEvents: z.number().int().min(0).default(0),
  camerasActive: z.number().int().min(0).default(0),
  timestamp: z.string().optional(),
  go2rtcPublicUrl: z.string().url().optional().or(z.literal("")),
});

edgeRoutes.post("/agents/:agentId/heartbeat", async (c) => {
  const tenantId = resolveTenantId(c);
  if (!tenantId) {
    throw new ApiError(
      "AUTH_MISSING",
      "X-Tenant-Id header or JWT required",
      401,
    );
  }

  const { agentId } = c.req.param();

  const body = await c.req.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  });
  const input = HeartbeatSchema.parse(body);

  const supabase = getSupabase();
  const updatePayload: Record<string, unknown> = {
    status: input.status,
    pending_events: input.pendingEvents,
    synced_events: input.syncedEvents,
    cameras_active: input.camerasActive,
    last_seen_at: new Date().toISOString(),
  };
  // Only update go2rtc_url when the agent actually sends one (don't clear existing value)
  if (input.go2rtcPublicUrl) {
    updatePayload.go2rtc_url = input.go2rtcPublicUrl;
  }

  const { error } = await supabase
    .from("edge_agents")
    .update(updatePayload)
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId);

  if (error) {
    logger.warn("heartbeat update failed", { error, agentId });
    // Return 200 anyway — don't break agent sync loops on DB hiccups.
  }

  return c.json(createSuccessResponse({ received: true }));
});

// ── Agent: fetch cameras for local go2rtc provisioning ────────────────────────
// Called by the edge agent each sync cycle to push cameras into local go2rtc.
// Auth: X-Tenant-Id header (same pattern as register/heartbeat).

edgeRoutes.get("/cameras", async (c) => {
  const tenantId = resolveTenantId(c);
  if (!tenantId) {
    throw new ApiError("AUTH_MISSING", "X-Tenant-Id header required", 401);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("cameras")
    .select("id, connection_uri")
    .eq("tenant_id", tenantId)
    .neq("status", "disabled")
    .not("connection_uri", "is", null);

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch cameras", 500);
  }

  return c.json(createSuccessResponse(data ?? []));
});

// ── Agent: report go2rtc stream statuses back to gateway ──────────────────────
// Auth: X-Tenant-Id header.

const CameraStatusSchema = z.object({
  statuses: z.array(
    z.object({
      cameraId: z.string().min(1),
      status: z.enum(["online", "connecting", "offline"]),
    }),
  ),
});

edgeRoutes.post("/cameras/status", async (c) => {
  const tenantId = resolveTenantId(c);
  if (!tenantId) {
    throw new ApiError("AUTH_MISSING", "X-Tenant-Id header required", 401);
  }

  const body = await c.req.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  });
  const input = CameraStatusSchema.parse(body);

  const supabase = getSupabase();
  await Promise.all(
    input.statuses.map(({ cameraId, status }) =>
      supabase
        .from("cameras")
        .update({ status })
        .eq("id", cameraId)
        .eq("tenant_id", tenantId)
        .neq("status", "disabled"),
    ),
  );

  return c.json(createSuccessResponse({ updated: input.statuses.length }));
});

// ── List agents ───────────────────────────────────────────────────────────────

edgeRoutes.get("/agents", requireAuth(), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("edge_agents")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch edge agents", 500);
  }

  return c.json(createSuccessResponse(data ?? []));
});

// ── Get single agent ──────────────────────────────────────────────────────────

edgeRoutes.get("/agents/:agentId", requireAuth(), async (c) => {
  const tenantId = c.get("tenantId");
  const { agentId } = c.req.param();
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("edge_agents")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId)
    .single();

  if (error || !data) {
    throw new ApiError("NOT_FOUND", "Edge agent not found", 404);
  }

  return c.json(createSuccessResponse(data));
});

// ── Update agent metadata ─────────────────────────────────────────────────────

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  location: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

edgeRoutes.patch("/agents/:agentId", requireAuth(), async (c) => {
  const tenantId = c.get("tenantId");
  const { agentId } = c.req.param();

  const body = await c.req.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  });
  const input = UpdateSchema.parse(body);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("edge_agents")
    .update(input)
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId)
    .select()
    .single();

  if (error || !data) {
    throw new ApiError("NOT_FOUND", "Edge agent not found", 404);
  }

  return c.json(createSuccessResponse(data));
});

// ── Delete agent ──────────────────────────────────────────────────────────────

edgeRoutes.delete("/agents/:agentId", requireAuth(), async (c) => {
  const tenantId = c.get("tenantId");
  const { agentId } = c.req.param();
  const supabase = getSupabase();

  const { error } = await supabase
    .from("edge_agents")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId);

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to delete edge agent", 500);
  }

  return c.json(createSuccessResponse({ deleted: true }));
});

// ── Go2rtc health proxy ───────────────────────────────────────────────────────
// Fetches /api/streams from the active edge agent's go2rtc URL server-side
// so the browser avoids CORS issues when probing the cloudflare tunnel.

edgeRoutes.get("/agents/go2rtc-status", requireAuth(), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const { data } = await supabase
    .from("edge_agents")
    .select("go2rtc_url")
    .eq("tenant_id", tenantId)
    .eq("status", "online")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .single()
    .catch(() => ({ data: null }));

  const go2rtcUrl = (data as { go2rtc_url?: string } | null)?.go2rtc_url;
  if (!go2rtcUrl) {
    return c.json(createSuccessResponse({ status: "not_configured", streams: 0 }));
  }

  const start = Date.now();
  try {
    const resp = await fetch(`${go2rtcUrl}/api/streams`, {
      signal: AbortSignal.timeout(4000),
    });
    const latency = Date.now() - start;
    if (!resp.ok) {
      return c.json(createSuccessResponse({ status: "down", latency_ms: latency, error: `HTTP ${resp.status}` }));
    }
    const streams = (await resp.json()) as Record<string, unknown>;
    return c.json(createSuccessResponse({ status: "up", latency_ms: latency, streams: Object.keys(streams).length }));
  } catch (err) {
    return c.json(createSuccessResponse({
      status: "down",
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }));
  }
});

