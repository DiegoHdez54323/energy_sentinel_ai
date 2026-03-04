import { z } from "zod";

export const shellyCallbackQuerySchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
});

export type ShellyCallbackQueryInput = z.infer<typeof shellyCallbackQuerySchema>;
