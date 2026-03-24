import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import {
  DEVICE_BASELINE_GRANULARITY,
  DEVICE_BASELINE_METRIC,
  DEVICE_BASELINE_MODEL_VERSION,
  DEVICE_BASELINE_PROFILE_SHAPE,
  type DeviceBaselineBucketInput,
  type DeviceBaselineDayGroup,
} from "./device-baseline.types.js";

export async function getDeviceBaselineTimezone(deviceId: string): Promise<string | null> {
  const device = await prisma.device.findUnique({
    where: {
      id: deviceId,
    },
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

export async function listRecentDeviceUsageDailyDates(
  deviceId: string,
  take: number,
): Promise<Date[]> {
  const rows = await prisma.deviceUsageDaily.findMany({
    where: {
      deviceId,
    },
    select: {
      date: true,
    },
    orderBy: {
      date: "desc",
    },
    take,
  });

  return rows.map((row) => row.date);
}

export async function getActiveDeviceBaseline(deviceId: string) {
  return prisma.deviceBaseline.findFirst({
    where: {
      deviceId,
      metric: DEVICE_BASELINE_METRIC,
      granularity: DEVICE_BASELINE_GRANULARITY,
      profileShape: DEVICE_BASELINE_PROFILE_SHAPE,
      isActive: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      timezone: true,
      sourceEndDate: true,
      windowDays: true,
      minBucketSamples: true,
      modelVersion: true,
    },
  });
}

export async function listTrainingHourlyRows(
  deviceId: string,
  startDate: string,
  endDate: string,
): Promise<Array<{
  dayGroup: DeviceBaselineDayGroup;
  localHour: number;
  energyWh: number;
}>> {
  const rows = await prisma.$queryRaw<Array<{
    day_group: DeviceBaselineDayGroup;
    local_hour: number;
    energy_wh: Prisma.Decimal | string | number;
  }>>`
    SELECT
      CASE
        WHEN EXTRACT(ISODOW FROM (duh."hour_ts" AT TIME ZONE h."timezone")) IN (6, 7) THEN 'weekend'
        ELSE 'weekday'
      END AS "day_group",
      EXTRACT(HOUR FROM (duh."hour_ts" AT TIME ZONE h."timezone"))::int AS "local_hour",
      duh."energy_wh" AS "energy_wh"
    FROM "device_usage_hourly" duh
    JOIN "devices" d ON d."id" = duh."device_id"
    JOIN "homes" h ON h."id" = d."home_id"
    WHERE duh."device_id" = ${deviceId}
      AND ((duh."hour_ts" AT TIME ZONE h."timezone")::date) BETWEEN ${startDate}::date AND ${endDate}::date
  `;

  return rows.map((row) => ({
    dayGroup: row.day_group,
    localHour: row.local_hour,
    energyWh: toNumber(row.energy_wh),
  }));
}

export async function replaceActiveDeviceBaseline(input: {
  deviceId: string;
  timezone: string;
  windowDays: number;
  sourceStartDate: Date;
  sourceEndDate: Date;
  historyDaysUsed: number;
  minBucketSamples: number;
  summary: Prisma.InputJsonValue;
  buckets: DeviceBaselineBucketInput[];
}): Promise<{ baselineId: string; bucketsCreated: number }> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await tx.deviceBaseline.updateMany({
      where: {
        deviceId: input.deviceId,
        metric: DEVICE_BASELINE_METRIC,
        granularity: DEVICE_BASELINE_GRANULARITY,
        profileShape: DEVICE_BASELINE_PROFILE_SHAPE,
        isActive: true,
      },
      data: {
        isActive: false,
        supersededAt: now,
      },
    });

    const baseline = await tx.deviceBaseline.create({
      data: {
        deviceId: input.deviceId,
        metric: DEVICE_BASELINE_METRIC,
        granularity: DEVICE_BASELINE_GRANULARITY,
        profileShape: DEVICE_BASELINE_PROFILE_SHAPE,
        windowDays: input.windowDays,
        modelVersion: DEVICE_BASELINE_MODEL_VERSION,
        timezone: input.timezone,
        sourceStartDate: input.sourceStartDate,
        sourceEndDate: input.sourceEndDate,
        historyDaysUsed: input.historyDaysUsed,
        minBucketSamples: input.minBucketSamples,
        params: {
          trainingSource: "device_usage_hourly",
          percentileMethod: "linear_interpolation",
        },
        summary: input.summary,
      },
      select: {
        id: true,
      },
    });

    await tx.deviceBaselineBucket.createMany({
      data: input.buckets.map((bucket) => ({
        baselineId: baseline.id,
        dayGroup: bucket.dayGroup,
        localHour: bucket.localHour,
        sampleCount: bucket.sampleCount,
        expectedEnergyWh: bucket.expectedEnergyWh,
        lowerBoundEnergyWh: bucket.lowerBoundEnergyWh,
        upperBoundEnergyWh: bucket.upperBoundEnergyWh,
      })),
    });

    return {
      baselineId: baseline.id,
      bucketsCreated: input.buckets.length,
    };
  });
}

function toNumber(value: Prisma.Decimal | string | number): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return value.toNumber();
}
