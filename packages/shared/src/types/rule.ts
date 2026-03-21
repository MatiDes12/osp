import type { EventType } from "./event.js";

export interface AlertRule {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  triggerEvent: EventType;
  conditions: ConditionNode;
  actions: RuleAction[];
  cameraIds: string[] | null;
  zoneIds: string[] | null;
  schedule: RuleSchedule | null;
  cooldownSec: number;
  enabled: boolean;
  priority: number;
  lastTriggeredAt: string | null;
  triggerCount24h: number;
  createdAt: string;
  updatedAt: string;
}

export type ConditionOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "not_contains"
  | "in";

export interface ConditionLeaf {
  field: string;
  operator: ConditionOperator;
  value: string | number | boolean | string[];
}

export interface ConditionNode {
  operator: "AND" | "OR";
  children: (ConditionLeaf | ConditionNode)[];
}

export type RuleActionType =
  | "push_notification"
  | "email"
  | "webhook"
  | "start_recording"
  | "extension_hook";

export interface RuleAction {
  type: RuleActionType;
  config: Record<string, unknown>;
}

export interface WebhookDeliveryAttempt {
  id: string;
  tenantId: string;
  ruleId: string;
  eventId: string | null;
  url: string;
  requestPayload: Record<string, unknown>;
  requestHeaders: Record<string, string>;
  attemptNumber: number;
  deliveryStatus: "delivered" | "failed";
  responseStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface RuleSchedule {
  timezone: string;
  activePeriods: {
    days: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[];
    start: string;
    end: string;
  }[];
}
