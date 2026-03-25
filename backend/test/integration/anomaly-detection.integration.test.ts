import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma.js";
import { scoreDeviceReading } from "../../src/modules/anomaly-detection/anomaly-detection.service.js";

const originalFetch = globalThis.fetch;

async function seedDevice(options: {
  suffix: string;
  timezone: string;
}) {
  const user = await prisma.user.create({
    data: {
      email: `anom-it-${options.suffix}@example.com`,
      passwordHash: "hash",
      name: "Anomaly Test",
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

async function seedModel(deviceId: string, summary?: unknown) {
  return prisma.deviceAnomalyModel.create({
    data: {
      deviceId,
      modelType: "isolation_forest",
      modelVersion: "isolation-forest-v1",
      featureSchemaVersion: "reading-v1",
      contamination: 0.02,
      trainingWindowDays: 30,
      trainedFrom: new Date("2026-02-01T00:00:00.000Z"),
      trainedTo: new Date("2026-03-02T00:00:00.000Z"),
      trainedAt: new Date("2026-03-03T10:00:00.000Z"),
      trainingSampleCount: 720,
      timezone: "UTC",
      artifact: {
        pickleBase64: "artifact",
      },
      summary: summary ?? {
        hourlyReference: [],
      },
      status: "active",
      isActive: true,
    },
  });
}

async function seedReading(options: {
  deviceId: string;
  ts: string;
  apower: number;
  aenergyDelta: number;
}) {
  return prisma.deviceReading.create({
    data: {
      deviceId: options.deviceId,
      ts: new Date(options.ts),
      apower: options.apower,
      aenergyDelta: options.aenergyDelta,
      output: true,
      source: "shelly_cloud",
    },
  });
}

test.afterEach(async () => {
  globalThis.fetch = originalFetch;
});

test.after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "anom-it-" } } });
  await prisma.$disconnect();
});

test("scoreDeviceReading crea prediccion model_not_ready cuando no existe modelo activo", async () => {
  const suffix = `${Date.now()}-a`;
  const { device } = await seedDevice({
    suffix,
    timezone: "UTC",
  });
  const reading = await seedReading({
    deviceId: device.id,
    ts: "2026-03-23T17:00:00.000Z",
    apower: 50,
    aenergyDelta: 5,
  });

  const result = await scoreDeviceReading(reading.id, {
    enabled: true,
    mlServiceBaseUrl: "http://ml-service.local",
  });

  const prediction = await prisma.deviceAnomalyPrediction.findUnique({
    where: { readingId: reading.id },
  });
  const feature = await prisma.deviceReadingFeature.findFirst({
    where: { readingId: reading.id },
  });
  const event = await prisma.anomalyEvent.findFirst({
    where: { readingId: reading.id },
  });

  assert.equal(result.status, "model_not_ready");
  assert.ok(prediction);
  assert.equal(prediction?.status, "model_not_ready");
  assert.ok(feature);
  assert.equal(event, null);
});

test("scoreDeviceReading crea prediccion y anomaly_event cuando el score marca anomalia", async () => {
  const suffix = `${Date.now()}-b`;
  const { device } = await seedDevice({
    suffix,
    timezone: "UTC",
  });
  await seedModel(device.id, {
    hourlyReference: [
      { dayGroup: "weekday", localHour: 17, expectedApower: 50 },
    ],
  });
  await seedReading({
    deviceId: device.id,
    ts: "2026-03-23T16:55:00.000Z",
    apower: 49,
    aenergyDelta: 5,
  });
  const reading = await seedReading({
    deviceId: device.id,
    ts: "2026-03-23T17:00:00.000Z",
    apower: 0,
    aenergyDelta: 1,
  });

  globalThis.fetch = (async (input) => {
    if (String(input).includes("/score")) {
      return new Response(JSON.stringify({
        score: -0.84,
        isAnomaly: true,
        decisionFunction: -0.42,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${String(input)}`);
  }) as typeof fetch;

  const result = await scoreDeviceReading(reading.id, {
    enabled: true,
    mlServiceBaseUrl: "http://ml-service.local",
  });

  const prediction = await prisma.deviceAnomalyPrediction.findUnique({
    where: { readingId: reading.id },
  });
  const event = await prisma.anomalyEvent.findFirst({
    where: { readingId: reading.id },
  });

  assert.equal(result.status, "scored");
  assert.equal(result.anomalyCreated, true);
  assert.ok(prediction);
  assert.equal(prediction?.status, "scored");
  assert.equal(prediction?.isAnomaly, true);
  assert.ok(event);
  assert.equal(Number(event?.expectedValue?.toString()), 50);
  assert.equal(Number(event?.observedValue?.toString()), 0);
});

test("scoreDeviceReading crea solo prediccion cuando el modelo no marca anomalia", async () => {
  const suffix = `${Date.now()}-c`;
  const { device } = await seedDevice({
    suffix,
    timezone: "UTC",
  });
  await seedModel(device.id);
  const reading = await seedReading({
    deviceId: device.id,
    ts: "2026-03-24T18:00:00.000Z",
    apower: 52,
    aenergyDelta: 5,
  });

  globalThis.fetch = (async (input) => {
    if (String(input).includes("/score")) {
      return new Response(JSON.stringify({
        score: 0.12,
        isAnomaly: false,
        decisionFunction: 0.3,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${String(input)}`);
  }) as typeof fetch;

  const result = await scoreDeviceReading(reading.id, {
    enabled: true,
    mlServiceBaseUrl: "http://ml-service.local",
  });

  const prediction = await prisma.deviceAnomalyPrediction.findUnique({
    where: { readingId: reading.id },
  });
  const event = await prisma.anomalyEvent.findFirst({
    where: { readingId: reading.id },
  });

  assert.equal(result.status, "scored");
  assert.equal(result.anomalyCreated, false);
  assert.ok(prediction);
  assert.equal(prediction?.isAnomaly, false);
  assert.equal(event, null);
});

test("scoreDeviceReading persiste score_failed si el servicio ML falla", async () => {
  const suffix = `${Date.now()}-d`;
  const { device } = await seedDevice({
    suffix,
    timezone: "UTC",
  });
  await seedModel(device.id);
  const reading = await seedReading({
    deviceId: device.id,
    ts: "2026-03-24T19:00:00.000Z",
    apower: 65,
    aenergyDelta: 6,
  });

  globalThis.fetch = (async (input) => {
    if (String(input).includes("/score")) {
      return new Response(JSON.stringify({
        error: "service unavailable",
      }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${String(input)}`);
  }) as typeof fetch;

  const result = await scoreDeviceReading(reading.id, {
    enabled: true,
    mlServiceBaseUrl: "http://ml-service.local",
  });

  const prediction = await prisma.deviceAnomalyPrediction.findUnique({
    where: { readingId: reading.id },
  });
  const event = await prisma.anomalyEvent.findFirst({
    where: { readingId: reading.id },
  });

  assert.equal(result.status, "score_failed");
  assert.ok(prediction);
  assert.equal(prediction?.status, "score_failed");
  assert.equal(event, null);
});

test("scoreDeviceReading es idempotente para la misma lectura y no duplica prediction ni anomaly_event", async () => {
  const suffix = `${Date.now()}-e`;
  const { device } = await seedDevice({
    suffix,
    timezone: "UTC",
  });
  await seedModel(device.id, {
    hourlyReference: [
      { dayGroup: "weekday", localHour: 17, expectedApower: 50 },
    ],
  });
  await seedReading({
    deviceId: device.id,
    ts: "2026-03-23T16:55:00.000Z",
    apower: 48,
    aenergyDelta: 5,
  });
  const reading = await seedReading({
    deviceId: device.id,
    ts: "2026-03-23T17:00:00.000Z",
    apower: 0,
    aenergyDelta: 1,
  });

  let scoreCalls = 0;
  globalThis.fetch = (async (input) => {
    if (String(input).includes("/score")) {
      scoreCalls += 1;
      return new Response(JSON.stringify({
        score: -0.91,
        isAnomaly: true,
        decisionFunction: -0.44,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${String(input)}`);
  }) as typeof fetch;

  const firstResult = await scoreDeviceReading(reading.id, {
    enabled: true,
    mlServiceBaseUrl: "http://ml-service.local",
  });
  const secondResult = await scoreDeviceReading(reading.id, {
    enabled: true,
    mlServiceBaseUrl: "http://ml-service.local",
  });

  const predictions = await prisma.deviceAnomalyPrediction.findMany({
    where: { readingId: reading.id },
  });
  const events = await prisma.anomalyEvent.findMany({
    where: { readingId: reading.id },
  });

  assert.equal(firstResult.status, "scored");
  assert.equal(secondResult.status, "scored");
  assert.equal(scoreCalls, 2);
  assert.equal(predictions.length, 1);
  assert.equal(events.length, 1);
  assert.equal(predictions[0]?.isAnomaly, true);
  assert.equal(Number(events[0]?.expectedValue?.toString()), 50);
});
