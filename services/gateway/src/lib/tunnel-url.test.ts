import { describe, it, expect } from "vitest";
import {
  isNgrokTunnelHost,
  normalizeEdgeTunnelUrl,
} from "./tunnel-url.js";

describe("tunnel-url", () => {
  it("isNgrokTunnelHost matches ngrok dev domains", () => {
    expect(isNgrokTunnelHost("polluted-bridgeable-tena.ngrok-free.dev")).toBe(
      true,
    );
    expect(isNgrokTunnelHost("x.Ngrok-Free.App")).toBe(true);
    expect(isNgrokTunnelHost("x.ngrok.app")).toBe(true);
    expect(isNgrokTunnelHost("example.com")).toBe(false);
  });

  it("normalizeEdgeTunnelUrl upgrades http ngrok URLs to https", () => {
    expect(
      normalizeEdgeTunnelUrl("http://polluted-bridgeable-tena.ngrok-free.dev"),
    ).toBe("https://polluted-bridgeable-tena.ngrok-free.dev");
  });

  it("normalizeEdgeTunnelUrl leaves https ngrok URLs and non-ngrok URLs", () => {
    expect(
      normalizeEdgeTunnelUrl("https://polluted-bridgeable-tena.ngrok-free.dev"),
    ).toBe("https://polluted-bridgeable-tena.ngrok-free.dev");
    expect(normalizeEdgeTunnelUrl("http://localhost:1984")).toBe(
      "http://localhost:1984",
    );
  });

  it("normalizeEdgeTunnelUrl returns null for empty input", () => {
    expect(normalizeEdgeTunnelUrl(null)).toBe(null);
    expect(normalizeEdgeTunnelUrl(undefined)).toBe(null);
    expect(normalizeEdgeTunnelUrl("")).toBe(null);
    expect(normalizeEdgeTunnelUrl("   ")).toBe(null);
  });
});
