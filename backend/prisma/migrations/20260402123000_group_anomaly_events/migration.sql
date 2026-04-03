ALTER TABLE "device_anomaly_predictions"
ADD COLUMN "anomaly_event_id" UUID;

ALTER TABLE "anomaly_events"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'open',
ADD COLUMN "readings_count" INTEGER NOT NULL DEFAULT 1;

UPDATE "anomaly_events"
SET "status" = 'closed',
    "readings_count" = 1;

UPDATE "device_anomaly_predictions" dap
SET "anomaly_event_id" = ae."id"
FROM "anomaly_events" ae
WHERE ae."prediction_id" = dap."id";

ALTER TABLE "device_anomaly_predictions"
ADD CONSTRAINT "device_anomaly_predictions_anomaly_event_id_fkey"
FOREIGN KEY ("anomaly_event_id") REFERENCES "anomaly_events"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "device_anomaly_predictions_anomaly_event_id_idx"
ON "device_anomaly_predictions"("anomaly_event_id");

CREATE INDEX "anomaly_events_device_id_status_detected_at_idx"
ON "anomaly_events"("device_id", "status", "detected_at");

CREATE UNIQUE INDEX "anomaly_events_device_open_unique"
ON "anomaly_events"("device_id")
WHERE "status" = 'open';
