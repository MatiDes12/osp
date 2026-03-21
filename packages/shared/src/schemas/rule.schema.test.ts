import { describe, it, expect } from "vitest";
import { CreateRuleSchema } from "./rule.schema.js";

describe("CreateRuleSchema", () => {
  const validRule = {
    name: "Motion Alert",
    triggerEvent: "motion" as const,
    conditions: {
      operator: "AND" as const,
      children: [{ field: "confidence", operator: "gte" as const, value: 0.8 }],
    },
    actions: [
      {
        type: "push_notification" as const,
        config: { title: "Motion detected" },
      },
    ],
  };

  it("accepts a valid rule with simple condition", () => {
    const result = CreateRuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
  });

  it("applies defaults for cooldownSec and enabled", () => {
    const result = CreateRuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cooldownSec).toBe(60);
      expect(result.data.enabled).toBe(true);
    }
  });

  it("accepts nested AND/OR conditions", () => {
    const nested = {
      ...validRule,
      conditions: {
        operator: "OR" as const,
        children: [
          {
            operator: "AND" as const,
            children: [
              { field: "confidence", operator: "gte" as const, value: 0.9 },
              {
                field: "zone",
                operator: "eq" as const,
                value: "entrance",
              },
            ],
          },
          {
            field: "objectType",
            operator: "in" as const,
            value: ["person", "vehicle"],
          },
        ],
      },
    };
    const result = CreateRuleSchema.safeParse(nested);
    expect(result.success).toBe(true);
  });

  it("rejects invalid condition operator", () => {
    const result = CreateRuleSchema.safeParse({
      ...validRule,
      conditions: {
        operator: "AND",
        children: [{ field: "confidence", operator: "like", value: "test" }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid logical operator in condition node", () => {
    const result = CreateRuleSchema.safeParse({
      ...validRule,
      conditions: {
        operator: "XOR",
        children: [{ field: "confidence", operator: "eq", value: 1 }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty children array", () => {
    const result = CreateRuleSchema.safeParse({
      ...validRule,
      conditions: {
        operator: "AND",
        children: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const { name: _, ...noName } = validRule;
    const result = CreateRuleSchema.safeParse(noName);
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = CreateRuleSchema.safeParse({ ...validRule, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 100 chars", () => {
    const result = CreateRuleSchema.safeParse({
      ...validRule,
      name: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid triggerEvent", () => {
    const result = CreateRuleSchema.safeParse({
      ...validRule,
      triggerEvent: "explosion",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty actions array", () => {
    const result = CreateRuleSchema.safeParse({
      ...validRule,
      actions: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects actions exceeding max of 10", () => {
    const manyActions = Array.from({ length: 11 }, () => ({
      type: "email" as const,
      config: { to: "test@example.com" },
    }));
    const result = CreateRuleSchema.safeParse({
      ...validRule,
      actions: manyActions,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid action type", () => {
    const result = CreateRuleSchema.safeParse({
      ...validRule,
      actions: [{ type: "sms", config: {} }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid action types", () => {
    const actionTypes = [
      "push_notification",
      "email",
      "webhook",
      "start_recording",
      "extension_hook",
    ] as const;
    for (const type of actionTypes) {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        actions: [{ type, config: {} }],
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts optional cameraIds with valid UUIDs", () => {
    const result = CreateRuleSchema.safeParse({
      ...validRule,
      cameraIds: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects cameraIds with invalid UUIDs", () => {
    const result = CreateRuleSchema.safeParse({
      ...validRule,
      cameraIds: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional description", () => {
    const result = CreateRuleSchema.safeParse({
      ...validRule,
      description: "Triggers when motion is detected at the entrance",
    });
    expect(result.success).toBe(true);
  });

  it("rejects description exceeding 500 chars", () => {
    const result = CreateRuleSchema.safeParse({
      ...validRule,
      description: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  describe("schedule validation", () => {
    it("accepts valid schedule", () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        schedule: {
          timezone: "America/New_York",
          activePeriods: [
            { days: ["mon", "tue", "wed"], start: "09:00", end: "17:00" },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects schedule with empty timezone", () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        schedule: {
          timezone: "",
          activePeriods: [{ days: ["mon"], start: "09:00", end: "17:00" }],
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects schedule with invalid time format", () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        schedule: {
          timezone: "UTC",
          activePeriods: [{ days: ["mon"], start: "9am", end: "5pm" }],
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects schedule with invalid day", () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        schedule: {
          timezone: "UTC",
          activePeriods: [{ days: ["monday"], start: "09:00", end: "17:00" }],
        },
      });
      expect(result.success).toBe(false);
    });

    it("accepts schedule with all days of the week", () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        schedule: {
          timezone: "Europe/London",
          activePeriods: [
            {
              days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
              start: "00:00",
              end: "23:59",
            },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts multiple active periods", () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        schedule: {
          timezone: "UTC",
          activePeriods: [
            { days: ["mon", "tue"], start: "08:00", end: "12:00" },
            { days: ["wed", "thu"], start: "14:00", end: "18:00" },
          ],
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("cooldownSec", () => {
    it("accepts 0 as minimum", () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        cooldownSec: 0,
      });
      expect(result.success).toBe(true);
    });

    it("accepts 86400 as maximum", () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        cooldownSec: 86400,
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative cooldown", () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        cooldownSec: -1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects cooldown exceeding 86400", () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        cooldownSec: 86401,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("condition value types", () => {
    it("accepts string value", () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        conditions: {
          operator: "AND",
          children: [{ field: "label", operator: "eq", value: "person" }],
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts number value", () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        conditions: {
          operator: "AND",
          children: [{ field: "score", operator: "gt", value: 42 }],
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts boolean value", () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        conditions: {
          operator: "AND",
          children: [{ field: "isNew", operator: "eq", value: true }],
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts array of strings value", () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        conditions: {
          operator: "AND",
          children: [
            {
              field: "tags",
              operator: "in",
              value: ["alert", "urgent"],
            },
          ],
        },
      });
      expect(result.success).toBe(true);
    });
  });
});
