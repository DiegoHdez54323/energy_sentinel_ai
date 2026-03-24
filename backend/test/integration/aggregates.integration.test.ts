import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma.js";
import { runDeviceUsageAggregationOnce } from "../../src/modules/aggregates/aggregates.service.js";

function asNumber(value: { toString: () => string } | number | null): number | null {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

function startOfUtcHour(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    0,
    0,
    0,
  ));
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + (hours * 60 * 60 * 1000));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000));
}

function formatLocalDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Unable to format local date for timezone ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

function findPreviousLocalDayTimestamp(now: Date, timeZone: string): Date {
  const currentLocalDate = formatLocalDate(now, timeZone);
  let probe = new Date(now.getTime() - (60 * 60 * 1000));

  while (formatLocalDate(probe, timeZone) === currentLocalDate) {
    probe = new Date(probe.getTime() - (60 * 60 * 1000));
  }

  return probe;
}

async function seedDevice(options: {
  suffix: string;
  timezone: string;
}) {
  const user = await prisma.user.create({
    data: {
      email: `agg-it-${options.suffix}@example.com`,
      passwordHash: "hash",
      name: "Aggregate Test",
    },
  });

  const home = await prisma.home.create({
    data: {
      userId: user.id,
      name: `home-${options.suffix}`,
      timezone: options.timezone,
    },
  });

  const device = await prisma.device.create({
    data: {
      userId: user.id,
      homeId: home.id,
      vendor: "shelly",
      displayName: `device-${options.suffix}`,
      externalDeviceId: `ext-${options.suffix}`,
      status: "active",
      dataSource: "shelly_cloud",
    },
  });

  return { user, home, device };
}

async function seedBaselineEligibilityReading(deviceId: string) {
  await prisma.deviceReading.create({
    data: {
      deviceId,
      ts: new Date(),
      apower: 1,
      aenergyDelta: 1,
      source: "shelly_cloud",
    },
  });
}

async function seedBaselineHistory(options: {
  deviceId: string;
  startDate: string;
  days: number;
  missingDayIndexes?: number[];
}) {
  const missingDayIndexes = new Set(options.missingDayIndexes ?? []);
  const start = new Date(`${options.startDate}T00:00:00.000Z`);
  const hourlyRows: Array<{
    deviceId: string;
    hourTs: Date;
    energyWh: number;
    avgPowerW: number;
    maxPowerW: number;
    minPowerW: number;
    samplesCount: number;
  }> = [];
  const dailyRows: Array<{
    deviceId: string;
    date: Date;
    energyWh: number;
    avgPowerW: number;
    maxPowerW: number;
    minPowerW: number;
    samplesCount: number;
  }> = [];

  for (let dayIndex = 0; dayIndex < options.days; dayIndex += 1) {
    if (missingDayIndexes.has(dayIndex)) {
      continue;
    }

    const date = addDays(start, dayIndex);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    const base = weekend ? 200 : 100;
    let totalEnergy = 0;

    for (let hour = 0; hour < 24; hour += 1) {
      const energy = base + hour;
      totalEnergy += energy;

      hourlyRows.push({
        deviceId: options.deviceId,
        hourTs: new Date(Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate(),
          hour,
          0,
          0,
          0,
        )),
        energyWh: energy,
        avgPowerW: energy,
        maxPowerW: energy,
        minPowerW: energy,
        samplesCount: 1,
      });
    }

    dailyRows.push({
      deviceId: options.deviceId,
      date,
      energyWh: totalEnergy,
      avgPowerW: totalEnergy / 24,
      maxPowerW: base + 23,
      minPowerW: base,
      samplesCount: 24,
    });
  }

  await prisma.deviceUsageHourly.createMany({
    data: hourlyRows,
  });
  await prisma.deviceUsageDaily.createMany({
    data: dailyRows,
  });
}

test.beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "agg-it-" } } });
});

test.afterEach(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "agg-it-" } } });
});

test.after(async () => {
  await prisma.$disconnect();
});

test("runDeviceUsageAggregationOnce hace backfill de buckets cerrados hourly y daily", async () => {
  const suffix = `${Date.now()}-a`;
  const { device } = await seedDevice({
    suffix,
    timezone: "America/Mexico_City",
  });

  await prisma.deviceReading.createMany({
    data: [
      {
        deviceId: device.id,
        ts: new Date("2026-03-09T05:10:00.000Z"),
        apower: 100,
        aenergyDelta: 10,
        source: "shelly_cloud",
      },
      {
        deviceId: device.id,
        ts: new Date("2026-03-09T05:50:00.000Z"),
        apower: 50,
        aenergyDelta: 5,
        source: "shelly_cloud",
      },
      {
        deviceId: device.id,
        ts: new Date("2026-03-10T06:10:00.000Z"),
        apower: 150,
        aenergyDelta: 20,
        source: "shelly_cloud",
      },
    ],
  });

  const stats = await runDeviceUsageAggregationOnce();
  assert.equal(stats.devicesProcessed >= 1, true);
  assert.equal(stats.hourlyRowsUpserted >= 2, true);
  assert.equal(stats.dailyRowsUpserted >= 2, true);

  const hourly = await prisma.deviceUsageHourly.findMany({
    where: { deviceId: device.id },
    orderBy: { hourTs: "asc" },
  });
  assert.equal(hourly.length, 2);
  assert.equal(hourly[0]?.hourTs.toISOString(), "2026-03-09T05:00:00.000Z");
  assert.equal(asNumber(hourly[0]?.energyWh ?? null), 15);
  assert.equal(asNumber(hourly[0]?.avgPowerW ?? null), 75);
  assert.equal(asNumber(hourly[0]?.maxPowerW ?? null), 100);
  assert.equal(asNumber(hourly[0]?.minPowerW ?? null), 50);
  assert.equal(hourly[0]?.samplesCount, 2);
  assert.equal(hourly[1]?.hourTs.toISOString(), "2026-03-10T06:00:00.000Z");
  assert.equal(asNumber(hourly[1]?.energyWh ?? null), 20);
  assert.equal(asNumber(hourly[1]?.avgPowerW ?? null), 150);
  assert.equal(asNumber(hourly[1]?.maxPowerW ?? null), 150);
  assert.equal(asNumber(hourly[1]?.minPowerW ?? null), 150);
  assert.equal(hourly[1]?.samplesCount, 1);

  const daily = await prisma.deviceUsageDaily.findMany({
    where: { deviceId: device.id },
    orderBy: { date: "asc" },
  });
  assert.equal(daily.length, 2);
  assert.equal(daily[0]?.date.toISOString().slice(0, 10), "2026-03-08");
  assert.equal(asNumber(daily[0]?.energyWh ?? null), 15);
  assert.equal(asNumber(daily[0]?.avgPowerW ?? null), 75);
  assert.equal(asNumber(daily[0]?.maxPowerW ?? null), 100);
  assert.equal(asNumber(daily[0]?.minPowerW ?? null), 50);
  assert.equal(daily[0]?.samplesCount, 2);
  assert.equal(daily[1]?.date.toISOString().slice(0, 10), "2026-03-10");
  assert.equal(asNumber(daily[1]?.energyWh ?? null), 20);
  assert.equal(asNumber(daily[1]?.avgPowerW ?? null), 150);
  assert.equal(asNumber(daily[1]?.maxPowerW ?? null), 150);
  assert.equal(asNumber(daily[1]?.minPowerW ?? null), 150);
  assert.equal(daily[1]?.samplesCount, 1);
});

test("runDeviceUsageAggregationOnce no materializa la hora UTC actual ni el dia local actual", async () => {
  const suffix = `${Date.now()}-b`;
  const timezone = "America/Mexico_City";
  const { device } = await seedDevice({
    suffix,
    timezone,
  });

  const now = new Date();
  const currentHourStart = startOfUtcHour(now);
  const closedHourReadingTs = addHours(currentHourStart, -2);
  const currentHourReadingTs = new Date(now.getTime() - (2 * 60 * 1000));
  const previousLocalDayReadingTs = findPreviousLocalDayTimestamp(now, timezone);
  const currentLocalDayReadingTs = new Date(now.getTime() - (60 * 1000));

  await prisma.deviceReading.createMany({
    data: [
      {
        deviceId: device.id,
        ts: closedHourReadingTs,
        apower: 80,
        aenergyDelta: 8,
        source: "shelly_cloud",
      },
      {
        deviceId: device.id,
        ts: currentHourReadingTs,
        apower: 40,
        aenergyDelta: 4,
        source: "shelly_cloud",
      },
      {
        deviceId: device.id,
        ts: previousLocalDayReadingTs,
        apower: 20,
        aenergyDelta: 2,
        source: "shelly_cloud",
      },
      {
        deviceId: device.id,
        ts: currentLocalDayReadingTs,
        apower: 10,
        aenergyDelta: 1,
        source: "shelly_cloud",
      },
    ],
  });

  await runDeviceUsageAggregationOnce();

  const hourly = await prisma.deviceUsageHourly.findMany({
    where: { deviceId: device.id },
    orderBy: { hourTs: "asc" },
  });
  const currentHourIso = currentHourStart.toISOString();
  assert.equal(hourly.some((row) => row.hourTs.toISOString() === currentHourIso), false);
  assert.equal(hourly.some((row) => row.hourTs.toISOString() === closedHourReadingTs.toISOString()), true);

  const daily = await prisma.deviceUsageDaily.findMany({
    where: { deviceId: device.id },
    orderBy: { date: "asc" },
  });
  const currentLocalDate = formatLocalDate(now, timezone);
  const previousLocalDate = formatLocalDate(previousLocalDayReadingTs, timezone);
  assert.equal(daily.some((row) => row.date.toISOString().slice(0, 10) === currentLocalDate), false);
  assert.equal(daily.some((row) => row.date.toISOString().slice(0, 10) === previousLocalDate), true);
});

test("runDeviceUsageAggregationOnce es idempotente para buckets cerrados ya materializados", async () => {
  const suffix = `${Date.now()}-c`;
  const { device } = await seedDevice({
    suffix,
    timezone: "UTC",
  });

  await prisma.deviceReading.createMany({
    data: [
      {
        deviceId: device.id,
        ts: new Date("2026-03-09T10:05:00.000Z"),
        apower: 100,
        aenergyDelta: 10,
        source: "shelly_cloud",
      },
      {
        deviceId: device.id,
        ts: new Date("2026-03-09T10:35:00.000Z"),
        apower: 40,
        aenergyDelta: 5,
        source: "shelly_cloud",
      },
    ],
  });

  await runDeviceUsageAggregationOnce();

  const firstHourly = await prisma.deviceUsageHourly.findMany({
    where: { deviceId: device.id },
  });
  const firstDaily = await prisma.deviceUsageDaily.findMany({
    where: { deviceId: device.id },
  });

  await runDeviceUsageAggregationOnce();

  const secondHourly = await prisma.deviceUsageHourly.findMany({
    where: { deviceId: device.id },
  });
  const secondDaily = await prisma.deviceUsageDaily.findMany({
    where: { deviceId: device.id },
  });

  assert.equal(firstHourly.length, 1);
  assert.equal(secondHourly.length, 1);
  assert.equal(asNumber(secondHourly[0]?.energyWh ?? null), 15);
  assert.equal(asNumber(secondHourly[0]?.avgPowerW ?? null), 70);
  assert.equal(asNumber(secondHourly[0]?.maxPowerW ?? null), 100);
  assert.equal(asNumber(secondHourly[0]?.minPowerW ?? null), 40);
  assert.equal(secondHourly[0]?.samplesCount, 2);

  assert.equal(firstDaily.length, 1);
  assert.equal(secondDaily.length, 1);
  assert.equal(asNumber(secondDaily[0]?.energyWh ?? null), 15);
  assert.equal(asNumber(secondDaily[0]?.avgPowerW ?? null), 70);
  assert.equal(asNumber(secondDaily[0]?.maxPowerW ?? null), 100);
  assert.equal(asNumber(secondDaily[0]?.minPowerW ?? null), 40);
  assert.equal(secondDaily[0]?.samplesCount, 2);
});

test("runDeviceUsageAggregationOnce sigue procesando otros devices si uno falla", async () => {
  const validSuffix = `${Date.now()}-d-ok`;
  const invalidSuffix = `${Date.now()}-d-bad`;
  const { device: validDevice } = await seedDevice({
    suffix: validSuffix,
    timezone: "UTC",
  });
  const { device: invalidDevice } = await seedDevice({
    suffix: invalidSuffix,
    timezone: "Invalid/Timezone",
  });

  await prisma.deviceReading.createMany({
    data: [
      {
        deviceId: validDevice.id,
        ts: new Date("2026-03-10T12:00:00.000Z"),
        apower: 20,
        aenergyDelta: 2,
        source: "shelly_cloud",
      },
      {
        deviceId: invalidDevice.id,
        ts: new Date("2026-03-10T12:00:00.000Z"),
        apower: 30,
        aenergyDelta: 3,
        source: "shelly_cloud",
      },
    ],
  });

  const stats = await runDeviceUsageAggregationOnce({
    batchSize: 10,
  });

  assert.equal(stats.devicesProcessed >= 1, true);
  assert.equal(stats.devicesFailed >= 1, true);

  const validHourly = await prisma.deviceUsageHourly.findMany({
    where: { deviceId: validDevice.id },
  });
  const validDaily = await prisma.deviceUsageDaily.findMany({
    where: { deviceId: validDevice.id },
  });
  const invalidHourly = await prisma.deviceUsageHourly.findMany({
    where: { deviceId: invalidDevice.id },
  });
  const invalidDaily = await prisma.deviceUsageDaily.findMany({
    where: { deviceId: invalidDevice.id },
  });

  assert.equal(validHourly.length, 1);
  assert.equal(validDaily.length, 1);
  assert.equal(invalidHourly.length, 0);
  assert.equal(invalidDaily.length, 0);
});

test("runDeviceUsageAggregationOnce activa baseline con 14 dias cerrados contiguos", async () => {
  const suffix = `${Date.now()}-e`;
  const { device } = await seedDevice({
    suffix,
    timezone: "UTC",
  });

  await seedBaselineEligibilityReading(device.id);
  await seedBaselineHistory({
    deviceId: device.id,
    startDate: "2026-03-02",
    days: 14,
  });

  const stats = await runDeviceUsageAggregationOnce({
    enableBaseline: true,
  });

  assert.equal(stats.baselineDevicesEvaluated >= 1, true);
  assert.equal(stats.baselineDevicesActivated >= 1, true);
  assert.equal(stats.baselineBucketsCreated >= 48, true);

  const baseline = await prisma.deviceBaseline.findFirst({
    where: {
      deviceId: device.id,
      isActive: true,
    },
    include: {
      buckets: {
        orderBy: [
          { dayGroup: "asc" },
          { localHour: "asc" },
        ],
      },
    },
  });

  assert.ok(baseline);
  assert.equal(baseline?.metric, "energy_wh");
  assert.equal(baseline?.granularity, "hourly_local");
  assert.equal(baseline?.profileShape, "weekday_weekend_hour");
  assert.equal(baseline?.timezone, "UTC");
  assert.equal(baseline?.sourceStartDate.toISOString().slice(0, 10), "2026-03-02");
  assert.equal(baseline?.sourceEndDate.toISOString().slice(0, 10), "2026-03-15");
  assert.equal(baseline?.windowDays, 14);
  assert.equal(baseline?.historyDaysUsed, 14);
  assert.equal(baseline?.minBucketSamples, 2);
  assert.equal(baseline?.buckets.length, 48);

  const weekdayHour6 = baseline?.buckets.find((bucket) => bucket.dayGroup === "weekday" && bucket.localHour === 6);
  const weekendHour6 = baseline?.buckets.find((bucket) => bucket.dayGroup === "weekend" && bucket.localHour === 6);

  assert.equal(weekdayHour6?.sampleCount, 10);
  assert.equal(asNumber(weekdayHour6?.expectedEnergyWh ?? null), 106);
  assert.equal(asNumber(weekdayHour6?.lowerBoundEnergyWh ?? null), 106);
  assert.equal(asNumber(weekdayHour6?.upperBoundEnergyWh ?? null), 106);
  assert.equal(weekendHour6?.sampleCount, 4);
  assert.equal(asNumber(weekendHour6?.expectedEnergyWh ?? null), 206);
  assert.equal(asNumber(weekendHour6?.lowerBoundEnergyWh ?? null), 206);
  assert.equal(asNumber(weekendHour6?.upperBoundEnergyWh ?? null), 206);
});

test("runDeviceUsageAggregationOnce no reentrena baseline si no hay un nuevo dia cerrado", async () => {
  const suffix = `${Date.now()}-f`;
  const { device } = await seedDevice({
    suffix,
    timezone: "UTC",
  });

  await seedBaselineEligibilityReading(device.id);
  await seedBaselineHistory({
    deviceId: device.id,
    startDate: "2026-03-02",
    days: 14,
  });

  await runDeviceUsageAggregationOnce({
    enableBaseline: true,
  });

  const firstBaseline = await prisma.deviceBaseline.findFirst({
    where: {
      deviceId: device.id,
      isActive: true,
    },
  });

  const secondStats = await runDeviceUsageAggregationOnce({
    enableBaseline: true,
  });

  const baselines = await prisma.deviceBaseline.findMany({
    where: {
      deviceId: device.id,
    },
  });

  assert.ok(firstBaseline);
  assert.equal(secondStats.baselineDevicesEvaluated >= 1, true);
  assert.equal(secondStats.baselineDevicesSkipped >= 1, true);
  assert.equal(baselines.length, 1);
  assert.equal(baselines[0]?.id, firstBaseline?.id);
});

test("runDeviceUsageAggregationOnce supersede baseline activo cuando entra un nuevo dia cerrado", async () => {
  const suffix = `${Date.now()}-g`;
  const { device } = await seedDevice({
    suffix,
    timezone: "UTC",
  });

  await seedBaselineEligibilityReading(device.id);
  await seedBaselineHistory({
    deviceId: device.id,
    startDate: "2026-03-02",
    days: 14,
  });

  await runDeviceUsageAggregationOnce({
    enableBaseline: true,
  });

  await seedBaselineHistory({
    deviceId: device.id,
    startDate: "2026-03-16",
    days: 1,
  });

  const stats = await runDeviceUsageAggregationOnce({
    enableBaseline: true,
  });

  const baselines = await prisma.deviceBaseline.findMany({
    where: {
      deviceId: device.id,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
  const activeBaseline = baselines.find((baseline) => baseline.isActive);
  const inactiveBaseline = baselines.find((baseline) => !baseline.isActive);

  assert.equal(stats.baselineDevicesActivated >= 1, true);
  assert.equal(baselines.length, 2);
  assert.ok(activeBaseline);
  assert.ok(inactiveBaseline);
  assert.equal(activeBaseline?.sourceEndDate.toISOString().slice(0, 10), "2026-03-16");
  assert.equal(inactiveBaseline?.sourceEndDate.toISOString().slice(0, 10), "2026-03-15");
  assert.equal(inactiveBaseline?.supersededAt instanceof Date, true);
});

test("runDeviceUsageAggregationOnce no crea baseline si la ventana cerrada tiene huecos", async () => {
  const suffix = `${Date.now()}-h`;
  const { device } = await seedDevice({
    suffix,
    timezone: "UTC",
  });

  await seedBaselineEligibilityReading(device.id);
  await seedBaselineHistory({
    deviceId: device.id,
    startDate: "2026-03-02",
    days: 15,
    missingDayIndexes: [7],
  });

  const stats = await runDeviceUsageAggregationOnce({
    enableBaseline: true,
  });

  const baselines = await prisma.deviceBaseline.findMany({
    where: {
      deviceId: device.id,
    },
  });

  assert.equal(stats.baselineDevicesEvaluated >= 1, true);
  assert.equal(baselines.length, 0);
});
