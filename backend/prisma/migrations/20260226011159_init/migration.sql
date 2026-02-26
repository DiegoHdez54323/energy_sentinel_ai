/*
  Warnings:

  - You are about to drop the `Home` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Home" DROP CONSTRAINT "Home_userId_fkey";

-- DropTable
DROP TABLE "Home";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "homes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shelly_integrations" (
    "id" UUID NOT NULL,
    "home_id" UUID NOT NULL,
    "client_id" TEXT NOT NULL DEFAULT 'shelly-diy',
    "user_api_url" TEXT NOT NULL,
    "auth_code" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_sync_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shelly_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "home_id" UUID NOT NULL,
    "vendor" TEXT NOT NULL,
    "model" TEXT,
    "display_name" TEXT NOT NULL,
    "ip_address" INET,
    "mac_address" TEXT,
    "external_device_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_seen_at" TIMESTAMPTZ(6),
    "data_source" TEXT NOT NULL DEFAULT 'shelly_cloud',
    "telemetry_config" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_readings" (
    "id" BIGSERIAL NOT NULL,
    "device_id" UUID NOT NULL,
    "ts" TIMESTAMPTZ(6) NOT NULL,
    "power_w" DECIMAL(12,4),
    "voltage_v" DECIMAL(12,4),
    "current_a" DECIMAL(12,4),
    "pf" DECIMAL(8,4),
    "relay_on" BOOLEAN,
    "energy_wh" DECIMAL(12,4),
    "energy_delta_wh" DECIMAL(12,4),
    "energy_minute_ts" BIGINT,
    "energy_by_minute_wh" JSONB,
    "source" TEXT NOT NULL DEFAULT 'shelly_cloud',
    "raw_payload" JSONB,

    CONSTRAINT "device_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_usage_hourly" (
    "id" BIGSERIAL NOT NULL,
    "device_id" UUID NOT NULL,
    "hour_ts" TIMESTAMPTZ(6) NOT NULL,
    "energy_wh" DECIMAL(14,4) NOT NULL,
    "avg_power_w" DECIMAL(12,4),
    "max_power_w" DECIMAL(12,4),
    "samples_count" INTEGER NOT NULL,

    CONSTRAINT "device_usage_hourly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_usage_daily" (
    "id" BIGSERIAL NOT NULL,
    "device_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "energy_wh" DECIMAL(14,4) NOT NULL,
    "avg_power_w" DECIMAL(12,4),
    "max_power_w" DECIMAL(12,4),
    "samples_count" INTEGER NOT NULL,

    CONSTRAINT "device_usage_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_baselines" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "baseline_type" TEXT NOT NULL,
    "window_days" INTEGER NOT NULL DEFAULT 14,
    "model_version" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "trained_from" TIMESTAMPTZ(6) NOT NULL,
    "trained_to" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_events" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "detected_at" TIMESTAMPTZ(6) NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "window_end" TIMESTAMPTZ(6) NOT NULL,
    "anomaly_type" TEXT NOT NULL,
    "severity" SMALLINT NOT NULL,
    "score" DECIMAL(12,4),
    "expected_value" DECIMAL(12,4),
    "observed_value" DECIMAL(12,4),
    "details" JSONB,

    CONSTRAINT "anomaly_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_push_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "anomaly_event_id" UUID,
    "sent_at" TIMESTAMPTZ(6) NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'fcm',
    "status" TEXT NOT NULL,
    "error_message" TEXT,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "homes_user_id_idx" ON "homes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "shelly_integrations_home_id_key" ON "shelly_integrations"("home_id");

-- CreateIndex
CREATE INDEX "devices_home_id_idx" ON "devices"("home_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_home_vendor_external_unique" ON "devices"("home_id", "vendor", "external_device_id");

-- CreateIndex
CREATE INDEX "device_readings_device_id_ts_idx" ON "device_readings"("device_id", "ts");

-- CreateIndex
CREATE INDEX "device_usage_hourly_device_id_idx" ON "device_usage_hourly"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_usage_hourly_device_hour_unique" ON "device_usage_hourly"("device_id", "hour_ts");

-- CreateIndex
CREATE INDEX "device_usage_daily_device_id_idx" ON "device_usage_daily"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_usage_daily_device_date_unique" ON "device_usage_daily"("device_id", "date");

-- CreateIndex
CREATE INDEX "device_baselines_device_id_idx" ON "device_baselines"("device_id");

-- CreateIndex
CREATE INDEX "anomaly_events_device_id_detected_at_idx" ON "anomaly_events"("device_id", "detected_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_push_tokens_token_key" ON "user_push_tokens"("token");

-- CreateIndex
CREATE INDEX "user_push_tokens_user_id_idx" ON "user_push_tokens"("user_id");

-- CreateIndex
CREATE INDEX "notification_logs_user_id_sent_at_idx" ON "notification_logs"("user_id", "sent_at");

-- CreateIndex
CREATE INDEX "notification_logs_anomaly_event_id_idx" ON "notification_logs"("anomaly_event_id");

-- AddForeignKey
ALTER TABLE "homes" ADD CONSTRAINT "homes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shelly_integrations" ADD CONSTRAINT "shelly_integrations_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_readings" ADD CONSTRAINT "device_readings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_usage_hourly" ADD CONSTRAINT "device_usage_hourly_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_usage_daily" ADD CONSTRAINT "device_usage_daily_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_baselines" ADD CONSTRAINT "device_baselines_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_push_tokens" ADD CONSTRAINT "user_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_anomaly_event_id_fkey" FOREIGN KEY ("anomaly_event_id") REFERENCES "anomaly_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
