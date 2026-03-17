import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { evaluateRules } from "../lib/rule-evaluator.js";
import { CreateRuleSchema, UpdateRuleSchema } from "@osp/shared";
import { createSuccessResponse } from "@osp/shared";

export const ruleRoutes = new Hono<Env>();

// List alert rules
ruleRoutes.get("/", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const { data: rules, error } = await supabase
    .from("alert_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch rules", 500);
  }

  return c.json(createSuccessResponse(rules ?? []));
});

// Create rule
ruleRoutes.post("/", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const input = CreateRuleSchema.parse(body);
  const supabase = getSupabase();

  const { data: rule, error } = await supabase
    .from("alert_rules")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      description: input.description ?? null,
      trigger_event: input.triggerEvent,
      conditions: input.conditions,
      actions: input.actions,
      camera_ids: input.cameraIds ?? [],
      zone_ids: input.zoneIds ?? [],
      schedule: input.schedule ?? null,
      cooldown_sec: input.cooldownSec,
      enabled: input.enabled,
    })
    .select()
    .single();

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to create rule", 500);
  }

  return c.json(createSuccessResponse(rule), 201);
});

// Get rule by ID
ruleRoutes.get("/:id", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const ruleId = c.req.param("id");
  const supabase = getSupabase();

  const { data: rule, error } = await supabase
    .from("alert_rules")
    .select("*")
    .eq("id", ruleId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !rule) {
    throw new ApiError("RULE_NOT_FOUND", "Rule not found", 404);
  }

  return c.json(createSuccessResponse(rule));
});

// Update rule
ruleRoutes.patch("/:id", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const ruleId = c.req.param("id");
  const body = await c.req.json();
  const input = UpdateRuleSchema.parse(body);
  const supabase = getSupabase();

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates["name"] = input.name;
  if (input.description !== undefined) updates["description"] = input.description;
  if (input.triggerEvent !== undefined) updates["trigger_event"] = input.triggerEvent;
  if (input.conditions !== undefined) updates["conditions"] = input.conditions;
  if (input.actions !== undefined) updates["actions"] = input.actions;
  if (input.cameraIds !== undefined) updates["camera_ids"] = input.cameraIds;
  if (input.zoneIds !== undefined) updates["zone_ids"] = input.zoneIds;
  if (input.schedule !== undefined) updates["schedule"] = input.schedule;
  if (input.cooldownSec !== undefined) updates["cooldown_sec"] = input.cooldownSec;
  if (input.enabled !== undefined) updates["enabled"] = input.enabled;
  updates["updated_at"] = new Date().toISOString();

  const { data: rule, error } = await supabase
    .from("alert_rules")
    .update(updates)
    .eq("id", ruleId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error || !rule) {
    throw new ApiError("RULE_NOT_FOUND", "Rule not found", 404);
  }

  return c.json(createSuccessResponse(rule));
});

// Delete rule
ruleRoutes.delete("/:id", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const ruleId = c.req.param("id");
  const supabase = getSupabase();

  const { error } = await supabase
    .from("alert_rules")
    .delete()
    .eq("id", ruleId)
    .eq("tenant_id", tenantId);

  if (error) {
    throw new ApiError("RULE_NOT_FOUND", "Rule not found", 404);
  }

  return c.json(createSuccessResponse({ deleted: true }));
});

// Test rule against recent events (placeholder)
ruleRoutes.post("/:id/test", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const ruleId = c.req.param("id");
  const supabase = getSupabase();

  // Verify rule exists
  const { data: rule, error } = await supabase
    .from("alert_rules")
    .select("*")
    .eq("id", ruleId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !rule) {
    throw new ApiError("RULE_NOT_FOUND", "Rule not found", 404);
  }

  // Fetch recent events for the rule's trigger type
  const { data: recentEvents } = await supabase
    .from("events")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("type", rule.trigger_event)
    .order("created_at", { ascending: false })
    .limit(50);

  // Convert DB rows to the shape the evaluator expects
  const eventsForEval = (recentEvents ?? []).map((e) => ({
    id: e.id as string,
    cameraId: e.camera_id as string,
    cameraName: "Unknown",
    type: e.type as string,
    severity: e.severity as string,
    intensity: (e.intensity as number) ?? 50,
    detectedAt: e.detected_at as string,
    metadata: (e.metadata as Record<string, unknown>) ?? {},
    zoneId: (e.zone_id as string | null) ?? null,
    zoneName: null,
    tenantId,
    snapshotUrl: null,
    clipUrl: null,
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
    createdAt: e.created_at as string,
  }));

  // Run the actual rule evaluator against each event
  const matchedEvents = eventsForEval.filter((evt) => {
    const matches = evaluateRules(evt, [rule]);
    return matches.length > 0;
  });

  return c.json(
    createSuccessResponse({
      ruleId,
      ruleName: rule.name as string,
      testedAgainst: eventsForEval.length,
      matched: matchedEvents.length,
      sampleMatches: matchedEvents.slice(0, 5).map((e) => ({
        eventId: e.id,
        type: e.type,
        severity: e.severity,
        cameraId: e.cameraId,
        createdAt: e.createdAt,
      })),
    }),
  );
});
