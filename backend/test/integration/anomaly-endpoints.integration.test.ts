import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { prisma } from "../../src/lib/prisma.js";
import { createApp } from "../../src/app/app.js";
import { signAccessToken } from "../../src/modules/auth/jwt.js";

const app = createApp();

async function seedDeviceWithToken(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `anom-api-it-${suffix}@example.com`,
      passwordHash: "hash",
      name: "Anomaly API Test",
    },
  });

  const token = await signAccessToken({
    sub: user.id,
    email: user.email,
  });

  const home = await prisma.home.create({
    data: {
      userId: user.id,
      name: `home-${suffix}`,
      timezone: "UTC",
    },
  });

  const device = await prisma.device.create({
    data: {
      userId: user.id,
      homeId: home.id,
      vendor: "shelly",
      displayName: `device-${suffix}`,
      externalDeviceId: `ext-${suffix}`,
      status: "active",
      dataSource: "shelly_cloud",
    },
  });

  return { user, token, home, device };
}

async function seedModel(deviceId: string) {
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
      summary: {
        hourlyReference: [],
      },
      status: "active",
      isActive: true,
    },
  });
}

test.after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "anom-api-it-" } } });
  await prisma.$disconnect();
});

test("GET /devices/:deviceId/state devuelve snapshot con latestReading, modelo y incidente abierto", async () => {
  const suffix = `${Date.now()}-state`;
  const { token, device } = await seedDeviceWithToken(suffix);
  const model = await seedModel(device.id);

  await prisma.deviceReading.createMany({
    data: [
      {
        deviceId: device.id,
        ts: new Date("2026-03-24T17:55:00.000Z"),
        apower: 45,
        aenergyDelta: 1,
        voltage: 120,
        current: 0.4,
        output: true,
        source: "shelly_cloud",
      },
      {
        deviceId: device.id,
        ts: new Date("2026-03-24T18:00:00.000Z"),
        apower: 61,
        aenergyDelta: 2,
        voltage: 121,
        current: 0.5,
        output: true,
        source: "shelly_cloud",
      },
    ],
  });

  await prisma.anomalyEvent.create({
    data: {
      deviceId: device.id,
      modelId: model.id,
      detectedAt: new Date("2026-03-24T18:00:00.000Z"),
      windowStart: new Date("2026-03-24T18:00:00.000Z"),
      windowEnd: new Date("2026-03-24T18:03:00.000Z"),
      status: "open",
      readingsCount: 2,
      anomalyType: "reading_outlier",
      severity: 1,
      score: -0.9,
      expectedValue: 50,
      observedValue: 61,
      details: {
        dayGroup: "weekday",
        localHour: 18,
      },
    },
  });

  const response = await request(app)
    .get(`/devices/${device.id}/state`)
    .set("authorization", `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.device.id, device.id);
  assert.equal(response.body.latestReading.ts, "2026-03-24T18:00:00.000Z");
  assert.equal(response.body.latestReading.apower, 61);
  assert.equal(response.body.model.ready, true);
  assert.equal(response.body.model.status, "active");
  assert.equal(response.body.activeAnomaly.status, "open");
  assert.equal(response.body.activeAnomaly.readingsCount, 2);
});

test("GET /devices/:deviceId/anomalies lista incidentes y filtra por status", async () => {
  const suffix = `${Date.now()}-list`;
  const { token, device } = await seedDeviceWithToken(suffix);
  const model = await seedModel(device.id);

  await prisma.anomalyEvent.createMany({
    data: [
      {
        deviceId: device.id,
        modelId: model.id,
        detectedAt: new Date("2026-03-24T17:00:00.000Z"),
        windowStart: new Date("2026-03-24T17:00:00.000Z"),
        windowEnd: new Date("2026-03-24T17:04:00.000Z"),
        status: "closed",
        readingsCount: 2,
        anomalyType: "reading_outlier",
        severity: 1,
        score: -0.7,
      },
      {
        deviceId: device.id,
        modelId: model.id,
        detectedAt: new Date("2026-03-24T18:00:00.000Z"),
        windowStart: new Date("2026-03-24T18:00:00.000Z"),
        windowEnd: new Date("2026-03-24T18:03:00.000Z"),
        status: "open",
        readingsCount: 3,
        anomalyType: "reading_outlier",
        severity: 1,
        score: -0.9,
      },
    ],
  });

  const response = await request(app)
    .get(`/devices/${device.id}/anomalies`)
    .set("authorization", `Bearer ${token}`)
    .query({
      status: "closed",
      limit: 10,
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.device.id, device.id);
  assert.equal(response.body.filters.status, "closed");
  assert.equal(response.body.anomalies.length, 1);
  assert.equal(response.body.anomalies[0].status, "closed");
  assert.equal(response.body.anomalies[0].readingsCount, 2);
});

test("GET /devices/:deviceId/anomalies valida rango y ownership", async () => {
  const suffix = `${Date.now()}-guard`;
  const owner = await seedDeviceWithToken(`${suffix}-owner`);
  const foreign = await seedDeviceWithToken(`${suffix}-foreign`);

  const invalidRange = await request(app)
    .get(`/devices/${owner.device.id}/anomalies`)
    .set("authorization", `Bearer ${owner.token}`)
    .query({
      from: "2026-03-25T00:00:00.000Z",
      to: "2026-03-24T00:00:00.000Z",
    });

  assert.equal(invalidRange.status, 400);
  assert.equal(invalidRange.body.error, "INVALID_RANGE");

  const foreignResponse = await request(app)
    .get(`/devices/${owner.device.id}/anomalies`)
    .set("authorization", `Bearer ${foreign.token}`);

  assert.equal(foreignResponse.status, 404);
  assert.equal(foreignResponse.body.error, "DEVICE_NOT_FOUND");
});
