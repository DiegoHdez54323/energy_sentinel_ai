import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma.js";
import { runDeviceUsageAggregationOnce } from "../../src/modules/aggregates/aggregates.service.js";

const originalFetch = globalThis.fetch;

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

async function seedModelTrainingReadings(options: {
  deviceId: string;
  startDate: string;
  days: number;
  missingDayIndexes?: number[];
}) {
  const missingDayIndexes = new Set(options.missingDayIndexes ?? []);
  const start = new Date(`${options.startDate}T00:00:00.000Z`);
  const readings: Array<{
    deviceId: string;
    ts: Date;
    apower: number;
    aenergyDelta: number;
    output: boolean;
    source: string;
  }> = [];

  for (let dayIndex = 0; dayIndex < options.days; dayIndex += 1) {
    if (missingDayIndexes.has(dayIndex)) {
      continue;
    }

    const date = addDays(start, dayIndex);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    const base = weekend ? 200 : 100;

    for (let hour = 0; hour < 24; hour += 1) {
      const power = base + hour;
      readings.push({
        deviceId: options.deviceId,
        ts: new Date(Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate(),
          hour,
          5,
          0,
          0,
        )),
        apower: power,
        aenergyDelta: Math.max(1, Math.round(power / 10)),
        output: true,
        source: "shelly_cloud",
      });
    }
  }

  await prisma.deviceReading.createMany({
    data: readings,
  });
}

test.afterEach(async () => {
  globalThis.fetch = originalFetch;
});

test.after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "agg-it-" } } });
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

  const stats = await runDeviceUsageAggregationOnce({
    enableMl: false,
  });
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

  await runDeviceUsageAggregationOnce({
    enableMl: false,
  });

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

  await runDeviceUsageAggregationOnce({
    enableMl: false,
  });

  const firstHourly = await prisma.deviceUsageHourly.findMany({
    where: { deviceId: device.id },
  });
  const firstDaily = await prisma.deviceUsageDaily.findMany({
    where: { deviceId: device.id },
  });

  await runDeviceUsageAggregationOnce({
    enableMl: false,
  });

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
    enableMl: false,
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

test("runDeviceUsageAggregationOnce entrena un modelo de anomalías con 30 dias cerrados contiguos", async () => {
  const suffix = `${Date.now()}-e`;
  const { device } = await seedDevice({
    suffix,
    timezone: "UTC",
  });

  await seedModelTrainingReadings({
    deviceId: device.id,
    startDate: "2026-02-01",
    days: 30,
  });
  globalThis.fetch = (async (input) => {
    if (String(input).includes("/train")) {
      return new Response(JSON.stringify({
        artifact: { pickleBase64: "trained-model" },
        summary: {
          hourlyReference: [
            { dayGroup: "weekday", localHour: 6, expectedApower: 106 },
            { dayGroup: "weekend", localHour: 6, expectedApower: 206 },
          ],
        },
        trainingSampleCount: 720,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${String(input)}`);
  }) as typeof fetch;

  const stats = await runDeviceUsageAggregationOnce({
    enableMl: true,
    mlTrainingWindowDays: 30,
  });

  assert.equal(stats.modelDevicesEvaluated >= 1, true);
  assert.equal(stats.modelDevicesTrained >= 1, true);
  assert.equal(stats.featureRowsUpserted >= 720, true);

  const model = await prisma.deviceAnomalyModel.findFirst({
    where: {
      deviceId: device.id,
      isActive: true,
    },
  });
  const featuresCount = await prisma.deviceReadingFeature.count({
    where: {
      deviceId: device.id,
    },
  });

  assert.ok(model);
  assert.equal(model?.modelType, "isolation_forest");
  assert.equal(model?.featureSchemaVersion, "reading-v1");
  assert.equal(model?.trainingWindowDays, 30);
  assert.equal(model?.trainedFrom.toISOString().slice(0, 10), "2026-02-01");
  assert.equal(model?.trainedTo.toISOString().slice(0, 10), "2026-03-02");
  assert.equal(model?.trainingSampleCount, 720);
  assert.equal(featuresCount, 720);
});

test("runDeviceUsageAggregationOnce no reentrena el modelo si no hay un nuevo dia cerrado", async () => {
  const suffix = `${Date.now()}-f`;
  const { device } = await seedDevice({
    suffix,
    timezone: "UTC",
  });

  await seedModelTrainingReadings({
    deviceId: device.id,
    startDate: "2026-02-01",
    days: 30,
  });
  globalThis.fetch = (async (input) => {
    if (String(input).includes("/train")) {
      return new Response(JSON.stringify({
        artifact: { pickleBase64: "trained-model" },
        summary: { hourlyReference: [] },
        trainingSampleCount: 720,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${String(input)}`);
  }) as typeof fetch;

  await runDeviceUsageAggregationOnce({
    enableMl: true,
    mlTrainingWindowDays: 30,
  });

  const firstModel = await prisma.deviceAnomalyModel.findFirst({
    where: {
      deviceId: device.id,
      isActive: true,
    },
  });

  const secondStats = await runDeviceUsageAggregationOnce({
    enableMl: true,
    mlTrainingWindowDays: 30,
  });

  const models = await prisma.deviceAnomalyModel.findMany({
    where: {
      deviceId: device.id,
    },
  });

  assert.ok(firstModel);
  assert.equal(secondStats.modelDevicesEvaluated >= 1, true);
  assert.equal(secondStats.modelDevicesSkipped >= 1, true);
  assert.equal(models.length, 1);
  assert.equal(models[0]?.id, firstModel?.id);
});

test("runDeviceUsageAggregationOnce supersede el modelo activo cuando entra un nuevo dia cerrado", async () => {
  const suffix = `${Date.now()}-g`;
  const { device } = await seedDevice({
    suffix,
    timezone: "UTC",
  });

  await seedModelTrainingReadings({
    deviceId: device.id,
    startDate: "2026-02-01",
    days: 30,
  });
  let trainCall = 0;
  globalThis.fetch = (async (input) => {
    if (String(input).includes("/train")) {
      trainCall += 1;
      return new Response(JSON.stringify({
        artifact: { pickleBase64: `trained-model-${trainCall}` },
        summary: { hourlyReference: [] },
        trainingSampleCount: 720,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${String(input)}`);
  }) as typeof fetch;

  await runDeviceUsageAggregationOnce({
    enableMl: true,
    mlTrainingWindowDays: 30,
  });

  await seedModelTrainingReadings({
    deviceId: device.id,
    startDate: "2026-03-03",
    days: 1,
  });

  const stats = await runDeviceUsageAggregationOnce({
    enableMl: true,
    mlTrainingWindowDays: 30,
  });

  const models = await prisma.deviceAnomalyModel.findMany({
    where: {
      deviceId: device.id,
    },
    orderBy: {
      trainedAt: "asc",
    },
  });
  const activeModel = models.find((model) => model.isActive);
  const inactiveModel = models.find((model) => !model.isActive);

  assert.equal(stats.modelDevicesTrained >= 1, true);
  assert.equal(models.length, 2);
  assert.ok(activeModel);
  assert.ok(inactiveModel);
  assert.equal(activeModel?.trainedTo.toISOString().slice(0, 10), "2026-03-03");
  assert.equal(inactiveModel?.trainedTo.toISOString().slice(0, 10), "2026-03-02");
  assert.equal(inactiveModel?.supersededAt instanceof Date, true);
});

test("runDeviceUsageAggregationOnce no entrena modelo si la ventana cerrada tiene huecos", async () => {
  const suffix = `${Date.now()}-h`;
  const { device } = await seedDevice({
    suffix,
    timezone: "UTC",
  });

  await seedModelTrainingReadings({
    deviceId: device.id,
    startDate: "2026-02-01",
    days: 30,
    missingDayIndexes: [12],
  });

  const stats = await runDeviceUsageAggregationOnce({
    enableMl: true,
    mlTrainingWindowDays: 30,
  });

  const models = await prisma.deviceAnomalyModel.findMany({
    where: {
      deviceId: device.id,
    },
  });

  assert.equal(stats.modelDevicesEvaluated >= 1, true);
  assert.equal(models.length, 0);
});
