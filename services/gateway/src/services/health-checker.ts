import { getSupabase } from "../lib/supabase.js";
import { publishEvent } from "../lib/event-publisher.js";
import { createLogger } from "../lib/logger.js";
import jpeg from "jpeg-js";
import { getStreamService } from "./stream.service.js";
import { get } from "../lib/config.js";
import {
  computePixelDiffRatio,
  estimateIntensity,
  getEffectiveSensitivity,
  shouldTriggerMotion,
  type RgbaFrame,
} from "./motion-diff.js";

const logger = createLogger("health-checker");

type CameraStatus = "online" | "connecting" | "offline";

interface CameraRow {
  readonly id: string;
  readonly name: string;
  readonly tenant_id: string;
  readonly status: string;
  readonly config?: Record<string, unknown>;
  readonly connection_uri?: string;
}

interface ZoneRow {
  readonly camera_id: string;
  readonly sensitivity: number;
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
  private motionInterval: ReturnType<typeof setInterval> | null = null;
  private readonly go2rtcUrl: string;
  private readonly checkIntervalMs: number;
  private readonly motionIntervalMs: number;
  private readonly motionCooldownMs: number;
  private readonly previousFrames = new Map<string, RgbaFrame>();
  private readonly lastMotionAt = new Map<string, number>();
  private motionDetectionInFlight = false;

  constructor(checkIntervalMs = 30_000) {
    this.go2rtcUrl =
      get("GO2RTC_API_URL") ??
      get("GO2RTC_URL") ??
      "http://localhost:1984";
    this.checkIntervalMs = checkIntervalMs;
    this.motionIntervalMs = Number.parseInt(
      get("MOTION_SAMPLE_INTERVAL_MS") ?? "1000",
      10,
    );
    this.motionCooldownMs = Number.parseInt(
      get("MOTION_COOLDOWN_MS") ?? "10000",
      10,
    );
  }

  start(): void {
    logger.info("Camera health checker starting", {
      intervalMs: String(this.checkIntervalMs),
      go2rtcUrl: this.go2rtcUrl,
    });

    // Re-sync expected DB streams to go2rtc on startup to avoid cold-start gaps.
    void this.syncStreamsOnStartup();

    // Run immediately, then on interval
    void this.check();
    this.interval = setInterval(() => {
      void this.check();
    }, this.checkIntervalMs);

    // Motion sampling loop (1fps by default)
    void this.detectMotion();
    this.motionInterval = setInterval(() => {
      void this.detectMotion();
    }, this.motionIntervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.motionInterval) {
      clearInterval(this.motionInterval);
      this.motionInterval = null;
    }
    this.previousFrames.clear();
    this.lastMotionAt.clear();
    logger.info("Camera health checker stopped");
  }

  private async check(): Promise<void> {
    try {
      const cameras = await this.fetchCamerasForHealthCheck();
      if (cameras.length === 0) return;

      const streamStatuses = await this.fetchStreamStatuses();
      for (const row of cameras) {
        await this.processCameraHealth(row, streamStatuses);
      }
    } catch (err) {
      logger.error("Health check cycle failed", {
        error: String(err),
      });
    }
  }

  private async syncStreamsOnStartup(): Promise<void> {
    try {
      const supabase = getSupabase();
      const streamService = getStreamService();
      const { data: cameras, error } = await supabase
        .from("cameras")
        .select("id, tenant_id, status, connection_uri")
        .in("status", ["online", "connecting"]);

      if (error || !cameras) {
        logger.warn("Startup stream sync failed to fetch cameras", {
          error: String(error),
        });
        return;
      }

      for (const camera of cameras as CameraRow[]) {
        const uri = camera.connection_uri;
        if (!uri) continue;
        try {
          await streamService.addStream(camera.id, uri);
        } catch (err) {
          logger.warn("Startup stream sync failed for camera", {
            cameraId: camera.id,
            error: String(err),
          });
        }
      }

      logger.info("Startup stream sync completed", {
        cameraCount: String(cameras.length),
      });
    } catch (err) {
      logger.warn("Startup stream sync crashed", {
        error: String(err),
      });
    }
  }

  private async fetchCamerasForHealthCheck(): Promise<CameraRow[]> {
    const supabase = getSupabase();
    const { data: cameras, error } = await supabase
      .from("cameras")
      .select("id, name, tenant_id, status");

    if (error || !cameras) {
      logger.warn("Failed to fetch cameras for health check", {
        error: String(error),
      });
      return [];
    }

    return cameras as CameraRow[];
  }

  private async processCameraHealth(
    camera: CameraRow,
    streamStatuses: ReadonlyMap<string, Go2rtcStream>,
  ): Promise<void> {
    const newStatus = this.deriveStatus(camera.id, streamStatuses);
    const oldStatus = camera.status as CameraStatus;
    if (newStatus === oldStatus) return;

    const updated = await this.updateCameraStatus(camera.id, newStatus);
    if (!updated) return;

    logger.info("Camera status changed", {
      cameraId: camera.id,
      cameraName: camera.name,
      oldStatus,
      newStatus,
    });

    await this.createAndPublishCameraHealthEvent(camera, oldStatus, newStatus);
  }

  private async updateCameraStatus(
    cameraId: string,
    newStatus: CameraStatus,
  ): Promise<boolean> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("cameras")
      .update({
        status: newStatus,
        last_seen_at: newStatus === "online" ? new Date().toISOString() : undefined,
      })
      .eq("id", cameraId);

    if (error) {
      logger.warn("Failed to update camera status", {
        cameraId,
        error: String(error),
      });
      return false;
    }

    return true;
  }

  private async createAndPublishCameraHealthEvent(
    camera: CameraRow,
    oldStatus: CameraStatus,
    newStatus: CameraStatus,
  ): Promise<void> {
    const supabase = getSupabase();
    const eventType = newStatus === "online" ? "camera_online" : "camera_offline";
    const severity = newStatus === "offline" ? "high" : "low";
    const now = new Date().toISOString();
    const intensity = newStatus === "offline" ? 80 : 20;
    const metadata = { previousStatus: oldStatus, newStatus };

    const { data: created, error } = await supabase
      .from("events")
      .insert({
        camera_id: camera.id,
        zone_id: null,
        tenant_id: camera.tenant_id,
        type: eventType,
        severity,
        detected_at: now,
        metadata,
        intensity,
        acknowledged: false,
      })
      .select("*")
      .single();

    if (error || !created) {
      logger.warn("Failed to create health check event", {
        cameraId: camera.id,
        error: String(error),
      });
      return;
    }

    try {
      await publishEvent(camera.tenant_id, {
        id: created.id as string,
        cameraId: camera.id,
        cameraName: camera.name,
        zoneId: null,
        zoneName: null,
        tenantId: camera.tenant_id,
        type: eventType,
        severity,
        detectedAt: now,
        metadata,
        snapshotUrl: null,
        clipUrl: null,
        intensity,
        acknowledged: false,
        acknowledgedBy: null,
        acknowledgedAt: null,
        createdAt: created.created_at as string,
      });
    } catch {
      // Publishing failure is non-critical; DB record already exists.
    }
  }

  private async detectMotion(): Promise<void> {
    if (this.motionDetectionInFlight) return;
    this.motionDetectionInFlight = true;
    try {
      const supabase = getSupabase();
      const { data: cameras, error } = await supabase
        .from("cameras")
        .select("id, name, tenant_id, status, config")
        .eq("status", "online");

      if (error || !cameras || cameras.length === 0) {
        this.previousFrames.clear();
        this.lastMotionAt.clear();
        return;
      }

      const cameraIds = cameras.map((c) => c.id as string);
      this.pruneMotionState(cameraIds);
      const { data: zones } = await supabase
        .from("camera_zones")
        .select("camera_id, sensitivity")
        .in("camera_id", cameraIds)
        .eq("alert_enabled", true);

      const zoneSensitivityMap = new Map<string, number[]>();
      for (const z of (zones ?? []) as ZoneRow[]) {
        const existing = zoneSensitivityMap.get(z.camera_id) ?? [];
        existing.push(z.sensitivity);
        zoneSensitivityMap.set(z.camera_id, existing);
      }

      for (const row of cameras as CameraRow[]) {
        await this.sampleCameraForMotion(row, zoneSensitivityMap.get(row.id) ?? []);
      }
    } catch (err) {
      logger.warn("Motion detection cycle failed", {
        error: String(err),
      });
    } finally {
      this.motionDetectionInFlight = false;
    }
  }

  private async sampleCameraForMotion(
    camera: CameraRow,
    zoneSensitivities: readonly number[],
  ): Promise<void> {
    const frame = await this.fetchFrame(camera.id);
    if (!frame) return;

    const previous = this.previousFrames.get(camera.id);
    this.previousFrames.set(camera.id, frame);
    if (!previous) return;

    const now = Date.now();
    const lastMotionTs = this.lastMotionAt.get(camera.id) ?? 0;
    if (now - lastMotionTs < this.motionCooldownMs) return;

    const cameraSensitivity = this.extractCameraSensitivity(camera.config);
    const effectiveSensitivity = getEffectiveSensitivity(
      cameraSensitivity,
      zoneSensitivities,
    );
    const diffRatio = computePixelDiffRatio(previous, frame, 4, 24);

    if (!shouldTriggerMotion(diffRatio, effectiveSensitivity)) return;

    this.lastMotionAt.set(camera.id, now);
    await this.createMotionEvent(camera, diffRatio, effectiveSensitivity);
  }

  private async fetchFrame(cameraId: string): Promise<RgbaFrame | null> {
    try {
      const res = await fetch(
        `${this.go2rtcUrl}/api/frame.jpeg?src=${encodeURIComponent(cameraId)}`,
        { signal: AbortSignal.timeout(3_000) },
      );
      if (!res.ok) return null;
      const jpegBuffer = Buffer.from(await res.arrayBuffer());
      const decoded = jpeg.decode(jpegBuffer, {
        useTArray: true,
        formatAsRGBA: true,
      });
      if (!decoded?.data || !decoded.width || !decoded.height) return null;
      return {
        width: decoded.width,
        height: decoded.height,
        data: decoded.data,
      };
    } catch {
      return null;
    }
  }

  private async createMotionEvent(
    camera: CameraRow,
    diffRatio: number,
    effectiveSensitivity: number,
  ): Promise<void> {
    const supabase = getSupabase();
    const nowIso = new Date().toISOString();
    const intensity = estimateIntensity(diffRatio);
    const snapshotUrl = `${this.go2rtcUrl}/api/frame.jpeg?src=${encodeURIComponent(camera.id)}&t=${Date.now()}`;
    const severity = this.getMotionSeverity(intensity);

    const { data: created, error } = await supabase
      .from("events")
      .insert({
        camera_id: camera.id,
        zone_id: null,
        tenant_id: camera.tenant_id,
        type: "motion",
        severity,
        detected_at: nowIso,
        metadata: {
          autoDetected: true,
          source: "health-checker-motion-worker",
          diffRatio,
          effectiveSensitivity,
        },
        snapshot_url: snapshotUrl,
        intensity,
        acknowledged: false,
      })
      .select("*")
      .single();

    if (error || !created) {
      logger.warn("Failed to create motion event", {
        cameraId: camera.id,
        error: String(error),
      });
      return;
    }

    const ospEvent = {
      id: created.id as string,
      cameraId: camera.id,
      cameraName: camera.name,
      zoneId: null,
      zoneName: null,
      tenantId: camera.tenant_id,
      type: "motion",
      severity: created.severity as string,
      detectedAt: created.detected_at as string,
      metadata: (created.metadata as Record<string, unknown>) ?? {},
      snapshotUrl: created.snapshot_url as string | null,
      clipUrl: created.clip_path as string | null,
      intensity: created.intensity as number,
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: created.created_at as string,
    };

    try {
      await publishEvent(camera.tenant_id, ospEvent);
    } catch {
      // DB write succeeded, keep going
    }
  }

  private extractCameraSensitivity(config: CameraRow["config"]): number {
    if (!config || typeof config !== "object") return 5;

    const raw = config["motion_sensitivity"];
    if (typeof raw === "number") return raw;
    if (typeof raw === "string") {
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return 5;
  }

  private getMotionSeverity(intensity: number): "low" | "medium" | "high" {
    if (intensity >= 75) return "high";
    if (intensity >= 40) return "medium";
    return "low";
  }

  private pruneMotionState(activeCameraIds: readonly string[]): void {
    const active = new Set(activeCameraIds);
    for (const key of this.previousFrames.keys()) {
      if (!active.has(key)) this.previousFrames.delete(key);
    }
    for (const key of this.lastMotionAt.keys()) {
      if (!active.has(key)) this.lastMotionAt.delete(key);
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
