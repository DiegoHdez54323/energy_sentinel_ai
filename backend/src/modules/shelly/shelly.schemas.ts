import { z } from "zod";

export const shellyCallbackQuerySchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
});

export const shellyImportHomeParamsSchema = z.object({
  homeId: z.string().uuid(),
});

const shellyImportExternalDeviceIdSchema = z.string().trim().min(1).max(191);
const shellyImportDisplayNameSchema = z.string().trim().min(1).max(120);
const shellyImportVendorSchema = z.string().trim().min(1).max(60);

export const shellyImportDevicesBodySchema = z.object({
  devices: z.array(
    z.object({
      externalDeviceId: shellyImportExternalDeviceIdSchema,
      displayName: shellyImportDisplayNameSchema,
      vendor: shellyImportVendorSchema.optional(),
    }),
  ).min(1).max(500),
});

export type ShellyCallbackQueryInput = z.infer<typeof shellyCallbackQuerySchema>;
export type ShellyImportHomeParamsInput = z.infer<typeof shellyImportHomeParamsSchema>;
export type ShellyImportDevicesBodyInput = z.infer<typeof shellyImportDevicesBodySchema>;
