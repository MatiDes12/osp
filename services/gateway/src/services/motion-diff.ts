export interface RgbaFrame {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

const MAX_CHANNEL_DELTA = 255;
const CHANNELS_PER_PIXEL = 4;

/**
 * Computes the fraction of sampled pixels that changed more than deltaThreshold.
 */
export function computePixelDiffRatio(
  previous: RgbaFrame,
  current: RgbaFrame,
  sampleStride = 4,
  deltaThreshold = 24,
): number {
  if (
    previous.width !== current.width
    || previous.height !== current.height
    || previous.data.length !== current.data.length
  ) {
    return 0;
  }

  const stride = Math.max(1, Math.floor(sampleStride));
  let compared = 0;
  let changed = 0;

  for (let i = 0; i < current.data.length; i += CHANNELS_PER_PIXEL * stride) {
    const currentR = current.data[i] ?? 0;
    const currentG = current.data[i + 1] ?? 0;
    const currentB = current.data[i + 2] ?? 0;
    const previousR = previous.data[i] ?? 0;
    const previousG = previous.data[i + 1] ?? 0;
    const previousB = previous.data[i + 2] ?? 0;

    const dr = Math.abs(currentR - previousR);
    const dg = Math.abs(currentG - previousG);
    const db = Math.abs(currentB - previousB);

    compared += 1;
    const avgDelta = (dr + dg + db) / 3;
    if (avgDelta >= deltaThreshold) {
      changed += 1;
    }
  }

  if (compared === 0) return 0;
  return changed / compared;
}

/**
 * Maps 1..10 sensitivity to a diff ratio threshold.
 * Higher sensitivity => lower threshold (easier to trigger).
 */
export function sensitivityToDiffThreshold(sensitivity: number): number {
  const clamped = clampSensitivity(sensitivity);
  const minThreshold = 0.03;
  const maxThreshold = 0.12;

  // sensitivity 1 => 0.12, sensitivity 10 => 0.03
  const t = (clamped - 1) / 9;
  return maxThreshold - t * (maxThreshold - minThreshold);
}

/**
 * Picks the effective sensitivity from camera + zones.
 * If any zone is more sensitive, that wins.
 */
export function getEffectiveSensitivity(
  cameraSensitivity: number | undefined,
  zoneSensitivities: readonly number[],
): number {
  const base = clampSensitivity(cameraSensitivity ?? 5);
  if (zoneSensitivities.length === 0) return base;
  const maxZoneSensitivity = Math.max(
    ...zoneSensitivities.map((s) => clampSensitivity(s)),
  );
  return Math.max(base, maxZoneSensitivity);
}

export function shouldTriggerMotion(
  diffRatio: number,
  effectiveSensitivity: number,
): boolean {
  return diffRatio >= sensitivityToDiffThreshold(effectiveSensitivity);
}

export function estimateIntensity(diffRatio: number): number {
  const ratio = Math.max(0, Math.min(1, diffRatio));
  return Math.round(ratio * 100);
}

function clampSensitivity(sensitivity: number): number {
  if (Number.isNaN(sensitivity)) return 5;
  return Math.max(1, Math.min(10, Math.round(sensitivity)));
}


