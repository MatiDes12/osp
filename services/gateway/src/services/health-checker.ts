import { getSupabase } from "../lib/supabase.js";
import { publishEvent } from "../lib/event-publisher.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("health-checker");

type CameraStatus = "online" | "connecting" | "offline";

interface CameraRow {
  readonly id: string;
  readonly name: string;
  readonly tenant_id: string;
  readonly status: string;
}

interface Go2rtcStream {
  readonly producers?: readonly unknown[];
}

/**
 * Periodically checks all cameras against go2rtc and updates their status.
 * Publishes camera_online / camera_offline events when status changes.
 */
export class CameraHealthChecker {
  private interval: ReturnType<typeof setInterval> | null = null;
  private readonly go2rtcUrl: string;
  private readonly checkIntervalMs: number;

  constructor(checkIntervalMs = 30_000) {
    this.go2rtcUrl =
      process.env["GO2RTC_API_URL"] ??
      process.env["GO2RTC_URL"] ??
      "http://localhost:1984";
    this.checkIntervalMs = checkIntervalMs;
  }

  start(): void {
    logger.info("Camera health checker starting", {
      intervalMs: String(this.checkIntervalMs),
      go2rtcUrl: this.go2rtcUrl,
    });

    // Run immediately, then on interval
    void this.check();
    this.interval = setInterval(() => {
      void this.check();
    }, this.checkIntervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    logger.info("Camera health checker stopped");
  }

  private async check(): Promise<void> {
    try {
      const supabase = getSupabase();

      // Fetch all cameras (service role, no tenant filter)
      const { data: cameras, error } = await supabase
        .from("cameras")
        .select("id, name, tenant_id, status");

      if (error || !cameras) {
        logger.warn("Failed to fetch cameras for health check", {
          error: String(error),
        });
        return;
      }

      if (cameras.length === 0) return;

      // Fetch all go2rtc streams in one call
      const streamStatuses = await this.fetchStreamStatuses();

      for (const row of cameras as CameraRow[]) {
        const newStatus = this.deriveStatus(row.id, streamStatuses);
        const oldStatus = row.status as CameraStatus;

        if (newStatus === oldStatus) continue;

        // Status changed -- update DB
        const { error: updateError } = await supabase
          .from("cameras")
          .update({
            status: newStatus,
            last_seen_at:
              newStatus === "online" ? new Date().toISOString() : undefined,
          })
          .eq("id", row.id);

        if (updateError) {
          logger.warn("Failed to update camera status", {
            cameraId: row.id,
            error: String(updateError),
          });
          continue;
        }

        logger.info("Camera status changed", {
          cameraId: row.id,
          cameraName: row.name,
          oldStatus,
          newStatus,
        });

        // Create a camera_online or camera_offline event
        const eventType =
          newStatus === "online" ? "camera_online" : "camera_offline";
        const severity = newStatus === "offline" ? "high" : "low";
        const now = new Date().toISOString();

        const eventRow = {
          camera_id: row.id,
          zone_id: null,
          tenant_id: row.tenant_id,
          type: eventType,
          severity,
          detected_at: now,
          metadata: { previousStatus: oldStatus, newStatus },
          intensity: newStatus === "offline" ? 80 : 20,
          acknowledged: false,
        };

        const { data: created, error: insertError } = await supabase
          .from("events")
          .insert(eventRow)
          .select("*")
          .single();

        if (insertError || !created) {
          logger.warn("Failed to create health check event", {
            cameraId: row.id,
            error: String(insertError),
          });
          continue;
        }

        // Publish to Redis for real-time WS delivery
        const ospEvent = {
          id: created.id as string,
          cameraId: row.id,
          cameraName: row.name,
          zoneId: null,
          zoneName: null,
          tenantId: row.tenant_id,
          type: eventType,
          severity,
          detectedAt: now,
          metadata: { previousStatus: oldStatus, newStatus },
          snapshotUrl: null,
          clipUrl: null,
          intensity: newStatus === "offline" ? 80 : 20,
          acknowledged: false,
          acknowledgedBy: null,
          acknowledgedAt: null,
          createdAt: created.created_at as string,
        };

        try {
          await publishEvent(row.tenant_id, ospEvent);
        } catch {
          // Publishing failure is non-critical; the DB record is already saved
        }
      }
    } catch (err) {
      logger.error("Health check cycle failed", {
        error: String(err),
      });
    }
  }

  /**
   * Fetch all stream statuses from go2rtc in a single API call.
   * Returns a map of streamId -> stream info.
   */
  private async fetchStreamStatuses(): Promise<
    ReadonlyMap<string, Go2rtcStream>
  > {
    try {
      const res = await fetch(`${this.go2rtcUrl}/api/streams`, {
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) {
        logger.warn("go2rtc streams API returned non-OK", {
          status: String(res.status),
        });
        return new Map();
      }

      const body = (await res.json()) as Record<string, Go2rtcStream>;
      return new Map(Object.entries(body));
    } catch (err) {
      logger.warn("Failed to fetch go2rtc stream statuses", {
        error: String(err),
      });
      return new Map();
    }
  }

  /**
   * Derive a camera's status from the go2rtc streams map.
   */
  private deriveStatus(
    cameraId: string,
    streams: ReadonlyMap<string, Go2rtcStream>,
  ): CameraStatus {
    const stream = streams.get(cameraId);

    if (!stream) return "offline";

    const producers = stream.producers ?? [];
    if (producers.length > 0) return "online";

    return "connecting";
  }
}
