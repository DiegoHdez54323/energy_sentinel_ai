/*
  Warnings:

  - You are about to drop the column `model` on the `devices` table. All the data in the column will be lost.
  - You are about to drop the column `telemetry_config` on the `devices` table. All the data in the column will be lost.
  - You are about to drop the column `home_id` on the `shelly_integrations` table. All the data in the column will be lost.
  - You are about to drop the column `refresh_token` on the `shelly_integrations` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[device_id,anomaly_type,window_start,window_end]` on the table `anomaly_events` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[device_id,ts]` on the table `device_readings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id,vendor,external_device_id]` on the table `devices` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id]` on the table `shelly_integrations` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `user_id` to the `devices` table without a default value. This is not possible if the table is not empty.
  - Made the column `external_device_id` on table `devices` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `user_id` to the `shelly_integrations` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "shelly_integrations" DROP CONSTRAINT "shelly_integrations_home_id_fkey";

-- DropIndex
DROP INDEX "devices_home_vendor_external_unique";

-- DropIndex
DROP INDEX "shelly_integrations_home_id_key";

-- AlterTable
ALTER TABLE "anomaly_events" ADD COLUMN     "baseline_id" UUID;

-- AlterTable
ALTER TABLE "device_baselines" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "devices" DROP COLUMN "model",
DROP COLUMN "telemetry_config",
ADD COLUMN     "device_code" TEXT,
ADD COLUMN     "user_id" UUID NOT NULL,
ALTER COLUMN "external_device_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "shelly_integrations" DROP COLUMN "home_id",
DROP COLUMN "refresh_token",
ADD COLUMN     "user_id" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "anomaly_events_device_type_window_unique" ON "anomaly_events"("device_id", "anomaly_type", "window_start", "window_end");

-- CreateIndex
CREATE INDEX "device_baselines_device_id_is_active_idx" ON "device_baselines"("device_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "device_readings_device_ts_unique" ON "device_readings"("device_id", "ts");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_user_vendor_external_unique" ON "devices"("user_id", "vendor", "external_device_id");

-- CreateIndex
CREATE UNIQUE INDEX "shelly_integrations_user_id_key" ON "shelly_integrations"("user_id");

-- AddForeignKey
ALTER TABLE "shelly_integrations" ADD CONSTRAINT "shelly_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_baseline_id_fkey" FOREIGN KEY ("baseline_id") REFERENCES "device_baselines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
