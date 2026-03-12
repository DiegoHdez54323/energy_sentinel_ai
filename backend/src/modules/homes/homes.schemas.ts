import { z } from "zod";

function isIanaTimezone(value: string) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const homeNameSchema = z.string().trim().min(1).max(120);
const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(isIanaTimezone, { message: "Invalid IANA timezone" });

export const createHomeSchema = z.object({
  name: homeNameSchema,
  timezone: timezoneSchema,
});

export const updateHomeSchema = z
  .object({
    name: homeNameSchema.optional(),
    timezone: timezoneSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be provided",
  });

export const homeParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateHomeInput = z.infer<typeof createHomeSchema>;
export type UpdateHomeInput = z.infer<typeof updateHomeSchema>;
export type HomeParamsInput = z.infer<typeof homeParamsSchema>;
