import { describe, it, expect } from "vitest";
import {
  CreateCameraSchema,
  UpdateCameraSchema,
  PTZCommandSchema,
  CreateZoneSchema,
} from "./camera.schema.js";

describe("CreateCameraSchema", () => {
  const validInput = {
    name: "Front Door Camera",
    protocol: "rtsp" as const,
    connectionUri: "rtsp://192.168.1.100:554/stream",
  };

  it("accepts valid RTSP input", () => {
    const result = CreateCameraSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts valid ONVIF input with http URL", () => {
    const result = CreateCameraSchema.safeParse({
      ...validInput,
      protocol: "onvif",
      connectionUri: "http://192.168.1.100:8080/onvif/device",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid connection URI (not rtsp:// or http)", () => {
    const result = CreateCameraSchema.safeParse({
      ...validInput,
      connectionUri: "ftp://bad-protocol.com/stream",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const { name: _, ...noName } = validInput;
    const result = CreateCameraSchema.safeParse(noName);
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = CreateCameraSchema.safeParse({ ...validInput, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 100 characters", () => {
    const result = CreateCameraSchema.safeParse({
      ...validInput,
      name: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid USB input with ffmpeg device URI", () => {
    const result = CreateCameraSchema.safeParse({
      ...validInput,
      protocol: "usb",
      connectionUri: "ffmpeg:device?video=0#video=h264",
    });
    expect(result.success).toBe(true);
  });

  it("protocol must be rtsp, onvif, or usb", () => {
    const result = CreateCameraSchema.safeParse({
      ...validInput,
      protocol: "webrtc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing connectionUri", () => {
    const { connectionUri: _, ...noUri } = validInput;
    const result = CreateCameraSchema.safeParse(noUri);
    expect(result.success).toBe(false);
  });

  it("accepts optional location", () => {
    const result = CreateCameraSchema.safeParse({
      ...validInput,
      location: { label: "Building A", lat: 40.7128, lng: -74.006 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional config with defaults", () => {
    const result = CreateCameraSchema.safeParse({
      ...validInput,
      config: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config?.recordingMode).toBe("motion");
      expect(result.data.config?.motionSensitivity).toBe(5);
      expect(result.data.config?.audioEnabled).toBe(false);
    }
  });

  it("rejects connectionUri longer than 500 chars", () => {
    const result = CreateCameraSchema.safeParse({
      ...validInput,
      connectionUri: "rtsp://" + "a".repeat(500),
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateCameraSchema", () => {
  it("accepts partial update with only name", () => {
    const result = UpdateCameraSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = UpdateCameraSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts only location", () => {
    const result = UpdateCameraSchema.safeParse({
      location: { label: "Lobby" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial config", () => {
    const result = UpdateCameraSchema.safeParse({
      config: { audioEnabled: true },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid name (empty string)", () => {
    const result = UpdateCameraSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("PTZCommandSchema", () => {
  it("accepts valid move command", () => {
    const result = PTZCommandSchema.safeParse({
      action: "move",
      pan: 0.5,
      tilt: -0.3,
      speed: 0.8,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid zoom command", () => {
    const result = PTZCommandSchema.safeParse({
      action: "zoom",
      zoom: 0.7,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid preset command", () => {
    const result = PTZCommandSchema.safeParse({
      action: "preset",
      presetId: "home",
    });
    expect(result.success).toBe(true);
  });

  it("accepts stop action with no other fields", () => {
    const result = PTZCommandSchema.safeParse({ action: "stop" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid action", () => {
    const result = PTZCommandSchema.safeParse({ action: "rotate" });
    expect(result.success).toBe(false);
  });

  it("rejects pan value out of range (> 1)", () => {
    const result = PTZCommandSchema.safeParse({ action: "move", pan: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects pan value out of range (< -1)", () => {
    const result = PTZCommandSchema.safeParse({ action: "move", pan: -1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects speed below 0.1", () => {
    const result = PTZCommandSchema.safeParse({
      action: "move",
      speed: 0.05,
    });
    expect(result.success).toBe(false);
  });

  it("rejects speed above 1", () => {
    const result = PTZCommandSchema.safeParse({
      action: "move",
      speed: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("accepts boundary values: pan=-1, tilt=1, zoom=-1", () => {
    const result = PTZCommandSchema.safeParse({
      action: "move",
      pan: -1,
      tilt: 1,
      zoom: -1,
    });
    expect(result.success).toBe(true);
  });
});

describe("CreateZoneSchema", () => {
  const validZone = {
    name: "Parking Lot",
    polygonCoordinates: [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.5, y: 0.9 },
    ],
  };

  it("accepts valid polygon with 3 points", () => {
    const result = CreateZoneSchema.safeParse(validZone);
    expect(result.success).toBe(true);
  });

  it("applies defaults for alertEnabled, sensitivity, colorHex", () => {
    const result = CreateZoneSchema.safeParse(validZone);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alertEnabled).toBe(true);
      expect(result.data.sensitivity).toBe(5);
      expect(result.data.colorHex).toBe("#FF0000");
    }
  });

  it("rejects polygon with fewer than 3 points", () => {
    const result = CreateZoneSchema.safeParse({
      ...validZone,
      polygonCoordinates: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects polygon with more than 20 points", () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => ({
      x: i / 21,
      y: i / 21,
    }));
    const result = CreateZoneSchema.safeParse({
      ...validZone,
      polygonCoordinates: tooMany,
    });
    expect(result.success).toBe(false);
  });

  it("rejects coordinates outside 0-1 range (x > 1)", () => {
    const result = CreateZoneSchema.safeParse({
      ...validZone,
      polygonCoordinates: [
        { x: 1.5, y: 0 },
        { x: 0, y: 1 },
        { x: 0.5, y: 0.5 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects coordinates outside 0-1 range (y < 0)", () => {
    const result = CreateZoneSchema.safeParse({
      ...validZone,
      polygonCoordinates: [
        { x: 0, y: -0.1 },
        { x: 0, y: 1 },
        { x: 0.5, y: 0.5 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts boundary coordinates (0 and 1)", () => {
    const result = CreateZoneSchema.safeParse({
      ...validZone,
      polygonCoordinates: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const { name: _, ...noName } = validZone;
    const result = CreateZoneSchema.safeParse(noName);
    expect(result.success).toBe(false);
  });

  it("rejects invalid colorHex", () => {
    const result = CreateZoneSchema.safeParse({
      ...validZone,
      colorHex: "red",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid colorHex", () => {
    const result = CreateZoneSchema.safeParse({
      ...validZone,
      colorHex: "#00FF00",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.colorHex).toBe("#00FF00");
    }
  });

  it("accepts optional visibleToRoles", () => {
    const result = CreateZoneSchema.safeParse({
      ...validZone,
      visibleToRoles: ["owner", "admin"],
    });
    expect(result.success).toBe(true);
  });
});
