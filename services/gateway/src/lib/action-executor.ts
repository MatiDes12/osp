import { getSupabase } from "./supabase.js";
import { publishEvent } from "./event-publisher.js";
import { createLogger } from "./logger.js";
import { sendEmail } from "./email.js";
import { alertEmailTemplate } from "./email-templates.js";
import { getRecordingService } from "../services/recording.service.js";
import { getExtensionRunner } from "../services/extension-runner.js";
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
      await handleExtensionHook(action, matchedRule, event);
      break;

    default:
      logger.warn("Unknown action type", {
        ruleId: matchedRule.ruleId,
        actionType: action.type,
      });
  }
}

async function handleExtensionHook(
  action: RuleAction,
  matchedRule: MatchedRule,
  event: EventContext,
): Promise<void> {
  const extensionId =
    (action.config["extensionId"] as string | undefined) ??
    (action.config["installedExtensionId"] as string | undefined) ??
    "";
  if (!extensionId) {
    logger.warn("Extension hook action missing extensionId", {
      ruleId: matchedRule.ruleId,
    });
    return;
  }

  const hookName =
    (action.config["hookName"] as string | undefined) ?? "onRuleTriggered";
  const timeoutMs = Number(
    (action.config["timeoutMs"] as number | string | undefined) ?? 5000,
  );

  const runner = getExtensionRunner();
  const result = await runner.executeHook(
    extensionId,
    hookName,
    {
      rule: {
        id: matchedRule.ruleId,
        name: matchedRule.ruleName,
      },
      event,
      triggeredAt: new Date().toISOString(),
    },
    action.config,
    timeoutMs,
  );

  if (!result.success) {
    logger.warn("Extension hook failed", {
      ruleId: matchedRule.ruleId,
      extensionId,
      hookName,
      error: result.error ?? "unknown",
    });
    return;
  }

  logger.info("Extension hook executed", {
    ruleId: matchedRule.ruleId,
    extensionId,
    hookName,
    durationMs: String(result.durationMs),
  });
}

/**
 * Creates a notification in the database for all users of the tenant
 * and delivers it via Expo Push API to any registered devices.
 */
async function handlePushNotification(
  action: RuleAction,
  matchedRule: MatchedRule,
  event: EventContext,
  tenantId: string,
): Promise<void> {
  const supabase = getSupabase();

  const title = interpolateTemplate(
    (action.config["title"] as string) ??
      `Rule triggered: ${matchedRule.ruleName}`,
    event,
  );
  const body = interpolateTemplate(
    (action.config["body"] as string) ??
      `${event.type} detected on ${event.cameraName}`,
    event,
  );

  // Get all users in the tenant, including their push tokens
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, push_token")
    .eq("tenant_id", tenantId);

  if (usersError || !users || users.length === 0) {
    logger.warn("No users found for notification", { tenantId });
    return;
  }

  const notificationPayload = {
    ruleId: matchedRule.ruleId,
    ruleName: matchedRule.ruleName,
    eventType: event.type,
    cameraId: event.cameraId,
    cameraName: event.cameraName,
    severity: event.severity,
  };

  // Create a DB notification record for each user
  const notifications = users.map((user) => ({
    user_id: user.id as string,
    event_id: event.id,
    tenant_id: tenantId,
    channel: "push" as const,
    status: "pending" as const,
    title,
    body,
    payload: notificationPayload,
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

  // Deliver via Expo Push API to devices that have registered a push token
  const pushTokens = users
    .map((u) => u.push_token as string | null)
    .filter(
      (t): t is string =>
        typeof t === "string" && t.startsWith("ExponentPushToken["),
    );

  if (pushTokens.length === 0) return;

  const messages = pushTokens.map((to) => ({
    to,
    title,
    body,
    data: notificationPayload,
    sound: "default" as const,
    priority: "high" as const,
  }));

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn("Expo push delivery failed", {
        status: String(res.status),
        body: text.slice(0, 200),
        ruleId: matchedRule.ruleId,
      });
      return;
    }

    const json = (await res.json()) as {
      data?: { status: string; id?: string; message?: string }[];
    };

    const failed = (json.data ?? []).filter((r) => r.status !== "ok");
    if (failed.length > 0) {
      logger.warn("Some Expo push receipts failed", {
        ruleId: matchedRule.ruleId,
        failedCount: String(failed.length),
        firstError: failed[0]?.message ?? "unknown",
      });
    } else {
      logger.info("Expo push notifications delivered", {
        ruleId: matchedRule.ruleId,
        tokenCount: String(pushTokens.length),
      });
    }
  } catch (err) {
    logger.warn("Expo push API error", {
      ruleId: matchedRule.ruleId,
      error: String(err),
    });
  }
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

    recipients = (users ?? []).map((u) => u.email as string).filter(Boolean);
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
  const supabase = getSupabase();
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
  const customHeaders = action.config["headers"] as
    | Record<string, string>
    | undefined;
  if (customHeaders && typeof customHeaders === "object") {
    for (const [key, value] of Object.entries(customHeaders)) {
      if (typeof value === "string") {
        headers[key] = value;
      }
    }
  }

  const maxRetries = Math.max(
    1,
    Math.min(
      5,
      Number(
        (action.config["max_retries"] as number | string | undefined) ?? 3,
      ),
    ),
  );
  const timeoutMs = Math.max(
    1_000,
    Math.min(
      30_000,
      Number(
        (action.config["timeout_ms"] as number | string | undefined) ?? 10_000,
      ),
    ),
  );
  const baseBackoffMs = Math.max(
    100,
    Math.min(
      30_000,
      Number(
        (action.config["retry_backoff_ms"] as number | string | undefined) ??
          1_000,
      ),
    ),
  );

  const payloadJson = JSON.stringify(payload);
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    let responseStatus: number | null = null;
    let responseBody = "";
    let deliveryError: string | null = null;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: payloadJson,
        signal: AbortSignal.timeout(timeoutMs),
      });

      responseStatus = response.status;
      responseBody = await response.text();
      const delivered = response.ok;

      await recordWebhookAttempt(
        supabase,
        tenantId,
        matchedRule.ruleId,
        event.id,
        url,
        payload,
        headers,
        attempt,
        delivered ? "delivered" : "failed",
        responseStatus,
        responseBody,
        null,
      );

      if (delivered) {
        logger.info("Webhook delivered", {
          ruleId: matchedRule.ruleId,
          url,
          status: String(response.status),
          attempt: String(attempt),
        });
        return;
      }

      deliveryError = `Webhook returned status ${response.status}`;
    } catch (err) {
      deliveryError = String(err);
      await recordWebhookAttempt(
        supabase,
        tenantId,
        matchedRule.ruleId,
        event.id,
        url,
        payload,
        headers,
        attempt,
        "failed",
        responseStatus,
        responseBody,
        deliveryError,
      );
    }

    if (attempt >= maxRetries) {
      logger.error("Webhook delivery failed after retries", {
        ruleId: matchedRule.ruleId,
        url,
        maxRetries: String(maxRetries),
        error: deliveryError ?? "unknown",
      });
      return;
    }

    const delayMs = baseBackoffMs * 2 ** (attempt - 1);
    await sleep(delayMs);
  }
}

async function recordWebhookAttempt(
  supabase: ReturnType<typeof getSupabase>,
  tenantId: string,
  ruleId: string,
  eventId: string,
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  attemptNumber: number,
  deliveryStatus: "delivered" | "failed",
  responseStatus: number | null,
  responseBody: string,
  errorMessage: string | null,
): Promise<void> {
  const maxResponseBodyLength = 10_000;
  const safeResponseBody = responseBody.slice(0, maxResponseBodyLength);
  await supabase.from("webhook_delivery_attempts").insert({
    tenant_id: tenantId,
    rule_id: ruleId,
    event_id: eventId,
    url,
    request_payload: payload,
    request_headers: headers,
    attempt_number: attemptNumber,
    delivery_status: deliveryStatus,
    response_status: responseStatus,
    response_body: safeResponseBody || null,
    error_message: errorMessage,
  });
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
  const durationSec =
    (action.config["duration_sec"] as number) ??
    (action.config["duration"] as number) ??
    60;
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
function interpolateTemplate(template: string, event: EventContext): string {
  const replacements: Record<string, string> = {
    cameraName: event.cameraName,
    cameraId: event.cameraId,
    eventType: event.type,
    severity: event.severity,
    intensity: String(event.intensity),
    detectedAt: event.detectedAt,
    eventId: event.id,
  };

  return template.replaceAll(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => replacements[key] ?? `{{${key}}}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}
