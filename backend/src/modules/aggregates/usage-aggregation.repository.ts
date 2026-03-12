import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addUtcHours(value: Date, hours: number): Date {
  return new Date(value.getTime() + (hours * 60 * 60 * 1000));
}

function normalizeLocalDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return null;
}

function addLocalDays(value: string, days: number): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export async function listAggregateEligibleDevices(options: {
  cursorId?: string | null;
  batchSize: number;
}): Promise<Array<{ id: string }>> {
  return prisma.device.findMany({
    where: {
      readings: {
        some: {},
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      id: "asc",
    },
    take: options.batchSize,
    ...(options.cursorId
      ? {
        cursor: {
          id: options.cursorId,
        },
        skip: 1,
      }
      : {}),
  });
}

async function getHourlyAggregationStart(
  tx: Prisma.TransactionClient,
  deviceId: string,
): Promise<Date | null> {
  const rows = await tx.$queryRaw<Array<{
    latest_hour_ts: Date | string | null;
    first_hour_ts: Date | string | null;
  }>>`
    WITH latest_hourly AS (
      SELECT MAX("hour_ts") AS latest_hour_ts
      FROM "device_usage_hourly"
      WHERE "device_id" = ${deviceId}
    ),
    readings AS (
      SELECT (date_trunc('hour', timezone('UTC', MIN("ts"))) AT TIME ZONE 'UTC') AS first_hour_ts
      FROM "device_readings"
      WHERE "device_id" = ${deviceId}
    )
    SELECT
      latest_hourly.latest_hour_ts,
      readings.first_hour_ts
    FROM latest_hourly, readings
  `;

  const latestHourTs = normalizeDate(rows.at(0)?.latest_hour_ts);
  if (latestHourTs) {
    return addUtcHours(latestHourTs, 1);
  }

  return normalizeDate(rows.at(0)?.first_hour_ts);
}

async function getDailyAggregationStart(
  tx: Prisma.TransactionClient,
  deviceId: string,
): Promise<string | null> {
  const rows = await tx.$queryRaw<Array<{
    latest_date: Date | string | null;
    first_local_date: Date | string | null;
  }>>`
    WITH latest_daily AS (
      SELECT MAX("date") AS latest_date
      FROM "device_usage_daily"
      WHERE "device_id" = ${deviceId}
    ),
    readings AS (
      SELECT MIN((dr."ts" AT TIME ZONE h."timezone")::date) AS first_local_date
      FROM "device_readings" dr
      JOIN "devices" d ON d."id" = dr."device_id"
      JOIN "homes" h ON h."id" = d."home_id"
      WHERE dr."device_id" = ${deviceId}
    )
    SELECT
      latest_daily.latest_date,
      readings.first_local_date
    FROM latest_daily, readings
  `;

  const latestDate = normalizeLocalDate(rows.at(0)?.latest_date);
  if (latestDate) {
    return addLocalDays(latestDate, 1);
  }

  return normalizeLocalDate(rows.at(0)?.first_local_date);
}

async function upsertHourlyDeviceUsage(
  tx: Prisma.TransactionClient,
  deviceId: string,
  startHourTs: Date,
): Promise<number> {
  return tx.$executeRaw`
    WITH hourly_source AS (
      SELECT
        dr."device_id",
        (date_trunc('hour', timezone('UTC', dr."ts")) AT TIME ZONE 'UTC') AS "hour_ts",
        COALESCE(SUM(COALESCE(dr."aenergy_delta", 0)), 0)::decimal(14,4) AS "energy_wh",
        AVG(dr."apower")::decimal(12,4) AS "avg_power_w",
        MAX(dr."apower")::decimal(12,4) AS "max_power_w",
        MIN(dr."apower")::decimal(12,4) AS "min_power_w",
        COUNT(*)::int AS "samples_count"
      FROM "device_readings" dr
      WHERE dr."device_id" = ${deviceId}
        AND dr."ts" >= ${startHourTs}
      GROUP BY
        dr."device_id",
        (date_trunc('hour', timezone('UTC', dr."ts")) AT TIME ZONE 'UTC')
    )
    INSERT INTO "device_usage_hourly" (
      "device_id",
      "hour_ts",
      "energy_wh",
      "avg_power_w",
      "max_power_w",
      "min_power_w",
      "samples_count"
    )
    SELECT
      hs."device_id",
      hs."hour_ts",
      hs."energy_wh",
      hs."avg_power_w",
      hs."max_power_w",
      hs."min_power_w",
      hs."samples_count"
    FROM hourly_source hs
    WHERE hs."hour_ts" < (date_trunc('hour', timezone('UTC', now())) AT TIME ZONE 'UTC')
    ON CONFLICT ("device_id", "hour_ts")
    DO UPDATE SET
      "energy_wh" = EXCLUDED."energy_wh",
      "avg_power_w" = EXCLUDED."avg_power_w",
      "max_power_w" = EXCLUDED."max_power_w",
      "min_power_w" = EXCLUDED."min_power_w",
      "samples_count" = EXCLUDED."samples_count"
  `;
}

async function upsertDailyDeviceUsage(
  tx: Prisma.TransactionClient,
  deviceId: string,
  startDate: string,
): Promise<number> {
  return tx.$executeRaw`
    WITH daily_source AS (
      SELECT
        dr."device_id",
        ((dr."ts" AT TIME ZONE h."timezone")::date) AS "date",
        COALESCE(SUM(COALESCE(dr."aenergy_delta", 0)), 0)::decimal(14,4) AS "energy_wh",
        AVG(dr."apower")::decimal(12,4) AS "avg_power_w",
        MAX(dr."apower")::decimal(12,4) AS "max_power_w",
        MIN(dr."apower")::decimal(12,4) AS "min_power_w",
        COUNT(*)::int AS "samples_count",
        ((now() AT TIME ZONE h."timezone")::date) AS "current_local_date"
      FROM "device_readings" dr
      JOIN "devices" d ON d."id" = dr."device_id"
      JOIN "homes" h ON h."id" = d."home_id"
      WHERE dr."device_id" = ${deviceId}
        AND ((dr."ts" AT TIME ZONE h."timezone")::date) >= ${startDate}::date
      GROUP BY
        dr."device_id",
        ((dr."ts" AT TIME ZONE h."timezone")::date),
        ((now() AT TIME ZONE h."timezone")::date)
    )
    INSERT INTO "device_usage_daily" (
      "device_id",
      "date",
      "energy_wh",
      "avg_power_w",
      "max_power_w",
      "min_power_w",
      "samples_count"
    )
    SELECT
      ds."device_id",
      ds."date",
      ds."energy_wh",
      ds."avg_power_w",
      ds."max_power_w",
      ds."min_power_w",
      ds."samples_count"
    FROM daily_source ds
    WHERE ds."date" < ds."current_local_date"
    ON CONFLICT ("device_id", "date")
    DO UPDATE SET
      "energy_wh" = EXCLUDED."energy_wh",
      "avg_power_w" = EXCLUDED."avg_power_w",
      "max_power_w" = EXCLUDED."max_power_w",
      "min_power_w" = EXCLUDED."min_power_w",
      "samples_count" = EXCLUDED."samples_count"
  `;
}

export async function aggregateDeviceUsage(deviceId: string): Promise<{
  hourlyRowsUpserted: number;
  dailyRowsUpserted: number;
}> {
  return prisma.$transaction(async (tx) => {
    const startHourTs = await getHourlyAggregationStart(tx, deviceId);
    const startDate = await getDailyAggregationStart(tx, deviceId);

    const hourlyRowsUpserted = startHourTs
      ? await upsertHourlyDeviceUsage(tx, deviceId, startHourTs)
      : 0;
    const dailyRowsUpserted = startDate
      ? await upsertDailyDeviceUsage(tx, deviceId, startDate)
      : 0;

    return {
      hourlyRowsUpserted,
      dailyRowsUpserted,
    };
  });
}
