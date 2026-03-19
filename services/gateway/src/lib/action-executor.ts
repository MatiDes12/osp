import { getSupabase } from "./supabase.js";
import { publishEvent } from "./event-publisher.js";
import { createLogger } from "./logger.js";
import { sendEmail } from "./email.js";
import { alertEmailTemplate } from "./email-templates.js";
import { getRecordingService } from "../services/recording.service.js";
import type { RuleAction } from "@osp/shared";
import type { MatchedRule } from "./rule-evaluator.js";

const logger = createLogger("action-executor");

/**
 * Event shape passed to action execution.
 */
interface EventContext {
  readonly id: string;
  readonly cameraId: string;
  readonly cameraName: string;
  readonly type: string;
  readonly severity: string;
  readonly intensity: number;
  readonly detectedAt: string;
  readonly metadata: Record<string, unknown>;
  readonly tenantId: string;
}

/**
 * Executes all actions for a matched rule.
 * Each action is executed independently so one failure doesn't block others.
 */
export async function executeActions(
  matchedRule: MatchedRule,
  event: EventContext,
  tenantId: string,
): Promise<void> {
  const actions = matchedRule.actions as readonly RuleAction[];
  if (!Array.isArray(actions) || actions.length === 0) return;

  const supabase = getSupabase();

  // Update the rule's last_triggered_at timestamp
  await supabase
    .from("alert_rules")
    .update({
      last_triggered_at: new Date().toISOString(),
    })
    .eq("id", matchedRule.ruleId);

  // Publish rule.triggered event to WebSocket via Redis
  const ruleTriggeredEvent = {
    id: crypto.randomUUID(),
    cameraId: event.cameraId,
    cameraName: event.cameraName,
    zoneId: null,
    zoneName: null,
    tenantId,
    type: "custom" as const,
    severity: event.severity,
    detectedAt: new Date().toISOString(),
    metadata: {
      ruleTriggered: true,
      ruleId: matchedRule.ruleId,
      ruleName: matchedRule.ruleName,
      sourceEventId: event.id,
      sourceEventType: event.type,
    },
    snapshotUrl: null,
    clipUrl: null,
    intensity: event.intensity,
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
    createdAt: new Date().toISOString(),
  };

  await publishEvent(tenantId, ruleTriggeredEvent).catch((err) => {
    logger.error("Failed to publish rule.triggered event", {
      ruleId: matchedRule.ruleId,
      error: String(err),
    });
  });

  for (const action of actions) {
    try {
      await executeAction(action, matchedRule, event, tenantId);
    } catch (err) {
      logger.error("Action execution failed", {
        ruleId: matchedRule.ruleId,
        actionType: action.type,
        error: String(err),
      });
    }
  }
}

async function executeAction(
  action: RuleAction,
  matchedRule: MatchedRule,
  event: EventContext,
  tenantId: string,
): Promise<void> {
  switch (action.type) {
    case "push_notification":
      await handlePushNotification(action, matchedRule, event, tenantId);
      break;

    case "email":
      await handleEmail(action, matchedRule, event, tenantId);
      break;

    case "webhook":
      await handleWebhook(action, matchedRule, event, tenantId);
      break;

    case "start_recording":
      await handleStartRecording(action, event, tenantId);
      break;

    case "extension_hook":
      logger.info("Extension hook action (not implemented)", {
        ruleId: matchedRule.ruleId,
        actionType: action.type,
      });
      break;

    default:
      logger.warn("Unknown action type", {
        ruleId: matchedRule.ruleId,
        actionType: action.type,
      });
  }
}

/**
 * Creates a notification in the database for all users of the tenant.
 */
async function handlePushNotification(
  action: RuleAction,
  matchedRule: MatchedRule,
  event: EventContext,
  tenantId: string,
): Promise<void> {
  const supabase = getSupabase();

  const title = interpolateTemplate(
    (action.config["title"] as string) ?? `Rule triggered: ${matchedRule.ruleName}`,
    event,
  );
  const body = interpolateTemplate(
    (action.config["body"] as string) ?? `${event.type} detected on ${event.cameraName}`,
    event,
  );

  // Get all users in the tenant
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId);

  if (usersError || !users || users.length === 0) {
    logger.warn("No users found for notification", { tenantId });
    return;
  }

  // Create a notification for each user
  const notifications = users.map((user) => ({
    user_id: user.id as string,
    event_id: event.id,
    tenant_id: tenantId,
    channel: "push" as const,
    status: "pending" as const,
    title,
    body,
    payload: {
      ruleId: matchedRule.ruleId,
      ruleName: matchedRule.ruleName,
      eventType: event.type,
      cameraId: event.cameraId,
      cameraName: event.cameraName,
      severity: event.severity,
    },
  }));

  const { error: insertError } = await supabase
    .from("notifications")
    .insert(notifications);

  if (insertError) {
    logger.error("Failed to insert notifications", {
      error: String(insertError),
      ruleId: matchedRule.ruleId,
    });
    return;
  }

  logger.info("Push notifications created", {
    ruleId: matchedRule.ruleId,
    count: String(notifications.length),
  });
}

/**
 * Sends an alert email to the configured recipients (or all tenant users).
 */
async function handleEmail(
  action: RuleAction,
  matchedRule: MatchedRule,
  event: EventContext,
  tenantId: string,
): Promise<void> {
  let recipients = (action.config["recipients"] as string[]) ?? [];

  // If no explicit recipients, fall back to all tenant user emails.
  if (recipients.length === 0) {
    const supabase = getSupabase();
    const { data: users } = await supabase
      .from("users")
      .select("email")
      .eq("tenant_id", tenantId);

    recipients = (users ?? [])
      .map((u) => u.email as string)
      .filter(Boolean);
  }

  if (recipients.length === 0) {
    logger.warn("No email recipients for alert", {
      ruleId: matchedRule.ruleId,
      tenantId,
    });
    return;
  }

  const subject = interpolateTemplate(
    (action.config["subject"] as string) ?? `Alert: ${matchedRule.ruleName}`,
    event,
  );

  const snapshotUrl = (event.metadata["snapshotUrl"] as string) ?? null;

  const html = alertEmailTemplate({
    eventType: event.type,
    cameraName: event.cameraName,
    timestamp: event.detectedAt,
    snapshotUrl,
    ruleName: matchedRule.ruleName,
    severity: event.severity,
  });

  await sendEmail({ to: recipients, subject, html });

  logger.info("Alert email sent", {
    ruleId: matchedRule.ruleId,
    recipientCount: String(recipients.length),
  });
}

/**
 * Makes an HTTP POST to the configured webhook URL with event data.
 */
async function handleWebhook(
  action: RuleAction,
  matchedRule: MatchedRule,
  event: EventContext,
  tenantId: string,
): Promise<void> {
  const url = action.config["url"] as string | undefined;
  if (!url) {
    logger.warn("Webhook action has no URL configured", {
      ruleId: matchedRule.ruleId,
    });
    return;
  }

  const payload = {
    ruleId: matchedRule.ruleId,
    ruleName: matchedRule.ruleName,
    event: {
      id: event.id,
      type: event.type,
      severity: event.severity,
      cameraId: event.cameraId,
      cameraName: event.cameraName,
      intensity: event.intensity,
      detectedAt: event.detectedAt,
      metadata: event.metadata,
    },
    tenantId,
    triggeredAt: new Date().toISOString(),
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "OSP-Rules-Engine/1.0",
  };

  // Allow custom headers from config
  const customHeaders = action.config["headers"] as Record<string, string> | undefined;
  if (customHeaders && typeof customHeaders === "object") {
    for (const [key, value] of Object.entries(customHeaders)) {
      if (typeof value === "string") {
        headers[key] = value;
      }
    }
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    logger.info("Webhook delivered", {
      ruleId: matchedRule.ruleId,
      url,
      status: String(response.status),
    });
  } catch (err) {
    logger.error("Webhook delivery failed", {
      ruleId: matchedRule.ruleId,
      url,
      error: String(err),
    });
  }
}

/**
 * Triggers a recording for the camera that generated the event.
 * Uses the RecordingService to actually start go2rtc recording.
 */
async function handleStartRecording(
  action: RuleAction,
  event: EventContext,
  tenantId: string,
): Promise<void> {
  const durationSec = (action.config["duration_sec"] as number) ?? (action.config["duration"] as number) ?? 60;
  const durationMs = durationSec * 1000;

  try {
    const recordingService = getRecordingService();
    const recordingId = await recordingService.startTimedRecording(
      event.cameraId,
      tenantId,
      "rule",
      durationMs,
    );

    logger.info("Recording started via rule", {
      recordingId,
      cameraId: event.cameraId,
      durationSec: String(durationSec),
      eventId: event.id,
      eventType: event.type,
    });

    // Update recording metadata with rule info
    const supabase = getSupabase();
    await supabase
      .from("recordings")
      .update({
        metadata: {
          triggeredBy: "rule_engine",
          eventId: event.id,
          eventType: event.type,
          durationSec,
        },
      })
      .eq("id", recordingId);
  } catch (err) {
    logger.error("Failed to start recording", {
      cameraId: event.cameraId,
      error: String(err),
    });
    throw err; // Re-throw to let executeActions handle it
  }
}

/**
 * Simple template interpolation for notification text.
 * Replaces {{field}} placeholders with event values.
 */
function interpolateTemplate(
  template: string,
  event: EventContext,
): string {
  const replacements: Record<string, string> = {
    cameraName: event.cameraName,
    cameraId: event.cameraId,
    eventType: event.type,
    severity: event.severity,
    intensity: String(event.intensity),
    detectedAt: event.detectedAt,
    eventId: event.id,
  };

  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => replacements[key] ?? `{{${key}}}`,
  );
}
