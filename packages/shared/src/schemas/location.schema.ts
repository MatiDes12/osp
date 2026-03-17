import { z } from "zod";

export const CreateLocationSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(200).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  timezone: z.string().max(100).default("UTC"),
});

export const UpdateLocationSchema = CreateLocationSchema.partial();

export type CreateLocationInput = z.infer<typeof CreateLocationSchema>;
export type UpdateLocationInput = z.infer<typeof UpdateLocationSchema>;
