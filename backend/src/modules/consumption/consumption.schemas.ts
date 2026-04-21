import { z } from "zod";

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const consumptionGranularitySchema = z.enum(["auto", "raw", "hourly", "daily"]);
export const consumptionSummaryPeriodSchema = z.enum(["today", "week", "month"]);

export const deviceConsumptionParamsSchema = z.object({
  deviceId: z.string().uuid(),
});

export const homeConsumptionParamsSchema = z.object({
  homeId: z.string().uuid(),
});

export const consumptionQuerySchema = z.object({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  granularity: consumptionGranularitySchema.default("auto"),
});

export const consumptionSummaryQuerySchema = z.object({
  period: consumptionSummaryPeriodSchema.default("week"),
});

export type ConsumptionGranularityInput = z.infer<typeof consumptionGranularitySchema>;
export type ConsumptionSummaryPeriodInput = z.infer<typeof consumptionSummaryPeriodSchema>;
export type DeviceConsumptionParamsInput = z.infer<typeof deviceConsumptionParamsSchema>;
export type HomeConsumptionParamsInput = z.infer<typeof homeConsumptionParamsSchema>;
export type ConsumptionQueryInput = z.infer<typeof consumptionQuerySchema>;
export type ConsumptionSummaryQueryInput = z.infer<typeof consumptionSummaryQuerySchema>;
