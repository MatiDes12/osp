import type { ConditionLeaf, ConditionNode } from "@osp/shared";
import { createLogger } from "./logger.js";

const logger = createLogger("rule-evaluator");

/**
 * Represents the event data shape used for rule evaluation.
 */
interface EventForEval {
  readonly id: string;
  readonly cameraId: string;
  readonly cameraName: string;
  readonly type: string;
  readonly severity: string;
  readonly intensity: number;
  readonly detectedAt: string;
  readonly metadata: Record<string, unknown>;
  readonly zoneId: string | null;
  readonly zoneName: string | null;
}

/**
 * Represents a rule from the alert_rules table (DB row shape).
 */
interface RuleRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly name: string;
  readonly trigger_event: string;
  readonly conditions: ConditionNode | Record<string, unknown>;
  readonly actions: unknown;
  readonly camera_ids: string[] | null;
  readonly zone_ids: string[] | null;
  readonly cooldown_sec: number;
  readonly enabled: boolean;
  readonly last_triggered_at: string | null;
}

export interface MatchedRule {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly actions: unknown;
  readonly row: RuleRow;
}

/**
 * Evaluates all enabled rules against a newly created event.
 * Returns the list of rules whose conditions match the event.
 */
export function evaluateRules(
  event: EventForEval,
  rules: readonly RuleRow[],
): readonly MatchedRule[] {
  const matched: MatchedRule[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    // 1. Check trigger event type matches
    if (rule.trigger_event !== event.type) continue;

    // 2. Check camera scope (null or empty = all cameras)
    if (
      rule.camera_ids !== null &&
      rule.camera_ids.length > 0 &&
      !rule.camera_ids.includes(event.cameraId)
    ) {
      continue;
    }

    // 3. Check zone scope (null or empty = all zones)
    if (
      rule.zone_ids !== null &&
      rule.zone_ids.length > 0 &&
      event.zoneId !== null &&
      !rule.zone_ids.includes(event.zoneId)
    ) {
      continue;
    }

    // 4. Check cooldown period
    if (rule.last_triggered_at && rule.cooldown_sec > 0) {
      const lastTriggered = new Date(rule.last_triggered_at).getTime();
      const cooldownMs = rule.cooldown_sec * 1000;
      if (Date.now() - lastTriggered < cooldownMs) {
        logger.debug("Rule skipped due to cooldown", {
          ruleId: rule.id,
          ruleName: rule.name,
        });
        continue;
      }
    }

    // 5. Evaluate conditions
    const conditions = rule.conditions as ConditionNode;
    if (conditions && conditions.children && conditions.children.length > 0) {
      if (!evaluateConditionNode(conditions, event)) {
        continue;
      }
    }

    matched.push({
      ruleId: rule.id,
      ruleName: rule.name,
      actions: rule.actions,
      row: rule,
    });
  }

  return matched;
}

/**
 * Recursively evaluates a condition node (AND/OR tree) against event data.
 */
function evaluateConditionNode(
  node: ConditionNode,
  event: EventForEval,
): boolean {
  if (!node.children || node.children.length === 0) return true;

  if (node.operator === "AND") {
    return node.children.every((child) => evaluateChild(child, event));
  }

  // OR
  return node.children.some((child) => evaluateChild(child, event));
}

function evaluateChild(
  child: ConditionLeaf | ConditionNode,
  event: EventForEval,
): boolean {
  if ("operator" in child && "children" in child) {
    return evaluateConditionNode(child as ConditionNode, event);
  }
  return evaluateConditionLeaf(child as ConditionLeaf, event);
}

/**
 * Evaluates a single condition leaf against the event.
 * Resolves field paths like "intensity", "severity", "data.confidence", etc.
 */
function evaluateConditionLeaf(
  leaf: ConditionLeaf,
  event: EventForEval,
): boolean {
  const fieldValue = resolveField(leaf.field, event);
  const conditionValue = leaf.value;

  switch (leaf.operator) {
    case "eq":
      return (
        fieldValue === conditionValue ||
        String(fieldValue) === String(conditionValue)
      );
    case "neq":
      return (
        fieldValue !== conditionValue &&
        String(fieldValue) !== String(conditionValue)
      );
    case "gt":
      return toNumber(fieldValue) > toNumber(conditionValue);
    case "gte":
      return toNumber(fieldValue) >= toNumber(conditionValue);
    case "lt":
      return toNumber(fieldValue) < toNumber(conditionValue);
    case "lte":
      return toNumber(fieldValue) <= toNumber(conditionValue);
    case "contains":
      return String(fieldValue).includes(String(conditionValue));
    case "not_contains":
      return !String(fieldValue).includes(String(conditionValue));
    case "in":
      if (Array.isArray(conditionValue)) {
        return conditionValue.includes(String(fieldValue));
      }
      return String(conditionValue).split(",").includes(String(fieldValue));
    default:
      return false;
  }
}

/**
 * Resolves a field path against the event object.
 * Supports dotted paths like "metadata.confidence" or shorthand like "intensity".
 */
function resolveField(field: string, event: EventForEval): unknown {
  // Direct fields on the event
  const directFields: Record<string, unknown> = {
    intensity: event.intensity,
    severity: event.severity,
    type: event.type,
    cameraId: event.cameraId,
    cameraName: event.cameraName,
    zoneId: event.zoneId,
    zoneName: event.zoneName,
    // Common aliases
    confidence: event.metadata["confidence"] ?? event.intensity,
    object_count: event.metadata["object_count"] ?? 0,
    zone_name: event.zoneName,
    time_of_day: new Date(event.detectedAt).getHours(),
  };

  if (field in directFields) {
    return directFields[field];
  }

  // Dotted path for metadata: "data.X" or "metadata.X"
  if (field.startsWith("data.") || field.startsWith("metadata.")) {
    const key = field.split(".").slice(1).join(".");
    return getNestedValue(event.metadata, key);
  }

  // Fallback: try metadata directly
  return event.metadata[field] ?? null;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return null;
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  return current;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return isNaN(parsed) ? 0 : parsed;
}
