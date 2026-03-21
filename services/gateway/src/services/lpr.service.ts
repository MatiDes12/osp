/**
 * License Plate Recognition (LPR) Service
 *
 * Provider: PlateRecognizer (platerecognizer.com)
 *   - Free tier: 2500 API calls/month
 *   - Set LPR_PROVIDER=platerecognizer and LPR_API_KEY=<token> in config
 *
 * All calls are fire-and-forget from the event pipeline — never blocks a
 * response. Results are stored as event metadata and watchlist alerts create
 * typed 'lpr.alert' events.
 */

import { get } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("lpr");

const PLATERECOGNIZER_URL = "https://api.platerecognizer.com/v1/plate-reader/";

export interface PlateDetection {
  plate: string; // normalised uppercase, e.g. "ABC1234"
  confidence: number; // 0–1
  region: string; // country/region code, e.g. "us-ca"
  vehicle: string; // "car" | "truck" | "motorcycle" | "bus" | "unknown"
  boundingBox: { x: number; y: number; width: number; height: number } | null;
}

export interface LprResult {
  detections: PlateDetection[];
  provider: string;
  processingMs: number;
}

export function isLprConfigured(): boolean {
  return !!(
    get("LPR_API_KEY") &&
    (get("LPR_PROVIDER") ?? "platerecognizer") === "platerecognizer"
  );
}

/**
 * Submit a JPEG frame buffer to PlateRecognizer and return detected plates.
 */
export async function analyzeFrameForPlates(
  imageBuffer: Buffer,
): Promise<LprResult> {
  const apiKey = get("LPR_API_KEY");
  if (!apiKey) return { detections: [], provider: "none", processingMs: 0 };

  const start = Date.now();

  try {
    const form = new FormData();
    form.append(
      "upload",
      new Blob([imageBuffer], { type: "image/jpeg" }),
      "frame.jpg",
    );

    // Optional: restrict to specific regions for accuracy (e.g. "us,gb")
    const regions = get("LPR_REGIONS");
    if (regions) form.append("regions", regions);

    const res = await fetch(PLATERECOGNIZER_URL, {
      method: "POST",
      headers: { Authorization: `Token ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.warn("PlateRecognizer API error", {
        status: String(res.status),
        body: errText.slice(0, 200),
      });
      return {
        detections: [],
        provider: "platerecognizer",
        processingMs: Date.now() - start,
      };
    }

    const json = (await res.json()) as {
      results: Array<{
        plate: { upper: string };
        score: number;
        region: { code: string };
        vehicle: { type: string };
        box: { xmin: number; ymin: number; xmax: number; ymax: number };
      }>;
    };

    const detections: PlateDetection[] = (json.results ?? []).map((r) => ({
      plate: r.plate.upper.replace(/\s+/g, ""),
      confidence: r.score,
      region: r.region?.code ?? "unknown",
      vehicle: r.vehicle?.type ?? "unknown",
      boundingBox: r.box
        ? {
            x: r.box.xmin,
            y: r.box.ymin,
            width: r.box.xmax - r.box.xmin,
            height: r.box.ymax - r.box.ymin,
          }
        : null,
    }));

    logger.info("LPR analysis complete", {
      plateCount: String(detections.length),
      plates: detections.map((d) => d.plate).join(", "),
      ms: String(Date.now() - start),
    });

    return {
      detections,
      provider: "platerecognizer",
      processingMs: Date.now() - start,
    };
  } catch (err) {
    logger.warn("LPR analysis failed", { error: String(err) });
    return {
      detections: [],
      provider: "platerecognizer",
      processingMs: Date.now() - start,
    };
  }
}

/**
 * Check detected plates against the tenant watchlist.
 * Returns matching watchlist entries.
 */
export async function checkWatchlist(
  tenantId: string,
  plates: PlateDetection[],
  supabase: ReturnType<typeof import("../lib/supabase.js").getSupabase>,
): Promise<Array<{ plate: string; label: string; watchlistId: string }>> {
  if (plates.length === 0) return [];

  const plateStrings = plates.map((p) => p.plate);

  const { data } = await supabase
    .from("lpr_watchlist")
    .select("id, plate, label, alert_on_detect")
    .eq("tenant_id", tenantId)
    .eq("alert_on_detect", true)
    .in("plate", plateStrings);

  return (data ?? []).map((row) => ({
    plate: row.plate as string,
    label: row.label as string,
    watchlistId: row.id as string,
  }));
}
