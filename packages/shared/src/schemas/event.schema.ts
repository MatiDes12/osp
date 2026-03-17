import { z } from "zod";

export const EventTypeSchema = z.enum([
  "motion",
  "person",
  "vehicle",
  "animal",
  "camera_offline",
  "camera_online",
  "tampering",
  "audio",
  "custom",
]);

export const EventSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const ListEventsSchema = z.object({
  cameraId: z.string().uuid().optional(),
  zoneId: z.string().uuid().optional(),
  type: EventTypeSchema.optional(),
  severity: EventSeveritySchema.optional(),
  acknowledged: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const BulkAcknowledgeSchema = z.object({
  eventIds: z.array(z.string().uuid()).min(1).max(100),
});

export type ListEventsInput = z.infer<typeof ListEventsSchema>;
export type BulkAcknowledgeInput = z.infer<typeof BulkAcknowledgeSchema>;
