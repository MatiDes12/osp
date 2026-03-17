import { z } from "zod";
import { EventTypeSchema } from "./event.schema.js";

const ConditionOperatorSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "not_contains",
  "in",
]);

const ConditionLeafSchema = z.object({
  field: z.string().min(1).max(100),
  operator: ConditionOperatorSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
  ]),
});

type ConditionNodeInput = {
  operator: "AND" | "OR";
  children: (
    | z.infer<typeof ConditionLeafSchema>
    | ConditionNodeInput
  )[];
};

const ConditionNodeSchema: z.ZodType<ConditionNodeInput> = z.lazy(() =>
  z.object({
    operator: z.enum(["AND", "OR"]),
    children: z
      .array(z.union([ConditionLeafSchema, ConditionNodeSchema]))
      .min(1)
      .max(20),
  }),
);

const RuleActionSchema = z.object({
  type: z.enum([
    "push_notification",
    "email",
    "webhook",
    "start_recording",
    "extension_hook",
  ]),
  config: z.record(z.unknown()),
});

const RuleScheduleSchema = z.object({
  timezone: z.string().min(1),
  activePeriods: z.array(
    z.object({
      days: z.array(
        z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
      ),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
    }),
  ),
});

export const CreateRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  triggerEvent: EventTypeSchema,
  conditions: ConditionNodeSchema,
  actions: z.array(RuleActionSchema).min(1).max(10),
  cameraIds: z.array(z.string().uuid()).optional(),
  zoneIds: z.array(z.string().uuid()).optional(),
  schedule: RuleScheduleSchema.optional(),
  cooldownSec: z.number().int().min(0).max(86400).default(60),
  enabled: z.boolean().default(true),
});

export const UpdateRuleSchema = CreateRuleSchema.partial();

export type CreateRuleInput = z.infer<typeof CreateRuleSchema>;
export type UpdateRuleInput = z.infer<typeof UpdateRuleSchema>;
