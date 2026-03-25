ALTER TABLE "anomaly_events" DROP CONSTRAINT IF EXISTS "anomaly_events_baseline_id_fkey";
DROP INDEX IF EXISTS "anomaly_events_device_type_window_unique";

ALTER TABLE "anomaly_events"
ADD COLUMN "model_id" UUID,
ADD COLUMN "prediction_id" UUID,
ADD COLUMN "reading_id" BIGINT;

ALTER TABLE "anomaly_events"
DROP COLUMN IF EXISTS "baseline_id";

DROP TABLE IF EXISTS "device_baseline_buckets";
DROP TABLE IF EXISTS "device_baselines";

CREATE TABLE "device_anomaly_models" (
  "id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "model_type" TEXT NOT NULL DEFAULT 'isolation_forest',
  "model_version" TEXT NOT NULL,
  "feature_schema_version" TEXT NOT NULL,
  "contamination" DOUBLE PRECISION NOT NULL,
  "training_window_days" INTEGER NOT NULL,
  "trained_from" DATE NOT NULL,
  "trained_to" DATE NOT NULL,
  "trained_at" TIMESTAMPTZ(6) NOT NULL,
  "training_sample_count" INTEGER NOT NULL,
  "timezone" TEXT NOT NULL,
  "artifact" JSONB NOT NULL,
  "summary" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "superseded_at" TIMESTAMPTZ(6),
  CONSTRAINT "device_anomaly_models_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "device_reading_features" (
  "id" BIGSERIAL NOT NULL,
  "reading_id" BIGINT NOT NULL,
  "device_id" UUID NOT NULL,
  "ts" TIMESTAMPTZ(6) NOT NULL,
  "local_date" DATE NOT NULL,
  "feature_schema_version" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "day_group" TEXT NOT NULL,
  "local_hour" INTEGER NOT NULL,
  "day_of_week" INTEGER NOT NULL,
  "apower" DOUBLE PRECISION,
  "aenergy_delta" DOUBLE PRECISION,
  "output_numeric" DOUBLE PRECISION,
  "hour_sin" DOUBLE PRECISION NOT NULL,
  "hour_cos" DOUBLE PRECISION NOT NULL,
  "day_of_week_sin" DOUBLE PRECISION NOT NULL,
  "day_of_week_cos" DOUBLE PRECISION NOT NULL,
  "delta_power_prev" DOUBLE PRECISION,
  "rolling_mean_power_5" DOUBLE PRECISION,
  "rolling_std_power_5" DOUBLE PRECISION,
  CONSTRAINT "device_reading_features_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "device_anomaly_predictions" (
  "id" UUID NOT NULL,
  "reading_id" BIGINT NOT NULL,
  "device_id" UUID NOT NULL,
  "model_id" UUID,
  "scored_at" TIMESTAMPTZ(6) NOT NULL,
  "score" DOUBLE PRECISION,
  "decision_function" DOUBLE PRECISION,
  "is_anomaly" BOOLEAN,
  "status" TEXT NOT NULL,
  "details" JSONB,
  CONSTRAINT "device_anomaly_predictions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_anomaly_models_device_active_unique"
ON "device_anomaly_models" ("device_id", "model_type", "feature_schema_version")
WHERE "is_active" = true;

CREATE INDEX "device_anomaly_models_device_id_idx" ON "device_anomaly_models"("device_id");
CREATE INDEX "device_anomaly_models_device_id_is_active_idx" ON "device_anomaly_models"("device_id", "is_active");

CREATE UNIQUE INDEX "device_reading_features_reading_version_unique"
ON "device_reading_features"("reading_id", "feature_schema_version");
CREATE INDEX "device_reading_features_device_id_ts_idx"
ON "device_reading_features"("device_id", "ts");
CREATE INDEX "device_reading_features_device_id_local_date_idx"
ON "device_reading_features"("device_id", "local_date");

CREATE UNIQUE INDEX "device_anomaly_predictions_reading_unique"
ON "device_anomaly_predictions"("reading_id");
CREATE INDEX "device_anomaly_predictions_device_id_scored_at_idx"
ON "device_anomaly_predictions"("device_id", "scored_at");
CREATE INDEX "device_anomaly_predictions_model_id_idx"
ON "device_anomaly_predictions"("model_id");

CREATE UNIQUE INDEX "anomaly_events_prediction_unique" ON "anomaly_events"("prediction_id");
CREATE UNIQUE INDEX "anomaly_events_reading_unique" ON "anomaly_events"("reading_id");

ALTER TABLE "device_anomaly_models"
ADD CONSTRAINT "device_anomaly_models_device_id_fkey"
FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_reading_features"
ADD CONSTRAINT "device_reading_features_reading_id_fkey"
FOREIGN KEY ("reading_id") REFERENCES "device_readings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_reading_features"
ADD CONSTRAINT "device_reading_features_device_id_fkey"
FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_anomaly_predictions"
ADD CONSTRAINT "device_anomaly_predictions_reading_id_fkey"
FOREIGN KEY ("reading_id") REFERENCES "device_readings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_anomaly_predictions"
ADD CONSTRAINT "device_anomaly_predictions_device_id_fkey"
FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_anomaly_predictions"
ADD CONSTRAINT "device_anomaly_predictions_model_id_fkey"
FOREIGN KEY ("model_id") REFERENCES "device_anomaly_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "anomaly_events"
ADD CONSTRAINT "anomaly_events_model_id_fkey"
FOREIGN KEY ("model_id") REFERENCES "device_anomaly_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "anomaly_events"
ADD CONSTRAINT "anomaly_events_prediction_id_fkey"
FOREIGN KEY ("prediction_id") REFERENCES "device_anomaly_predictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "anomaly_events"
ADD CONSTRAINT "anomaly_events_reading_id_fkey"
FOREIGN KEY ("reading_id") REFERENCES "device_readings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
