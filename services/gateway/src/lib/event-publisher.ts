import { getRedis } from "./redis.js";
import { createLogger } from "./logger.js";

const logger = createLogger("event-publisher");

/**
 * Publishes an event to the Redis pub/sub channel for a given tenant.
 * Other gateway instances (and the local WS server) will pick this up
 * via their PSUBSCRIBE on "events:*".
 */
export async function publishEvent(
  tenantId: string,
  event: object,
): Promise<void> {
  const redis = getRedis();
  const channel = `events:${tenantId}`;
  const payload = JSON.stringify(event);

  try {
    await redis.publish(channel, payload);
    logger.debug("Published event to Redis", { channel });
  } catch (err) {
    logger.error("Failed to publish event to Redis", {
      channel,
      error: String(err),
    });
    throw err;
  }
}
