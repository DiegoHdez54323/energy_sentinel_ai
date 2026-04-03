import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { Prisma } from "../../src/generated/prisma/client.js";
import { createApp } from "../../src/app/app.js";
import { prisma } from "../../src/lib/prisma.js";

const app = createApp();

function asNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value == null) {
    return null;
  }
  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }
  return Number(value);
}

async function registerUser(email: string) {
  const response = await request(app).post("/auth/register").send({
    email,
    password: "Password123!",
    name: email,
  });

  assert.equal(response.status, 201);

  return {
    token: response.body.accessToken as string,
    userId: response.body.user.id as string,
  };
}

async function createHome(token: string, name: string, timezone = "Etc/UTC") {
  const response = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${token}`)
    .send({ name, timezone });

  assert.equal(response.status, 201);
  return response.body.home as { id: string; timezone: string };
}

async function createDevice(token: string, homeId: string, suffix: string) {
  const response = await request(app)
    .post(`/homes/${homeId}/devices`)
    .set("authorization", `Bearer ${token}`)
    .send({
      vendor: "shelly",
      displayName: `device-${suffix}`,
      externalDeviceId: `ext-${suffix}-${Date.now()}`,
    });

  assert.equal(response.status, 201);
  return response.body.device as { id: string; homeId: string };
}

test.after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "consumption-it-" } } });
  await prisma.$disconnect();
});

test("GET /devices/:deviceId/consumption resuelve raw en ventana corta", async () => {
  const suffix = Date.now();
  const user = await registerUser(`consumption-it-a-${suffix}@example.com`);
  const home = await createHome(user.token, `consumption-home-raw-${suffix}`);
  const device = await createDevice(user.token, home.id, `raw-${suffix}`);

  await prisma.deviceReading.createMany({
    data: [
      {
        deviceId: device.id,
        ts: new Date("2026-03-25T00:10:00.000Z"),
        apower: 50,
        aenergyDelta: 1.5,
      },
      {
        deviceId: device.id,
        ts: new Date("2026-03-25T01:20:00.000Z"),
        apower: 120,
        aenergyDelta: 2.25,
      },
    ],
  });

  const response = await request(app)
    .get(`/devices/${device.id}/consumption`)
    .set("authorization", `Bearer ${user.token}`)
    .query({
      from: "2026-03-25T00:00:00.000Z",
      to: "2026-03-25T05:59:59.999Z",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.granularityRequested, "auto");
  assert.equal(response.body.granularityResolved, "raw");
  assert.equal(response.body.timezone, "Etc/UTC");
  assert.equal(response.body.series.length, 2);
  assert.equal(response.body.series[0].ts, "2026-03-25T00:10:00.000Z");
  assert.equal(asNumber(response.body.series[0].energyWh), 1.5);
  assert.equal(asNumber(response.body.series[0].avgPowerW), 50);
  assert.equal(response.body.series[0].samplesCount, 1);
  assert.equal(response.body.series[1].ts, "2026-03-25T01:20:00.000Z");
  assert.equal(asNumber(response.body.series[1].energyWh), 2.25);
  assert.equal(asNumber(response.body.series[1].maxPowerW), 120);
});

test("GET /devices/:deviceId/consumption resuelve hourly y rechaza raw fuera de rango", async () => {
  const suffix = Date.now() + 1;
  const user = await registerUser(`consumption-it-a-${suffix}@example.com`);
  const home = await createHome(user.token, `consumption-home-hourly-${suffix}`);
  const device = await createDevice(user.token, home.id, `hourly-${suffix}`);

  await prisma.deviceUsageHourly.createMany({
    data: [
      {
        deviceId: device.id,
        hourTs: new Date("2026-03-23T00:00:00.000Z"),
        energyWh: 10,
        avgPowerW: 50,
        maxPowerW: 80,
        minPowerW: 30,
        samplesCount: 2,
      },
      {
        deviceId: device.id,
        hourTs: new Date("2026-03-23T01:00:00.000Z"),
        energyWh: 14,
        avgPowerW: 70,
        maxPowerW: 90,
        minPowerW: 60,
        samplesCount: 3,
      },
    ],
  });

  const response = await request(app)
    .get(`/devices/${device.id}/consumption`)
    .set("authorization", `Bearer ${user.token}`)
    .query({
      from: "2026-03-23T00:00:00.000Z",
      to: "2026-03-25T00:00:00.000Z",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.granularityResolved, "hourly");
  assert.equal(response.body.series.length, 2);
  assert.equal(asNumber(response.body.series[0].energyWh), 10);
  assert.equal(asNumber(response.body.series[1].avgPowerW), 70);

  const invalidRaw = await request(app)
    .get(`/devices/${device.id}/consumption`)
    .set("authorization", `Bearer ${user.token}`)
    .query({
      from: "2026-03-23T00:00:00.000Z",
      to: "2026-03-25T00:00:00.000Z",
      granularity: "raw",
    });

  assert.equal(invalidRaw.status, 400);
  assert.equal(invalidRaw.body.error, "INVALID_GRANULARITY_FOR_RANGE");
});

test("GET /devices/:deviceId/consumption resuelve daily en ventana larga", async () => {
  const suffix = Date.now() + 2;
  const user = await registerUser(`consumption-it-a-${suffix}@example.com`);
  const home = await createHome(user.token, `consumption-home-daily-${suffix}`);
  const device = await createDevice(user.token, home.id, `daily-${suffix}`);

  await prisma.deviceUsageDaily.createMany({
    data: [
      {
        deviceId: device.id,
        date: new Date("2026-03-01T00:00:00.000Z"),
        energyWh: 100,
        avgPowerW: 40,
        maxPowerW: 80,
        minPowerW: 20,
        samplesCount: 12,
      },
      {
        deviceId: device.id,
        date: new Date("2026-03-02T00:00:00.000Z"),
        energyWh: 130,
        avgPowerW: 55,
        maxPowerW: 90,
        minPowerW: 25,
        samplesCount: 14,
      },
    ],
  });

  const response = await request(app)
    .get(`/devices/${device.id}/consumption`)
    .set("authorization", `Bearer ${user.token}`)
    .query({
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-20T00:00:00.000Z",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.granularityResolved, "daily");
  assert.equal(response.body.series.length, 2);
  assert.equal(response.body.series[0].ts, "2026-03-01T00:00:00.000Z");
  assert.equal(asNumber(response.body.series[1].energyWh), 130);
});

test("GET /homes/:homeId/consumption suma devices del home en hourly", async () => {
  const suffix = Date.now() + 3;
  const user = await registerUser(`consumption-it-a-${suffix}@example.com`);
  const home = await createHome(user.token, `consumption-home-total-${suffix}`);
  const deviceA = await createDevice(user.token, home.id, `total-a-${suffix}`);
  const deviceB = await createDevice(user.token, home.id, `total-b-${suffix}`);

  await prisma.deviceUsageHourly.createMany({
    data: [
      {
        deviceId: deviceA.id,
        hourTs: new Date("2026-03-24T00:00:00.000Z"),
        energyWh: 10,
        avgPowerW: 50,
        maxPowerW: 60,
        minPowerW: 40,
        samplesCount: 2,
      },
      {
        deviceId: deviceB.id,
        hourTs: new Date("2026-03-24T00:00:00.000Z"),
        energyWh: 20,
        avgPowerW: 100,
        maxPowerW: 120,
        minPowerW: 80,
        samplesCount: 1,
      },
      {
        deviceId: deviceA.id,
        hourTs: new Date("2026-03-24T01:00:00.000Z"),
        energyWh: 15,
        avgPowerW: 90,
        maxPowerW: 110,
        minPowerW: 70,
        samplesCount: 3,
      },
    ],
  });

  const response = await request(app)
    .get(`/homes/${home.id}/consumption`)
    .set("authorization", `Bearer ${user.token}`)
    .query({
      from: "2026-03-24T00:00:00.000Z",
      to: "2026-03-25T00:00:00.000Z",
      granularity: "hourly",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.granularityResolved, "hourly");
  assert.equal(response.body.series.length, 2);
  assert.equal(asNumber(response.body.series[0].energyWh), 30);
  assert.equal(asNumber(response.body.series[0].avgPowerW), 66.66666666666667);
  assert.equal(asNumber(response.body.series[0].maxPowerW), 120);
  assert.equal(asNumber(response.body.series[0].minPowerW), 40);
  assert.equal(response.body.series[0].samplesCount, 3);
  assert.equal(asNumber(response.body.series[1].energyWh), 15);
});

test("GET /homes/:homeId/consumption en auto resuelve hourly y rechaza raw", async () => {
  const suffix = Date.now() + 4;
  const user = await registerUser(`consumption-it-a-${suffix}@example.com`);
  const home = await createHome(user.token, `consumption-home-auto-${suffix}`);
  const device = await createDevice(user.token, home.id, `auto-${suffix}`);

  await prisma.deviceUsageHourly.createMany({
    data: [
      {
        deviceId: device.id,
        hourTs: new Date("2026-03-24T00:00:00.000Z"),
        energyWh: 12,
        avgPowerW: 60,
        maxPowerW: 75,
        minPowerW: 45,
        samplesCount: 2,
      },
      {
        deviceId: device.id,
        hourTs: new Date("2026-03-24T01:00:00.000Z"),
        energyWh: 18,
        avgPowerW: 90,
        maxPowerW: 110,
        minPowerW: 70,
        samplesCount: 3,
      },
    ],
  });

  const autoResponse = await request(app)
    .get(`/homes/${home.id}/consumption`)
    .set("authorization", `Bearer ${user.token}`)
    .query({
      from: "2026-03-24T00:00:00.000Z",
      to: "2026-03-24T06:00:00.000Z",
    });

  assert.equal(autoResponse.status, 200);
  assert.equal(autoResponse.body.granularityRequested, "auto");
  assert.equal(autoResponse.body.granularityResolved, "hourly");
  assert.equal(autoResponse.body.series.length, 2);
  assert.equal(asNumber(autoResponse.body.series[0].energyWh), 12);

  const invalidRaw = await request(app)
    .get(`/homes/${home.id}/consumption`)
    .set("authorization", `Bearer ${user.token}`)
    .query({
      from: "2026-03-24T00:00:00.000Z",
      to: "2026-03-24T06:00:00.000Z",
      granularity: "raw",
    });

  assert.equal(invalidRaw.status, 400);
  assert.equal(invalidRaw.body.error, "INVALID_GRANULARITY_FOR_RANGE");
});

test("Consumption respeta ownership y valida rango maximo", async () => {
  const suffix = Date.now() + 5;
  const userA = await registerUser(`consumption-it-a-${suffix}@example.com`);
  const userB = await registerUser(`consumption-it-b-${suffix}@example.com`);
  const home = await createHome(userA.token, `consumption-home-owned-${suffix}`);
  const device = await createDevice(userA.token, home.id, `owned-${suffix}`);

  const foreignResponse = await request(app)
    .get(`/devices/${device.id}/consumption`)
    .set("authorization", `Bearer ${userB.token}`)
    .query({
      from: "2026-03-24T00:00:00.000Z",
      to: "2026-03-24T06:00:00.000Z",
    });

  assert.equal(foreignResponse.status, 404);
  assert.equal(foreignResponse.body.error, "DEVICE_NOT_FOUND");

  const invalidRange = await request(app)
    .get(`/homes/${home.id}/consumption`)
    .set("authorization", `Bearer ${userA.token}`)
    .query({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-05-01T00:00:00.000Z",
    });

  assert.equal(invalidRange.status, 400);
  assert.equal(invalidRange.body.error, "INVALID_RANGE");
});

test("Consumption devuelve series vacia cuando no hay datos en el rango", async () => {
  const suffix = Date.now() + 6;
  const user = await registerUser(`consumption-it-a-${suffix}@example.com`);
  const home = await createHome(user.token, `consumption-home-empty-${suffix}`);
  const device = await createDevice(user.token, home.id, `empty-${suffix}`);

  const response = await request(app)
    .get(`/devices/${device.id}/consumption`)
    .set("authorization", `Bearer ${user.token}`)
    .query({
      from: "2026-03-24T00:00:00.000Z",
      to: "2026-03-24T03:00:00.000Z",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.granularityResolved, "raw");
  assert.deepEqual(response.body.series, []);
});
