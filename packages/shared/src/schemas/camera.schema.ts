import { z } from "zod";

export const CameraProtocolSchema = z.enum([
  "rtsp",
  "onvif",
  "webrtc",
  "usb",
  "ip",
  "rtmp",
  "hls",
  "mjpeg",
  "ring",
  "wyze",
  "tuya",
  "gopro",
  "arlo",
  "isapi",
  "dvrip",
  "ffmpeg",
  "exec",
]);

export const CameraLocationSchema = z.object({
  label: z.string().max(100).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  floor: z.string().max(20).optional(),
});

export const CameraConfigSchema = z.object({
  recordingMode: z.enum(["motion", "continuous", "off"]).default("motion"),
  motionSensitivity: z.number().int().min(1).max(10).default(5),
  audioEnabled: z.boolean().default(false),
});

export const CreateCameraSchema = z
  .object({
    name: z.string().min(1).max(100),
    protocol: CameraProtocolSchema,
    connectionUri: z.string().max(1000).default(""),
    usbDeviceIndex: z.number().int().min(0).max(9).optional(),
    location: CameraLocationSchema.optional(),
    config: CameraConfigSchema.optional(),
  })
  .transform((data) => {
    // For USB protocol, auto-build the URI if empty
    if (data.protocol === "usb" && !data.connectionUri) {
      const idx = data.usbDeviceIndex ?? 0;
      return { ...data, connectionUri: `ffmpeg:device?video=${idx}#video=h264` };
    }
    return data;
  })
  .refine(
    (data) => data.connectionUri.trim().length > 0,
    { message: "Connection URI is required", path: ["connectionUri"] },
  );

export const UpdateCameraSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  location: CameraLocationSchema.optional(),
  config: CameraConfigSchema.partial().optional(),
});

export const PTZCommandSchema = z.object({
  action: z.enum(["move", "zoom", "preset", "stop"]),
  pan: z.number().min(-1).max(1).optional(),
  tilt: z.number().min(-1).max(1).optional(),
  zoom: z.number().min(-1).max(1).optional(),
  presetId: z.string().optional(),
  speed: z.number().min(0.1).max(1).optional(),
});

export const CreateZoneSchema = z.object({
  name: z.string().min(1).max(100),
  polygonCoordinates: z
    .array(
      z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      }),
    )
    .min(3)
    .max(20),
  alertEnabled: z.boolean().default(true),
  sensitivity: z.number().int().min(1).max(10).default(5),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#FF0000"),
  visibleToRoles: z
    .array(z.enum(["owner", "admin", "operator", "viewer"]))
    .optional(),
});

export const UpdateZoneSchema = CreateZoneSchema.partial();

export type CreateCameraInput = z.infer<typeof CreateCameraSchema>;
export type UpdateCameraInput = z.infer<typeof UpdateCameraSchema>;
export type PTZCommandInput = z.infer<typeof PTZCommandSchema>;
export type CreateZoneInput = z.infer<typeof CreateZoneSchema>;
export type UpdateZoneInput = z.infer<typeof UpdateZoneSchema>;
