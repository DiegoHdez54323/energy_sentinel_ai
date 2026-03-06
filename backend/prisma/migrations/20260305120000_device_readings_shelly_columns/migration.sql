ALTER TABLE "device_readings"
RENAME COLUMN "power_w" TO "apower";

ALTER TABLE "device_readings"
RENAME COLUMN "voltage_v" TO "voltage";

ALTER TABLE "device_readings"
RENAME COLUMN "current_a" TO "current";

ALTER TABLE "device_readings"
RENAME COLUMN "relay_on" TO "output";

ALTER TABLE "device_readings"
RENAME COLUMN "energy_wh" TO "aenergy_total";

ALTER TABLE "device_readings"
RENAME COLUMN "energy_delta_wh" TO "aenergy_delta";

ALTER TABLE "device_readings"
RENAME COLUMN "energy_minute_ts" TO "aenergy_minute_ts";

ALTER TABLE "device_readings"
RENAME COLUMN "energy_by_minute_wh" TO "aenergy_by_minute";

ALTER TABLE "device_readings"
DROP COLUMN "pf",
DROP COLUMN "raw_payload",
ADD COLUMN "freq" DECIMAL(8,4),
ADD COLUMN "ret_aenergy_total" DECIMAL(12,4),
ADD COLUMN "ret_aenergy_minute_ts" BIGINT,
ADD COLUMN "ret_aenergy_by_minute" JSONB,
ADD COLUMN "temperature_tc" DECIMAL(8,4),
ADD COLUMN "temperature_tf" DECIMAL(8,4);
