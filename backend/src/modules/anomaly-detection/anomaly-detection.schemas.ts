import { z } from "zod";

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const deviceAnomalyParamsSchema = z.object({
  deviceId: z.string().uuid(),
});

export const deviceAnomaliesQuerySchema = z.object({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  status: z.enum(["all", "open", "closed"]).default("all"),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type DeviceAnomalyParamsInput = z.infer<typeof deviceAnomalyParamsSchema>;
export type DeviceAnomaliesQueryInput = z.infer<typeof deviceAnomaliesQuerySchema>;
