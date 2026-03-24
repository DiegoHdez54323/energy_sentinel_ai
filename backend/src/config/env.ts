import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGIN: z.string().optional(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  JWT_EXPIRES_IN: z.string().default("1h"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  SHELLY_OAUTH_REDIRECT_URI: z.string().url("SHELLY_OAUTH_REDIRECT_URI must be a valid URL"),
  SHELLY_POLLING_ENABLED: z.enum(["true", "false", "1", "0"]).optional(),
  SHELLY_POLLING_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  SHELLY_POLLING_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  SHELLY_POLLING_MAX_CONCURRENCY: z.coerce.number().int().positive().default(3),
  SHELLY_POLLING_DEBUG_DUMPS: z.enum(["true", "false", "1", "0"]).optional(),
  AGGREGATES_ENABLED: z.enum(["true", "false", "1", "0"]).optional(),
  AGGREGATES_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
  AGGREGATES_DEVICE_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  BASELINE_ENABLED: z.enum(["true", "false", "1", "0"]).optional(),
  BASELINE_WINDOW_DAYS: z.coerce.number().int().positive().default(14),
  BASELINE_MIN_BUCKET_SAMPLES: z.coerce.number().int().positive().default(2),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment variables",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment configuration");
}

const pollingEnabled = parsed.data.SHELLY_POLLING_ENABLED
  ? ["true", "1"].includes(parsed.data.SHELLY_POLLING_ENABLED)
  : parsed.data.NODE_ENV !== "test";
const pollingDebugDumps = parsed.data.SHELLY_POLLING_DEBUG_DUMPS
  ? ["true", "1"].includes(parsed.data.SHELLY_POLLING_DEBUG_DUMPS)
  : false;
const aggregatesEnabled = parsed.data.AGGREGATES_ENABLED
  ? ["true", "1"].includes(parsed.data.AGGREGATES_ENABLED)
  : parsed.data.NODE_ENV !== "test";
const baselineEnabled = parsed.data.BASELINE_ENABLED
  ? ["true", "1"].includes(parsed.data.BASELINE_ENABLED)
  : parsed.data.NODE_ENV !== "test";
const corsAllowedOrigins = parsed.data.CORS_ORIGIN
  ? parsed.data.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
  : [];

if (parsed.data.NODE_ENV === "production" && corsAllowedOrigins.length === 0) {
  console.error("Invalid environment variables", {
    CORS_ORIGIN: ["CORS_ORIGIN is required in production"],
  });
  throw new Error("Invalid environment configuration");
}

export const env = {
  ...parsed.data,
  CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
  SHELLY_POLLING_ENABLED: pollingEnabled,
  SHELLY_POLLING_DEBUG_DUMPS: pollingDebugDumps,
  AGGREGATES_ENABLED: aggregatesEnabled,
  BASELINE_ENABLED: baselineEnabled,
};
