import { z } from "zod";

const vendorSchema = z.string().trim().min(1).max(60);
const displayNameSchema = z.string().trim().min(1).max(120);
const externalDeviceIdSchema = z.string().trim().min(1).max(191);
const deviceCodeSchema = z.string().trim().min(1).max(120);
const ipAddressSchema = z.string().trim().min(1).max(45);
const macAddressSchema = z.string().trim().min(1).max(50);
const statusSchema = z.string().trim().min(1).max(40);
const dataSourceSchema = z.string().trim().min(1).max(40);

export const homeDeviceParamsSchema = z.object({
  homeId: z.string().uuid(),
});

export const deviceParamsSchema = z.object({
  deviceId: z.string().uuid(),
});

export const createDeviceSchema = z.object({
  vendor: vendorSchema,
  displayName: displayNameSchema,
  externalDeviceId: externalDeviceIdSchema,
  deviceCode: deviceCodeSchema.optional(),
  ipAddress: ipAddressSchema.optional(),
  macAddress: macAddressSchema.optional(),
  status: statusSchema.optional(),
  dataSource: dataSourceSchema.optional(),
});

export const updateDeviceSchema = z
  .object({
    vendor: vendorSchema.optional(),
    displayName: displayNameSchema.optional(),
    externalDeviceId: externalDeviceIdSchema.optional(),
    deviceCode: deviceCodeSchema.optional(),
    ipAddress: ipAddressSchema.optional(),
    macAddress: macAddressSchema.optional(),
    status: statusSchema.optional(),
    dataSource: dataSourceSchema.optional(),
    homeId: z.string().uuid().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be provided",
  });

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type HomeDeviceParamsInput = z.infer<typeof homeDeviceParamsSchema>;
export type DeviceParamsInput = z.infer<typeof deviceParamsSchema>;
