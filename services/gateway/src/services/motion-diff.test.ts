import { describe, expect, it } from "vitest";
import {
  computePixelDiffRatio,
  estimateIntensity,
  getEffectiveSensitivity,
  sensitivityToDiffThreshold,
  shouldTriggerMotion,
  type RgbaFrame,
} from "./motion-diff.js";

function makeFrame(
  width: number,
  height: number,
  rgb: readonly [number, number, number],
): RgbaFrame {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { width, height, data };
}

describe("motion-diff", () => {
  it("returns zero diff for identical frames", () => {
    const a = makeFrame(2, 2, [10, 20, 30]);
    const b = makeFrame(2, 2, [10, 20, 30]);
    expect(computePixelDiffRatio(a, b)).toBe(0);
  });

  it("returns full diff for completely different frames", () => {
    const a = makeFrame(2, 2, [0, 0, 0]);
    const b = makeFrame(2, 2, [255, 255, 255]);
    expect(computePixelDiffRatio(a, b, 1, 20)).toBe(1);
  });

  it("lowers threshold as sensitivity increases", () => {
    expect(sensitivityToDiffThreshold(1)).toBeGreaterThan(
      sensitivityToDiffThreshold(10),
    );
  });

  it("uses most sensitive zone as effective sensitivity", () => {
    expect(getEffectiveSensitivity(4, [5, 8, 3])).toBe(8);
  });

  it("triggers motion when diff exceeds threshold", () => {
    expect(shouldTriggerMotion(0.08, 7)).toBe(true);
    expect(shouldTriggerMotion(0.01, 7)).toBe(false);
  });

  it("maps diff ratio to 0..100 intensity", () => {
    expect(estimateIntensity(0)).toBe(0);
    expect(estimateIntensity(0.5)).toBe(50);
    expect(estimateIntensity(1.5)).toBe(100);
  });
});
