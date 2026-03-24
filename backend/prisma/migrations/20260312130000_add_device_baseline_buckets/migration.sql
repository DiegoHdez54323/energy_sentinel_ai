ALTER TABLE "device_baselines"
ADD COLUMN "metric" TEXT,
ADD COLUMN "granularity" TEXT,
ADD COLUMN "profile_shape" TEXT,
ADD COLUMN "timezone" TEXT,
ADD COLUMN "source_start_date" DATE,
ADD COLUMN "source_end_date" DATE,
ADD COLUMN "history_days_used" INTEGER,
ADD COLUMN "min_bucket_samples" INTEGER,
ADD COLUMN "summary" JSONB,
ADD COLUMN "superseded_at" TIMESTAMPTZ(6);

UPDATE "device_baselines"
SET
  "metric" = 'energy_wh',
  "granularity" = 'hourly_local',
  "profile_shape" = 'weekday_weekend_hour',
  "timezone" = 'UTC',
  "source_start_date" = COALESCE(("trained_from" AT TIME ZONE 'UTC')::date, CURRENT_DATE),
  "source_end_date" = COALESCE(("trained_to" AT TIME ZONE 'UTC')::date, CURRENT_DATE),
  "history_days_used" = COALESCE("window_days", 14),
  "min_bucket_samples" = 2;

ALTER TABLE "device_baselines"
ALTER COLUMN "metric" SET NOT NULL,
ALTER COLUMN "metric" SET DEFAULT 'energy_wh',
ALTER COLUMN "granularity" SET NOT NULL,
ALTER COLUMN "granularity" SET DEFAULT 'hourly_local',
ALTER COLUMN "profile_shape" SET NOT NULL,
ALTER COLUMN "profile_shape" SET DEFAULT 'weekday_weekend_hour',
ALTER COLUMN "timezone" SET NOT NULL,
ALTER COLUMN "source_start_date" SET NOT NULL,
ALTER COLUMN "source_end_date" SET NOT NULL,
ALTER COLUMN "history_days_used" SET NOT NULL,
ALTER COLUMN "min_bucket_samples" SET NOT NULL,
ALTER COLUMN "min_bucket_samples" SET DEFAULT 2,
ALTER COLUMN "params" DROP NOT NULL;

ALTER TABLE "device_baselines"
DROP COLUMN "baseline_type",
DROP COLUMN "trained_from",
DROP COLUMN "trained_to";

CREATE TABLE "device_baseline_buckets" (
  "id" BIGSERIAL NOT NULL,
  "baseline_id" UUID NOT NULL,
  "day_group" TEXT NOT NULL,
  "local_hour" INTEGER NOT NULL,
  "sample_count" INTEGER NOT NULL,
  "expected_energy_wh" DECIMAL(14,4) NOT NULL,
  "lower_bound_energy_wh" DECIMAL(14,4) NOT NULL,
  "upper_bound_energy_wh" DECIMAL(14,4) NOT NULL,

  CONSTRAINT "device_baseline_buckets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "device_baseline_buckets_baseline_id_idx" ON "device_baseline_buckets"("baseline_id");
CREATE UNIQUE INDEX "device_baseline_buckets_baseline_day_hour_unique" ON "device_baseline_buckets"("baseline_id", "day_group", "local_hour");
CREATE UNIQUE INDEX "device_baselines_device_active_profile_unique" ON "device_baselines"("device_id", "metric", "granularity", "profile_shape") WHERE "is_active" = true;

ALTER TABLE "device_baseline_buckets"
ADD CONSTRAINT "device_baseline_buckets_baseline_id_fkey" FOREIGN KEY ("baseline_id") REFERENCES "device_baselines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
