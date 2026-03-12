ALTER TABLE "device_usage_hourly"
ADD COLUMN "min_power_w" DECIMAL(12,4);

ALTER TABLE "device_usage_daily"
ADD COLUMN "min_power_w" DECIMAL(12,4);
