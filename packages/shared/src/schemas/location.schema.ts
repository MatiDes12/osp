import { z } from "zod";

const FloorPlanObjectSchema = z.object({
  id: z.string(),
  type: z.enum([
    "room",
    "wall",
    "door",
    "window",
    "camera",
    "label",
    "furniture",
  ]),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().default(0),
  label: z.string().optional(),
  color: z.string().optional(),
  cameraId: z.string().optional(),
  cameraStatus: z.string().optional(),
  furnitureType: z.string().optional(),
  wallHeight: z.number().optional(),
  locked: z.boolean().optional(),
  floorLevel: z.number().int().min(0).optional(),
});

export const CreateLocationSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(200).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  timezone: z.string().max(100).default("UTC"),
  floor_plan: z.array(FloorPlanObjectSchema).optional(),
});

export const UpdateLocationSchema = CreateLocationSchema.partial();

export type CreateLocationInput = z.infer<typeof CreateLocationSchema>;
export type UpdateLocationInput = z.infer<typeof UpdateLocationSchema>;
