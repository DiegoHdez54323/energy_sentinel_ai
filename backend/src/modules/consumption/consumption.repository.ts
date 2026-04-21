import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

export type ConsumptionSeriesRow = {
  ts: Date | string;
  energyWh: number | null;
  avgPowerW: number | null;
  maxPowerW: number | null;
  minPowerW: number | null;
  samplesCount: number | null;
};

export type HomeConsumptionBreakdownRow = {
  deviceId: string;
  energyWh: number | null;
  name: string;
};

function normalizeRows(rows: ConsumptionSeriesRow[]) {
  return rows.map((row) => ({
    ts: row.ts instanceof Date ? row.ts.toISOString() : new Date(row.ts).toISOString(),
    energyWh: row.energyWh ?? 0,
    avgPowerW: row.avgPowerW ?? null,
    maxPowerW: row.maxPowerW ?? null,
    minPowerW: row.minPowerW ?? null,
    samplesCount: row.samplesCount ?? 0,
  }));
}

export async function getDeviceTimezone(deviceId: string): Promise<string | null> {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: {
      home: {
        select: {
          timezone: true,
        },
      },
    },
  });

  return device?.home.timezone ?? null;
}

export async function listDeviceRawConsumption(options: {
  deviceId: string;
  from: Date;
  to: Date;
}) {
  const rows = await prisma.$queryRaw<ConsumptionSeriesRow[]>`
    SELECT
      dr."ts" AS "ts",
      COALESCE(dr."aenergy_delta", 0)::double precision AS "energyWh",
      dr."apower"::double precision AS "avgPowerW",
      dr."apower"::double precision AS "maxPowerW",
      dr."apower"::double precision AS "minPowerW",
      1::int AS "samplesCount"
    FROM "device_readings" dr
    WHERE dr."device_id" = ${options.deviceId}
      AND dr."ts" >= ${options.from}
      AND dr."ts" < ${options.to}
    ORDER BY dr."ts" ASC
  `;

  return normalizeRows(rows);
}

export async function listDeviceHourlyConsumption(options: {
  deviceId: string;
  from: Date;
  to: Date;
}) {
  const rows = await prisma.$queryRaw<ConsumptionSeriesRow[]>`
    SELECT
      du."hour_ts" AS "ts",
      du."energy_wh"::double precision AS "energyWh",
      du."avg_power_w"::double precision AS "avgPowerW",
      du."max_power_w"::double precision AS "maxPowerW",
      du."min_power_w"::double precision AS "minPowerW",
      du."samples_count"::int AS "samplesCount"
    FROM "device_usage_hourly" du
    WHERE du."device_id" = ${options.deviceId}
      AND du."hour_ts" >= ${options.from}
      AND du."hour_ts" < ${options.to}
    ORDER BY du."hour_ts" ASC
  `;

  return normalizeRows(rows);
}

export async function listDeviceDailyConsumption(options: {
  deviceId: string;
  from: Date;
  to: Date;
}) {
  const rows = await prisma.$queryRaw<ConsumptionSeriesRow[]>`
    SELECT
      ((du."date"::timestamp) AT TIME ZONE h."timezone") AS "ts",
      du."energy_wh"::double precision AS "energyWh",
      du."avg_power_w"::double precision AS "avgPowerW",
      du."max_power_w"::double precision AS "maxPowerW",
      du."min_power_w"::double precision AS "minPowerW",
      du."samples_count"::int AS "samplesCount"
    FROM "device_usage_daily" du
    JOIN "devices" d ON d."id" = du."device_id"
    JOIN "homes" h ON h."id" = d."home_id"
    WHERE du."device_id" = ${options.deviceId}
      AND ((du."date"::timestamp) AT TIME ZONE h."timezone") >= ${options.from}
      AND ((du."date"::timestamp) AT TIME ZONE h."timezone") < ${options.to}
    ORDER BY du."date" ASC
  `;

  return normalizeRows(rows);
}

export async function listHomeHourlyConsumption(options: {
  homeId: string;
  from: Date;
  to: Date;
}) {
  const rows = await prisma.$queryRaw<ConsumptionSeriesRow[]>`
    SELECT
      du."hour_ts" AS "ts",
      COALESCE(SUM(du."energy_wh"), 0)::double precision AS "energyWh",
      (
        CASE
          WHEN SUM(CASE WHEN du."avg_power_w" IS NOT NULL THEN du."samples_count" ELSE 0 END) > 0
            THEN (
              SUM(du."avg_power_w" * du."samples_count")
              / SUM(CASE WHEN du."avg_power_w" IS NOT NULL THEN du."samples_count" ELSE 0 END)
            )::double precision
          ELSE NULL
        END
      ) AS "avgPowerW",
      MAX(du."max_power_w")::double precision AS "maxPowerW",
      MIN(du."min_power_w")::double precision AS "minPowerW",
      SUM(du."samples_count")::int AS "samplesCount"
    FROM "device_usage_hourly" du
    JOIN "devices" d ON d."id" = du."device_id"
    WHERE d."home_id" = ${options.homeId}
      AND du."hour_ts" >= ${options.from}
      AND du."hour_ts" < ${options.to}
    GROUP BY du."hour_ts"
    ORDER BY du."hour_ts" ASC
  `;

  return normalizeRows(rows);
}

export async function listHomeDailyConsumption(options: {
  homeId: string;
  from: Date;
  to: Date;
}) {
  const rows = await prisma.$queryRaw<ConsumptionSeriesRow[]>`
    SELECT
      ((du."date"::timestamp) AT TIME ZONE h."timezone") AS "ts",
      COALESCE(SUM(du."energy_wh"), 0)::double precision AS "energyWh",
      (
        CASE
          WHEN SUM(CASE WHEN du."avg_power_w" IS NOT NULL THEN du."samples_count" ELSE 0 END) > 0
            THEN (
              SUM(du."avg_power_w" * du."samples_count")
              / SUM(CASE WHEN du."avg_power_w" IS NOT NULL THEN du."samples_count" ELSE 0 END)
            )::double precision
          ELSE NULL
        END
      ) AS "avgPowerW",
      MAX(du."max_power_w")::double precision AS "maxPowerW",
      MIN(du."min_power_w")::double precision AS "minPowerW",
      SUM(du."samples_count")::int AS "samplesCount"
    FROM "device_usage_daily" du
    JOIN "devices" d ON d."id" = du."device_id"
    JOIN "homes" h ON h."id" = d."home_id"
    WHERE d."home_id" = ${options.homeId}
      AND ((du."date"::timestamp) AT TIME ZONE h."timezone") >= ${options.from}
      AND ((du."date"::timestamp) AT TIME ZONE h."timezone") < ${options.to}
    GROUP BY du."date", h."timezone"
    ORDER BY du."date" ASC
  `;

  return normalizeRows(rows);
}

function normalizeBreakdownRows(rows: HomeConsumptionBreakdownRow[]) {
  return rows.map((row) => ({
    deviceId: row.deviceId,
    energyWh: row.energyWh ?? 0,
    name: row.name,
  }));
}

export async function listHomeHourlyConsumptionBreakdown(options: {
  homeId: string;
  from: Date;
  to: Date;
}) {
  const rows = await prisma.$queryRaw<HomeConsumptionBreakdownRow[]>`
    SELECT
      d."id" AS "deviceId",
      d."display_name" AS "name",
      COALESCE(SUM(du."energy_wh"), 0)::double precision AS "energyWh"
    FROM "devices" d
    JOIN "device_usage_hourly" du ON du."device_id" = d."id"
    WHERE d."home_id" = ${options.homeId}
      AND du."hour_ts" >= ${options.from}
      AND du."hour_ts" < ${options.to}
    GROUP BY d."id", d."display_name"
    HAVING COALESCE(SUM(du."energy_wh"), 0) > 0
    ORDER BY "energyWh" DESC, d."display_name" ASC
  `;

  return normalizeBreakdownRows(rows);
}

export async function listHomeDailyConsumptionBreakdown(options: {
  homeId: string;
  from: Date;
  to: Date;
}) {
  const rows = await prisma.$queryRaw<HomeConsumptionBreakdownRow[]>`
    SELECT
      d."id" AS "deviceId",
      d."display_name" AS "name",
      COALESCE(SUM(du."energy_wh"), 0)::double precision AS "energyWh"
    FROM "devices" d
    JOIN "homes" h ON h."id" = d."home_id"
    JOIN "device_usage_daily" du ON du."device_id" = d."id"
    WHERE d."home_id" = ${options.homeId}
      AND ((du."date"::timestamp) AT TIME ZONE h."timezone") >= ${options.from}
      AND ((du."date"::timestamp) AT TIME ZONE h."timezone") < ${options.to}
    GROUP BY d."id", d."display_name"
    HAVING COALESCE(SUM(du."energy_wh"), 0) > 0
    ORDER BY "energyWh" DESC, d."display_name" ASC
  `;

  return normalizeBreakdownRows(rows);
}
