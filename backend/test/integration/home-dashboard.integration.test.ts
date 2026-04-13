import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app/app.js";
import { prisma } from "../../src/lib/prisma.js";

const app = createApp();
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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

async function createHome(token: string, name: string) {
  const response = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${token}`)
    .send({ name, timezone: "Etc/UTC" });

  assert.equal(response.status, 201);
  return response.body.home as { id: string; name: string; timezone: string; userId: string };
}

async function createDevice(token: string, homeId: string, suffix: string, status = "active") {
  const response = await request(app)
    .post(`/homes/${homeId}/devices`)
    .set("authorization", `Bearer ${token}`)
    .send({
      vendor: "shelly",
      displayName: `device-${suffix}`,
      externalDeviceId: `dashboard-ext-${suffix}-${Date.now()}`,
      status,
    });

  assert.equal(response.status, 201);
  return response.body.device as { id: string; displayName: string; homeId: string };
}

test.after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "home-dashboard-it-" } } });
  await prisma.$disconnect();
});

test("GET /homes/:id/dashboard requiere auth", async () => {
  const response = await request(app).get("/homes/00000000-0000-0000-0000-000000000000/dashboard");

  assert.equal(response.status, 401);
});

test("GET /homes/:id/dashboard respeta ownership", async () => {
  const suffix = Date.now();
  const owner = await registerUser(`home-dashboard-it-owner-${suffix}@example.com`);
  const foreign = await registerUser(`home-dashboard-it-foreign-${suffix}@example.com`);
  const home = await createHome(owner.token, `dashboard-owned-${suffix}`);

  const response = await request(app)
    .get(`/homes/${home.id}/dashboard`)
    .set("authorization", `Bearer ${foreign.token}`);

  assert.equal(response.status, 404);
  assert.equal(response.body.error, "HOME_NOT_FOUND");
});

test("GET /homes/:id/dashboard devuelve estado vacio para home sin devices", async () => {
  const suffix = Date.now() + 1;
  const user = await registerUser(`home-dashboard-it-empty-${suffix}@example.com`);
  const home = await createHome(user.token, `dashboard-empty-${suffix}`);

  const response = await request(app)
    .get(`/homes/${home.id}/dashboard`)
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.home.id, home.id);
  assert.equal(response.body.timezone, "Etc/UTC");
  assert.equal(response.body.summary.today.energyWh, 0);
  assert.equal(response.body.summary.week.energyWh, 0);
  assert.equal(response.body.summary.activeAnomaliesCount, 0);
  assert.equal(response.body.alert, null);
  assert.deepEqual(response.body.devices, []);
});

test("GET /homes/:id/dashboard agrega consumo, readings y anomalias abiertas", async () => {
  const suffix = Date.now() + 2;
  const user = await registerUser(`home-dashboard-it-data-${suffix}@example.com`);
  const home = await createHome(user.token, `dashboard-data-${suffix}`);
  const activeDevice = await createDevice(user.token, home.id, `active-${suffix}`);
  const idleDevice = await createDevice(user.token, home.id, `idle-${suffix}`, "disabled");
  const currentTs = new Date();
  const previousTs = new Date(currentTs.getTime() - SEVEN_DAYS_MS);

  await prisma.deviceReading.createMany({
    data: [
      {
        deviceId: activeDevice.id,
        ts: currentTs,
        apower: 61.4,
        aenergyDelta: 120,
        voltage: 121,
        current: 0.5,
        output: true,
        source: "shelly_cloud",
      },
      {
        deviceId: activeDevice.id,
        ts: previousTs,
        apower: 40,
        aenergyDelta: 240,
        output: true,
        source: "shelly_cloud",
      },
    ],
  });

  await prisma.anomalyEvent.create({
    data: {
      deviceId: activeDevice.id,
      detectedAt: currentTs,
      windowStart: currentTs,
      windowEnd: new Date(currentTs.getTime() + 60_000),
      status: "open",
      readingsCount: 1,
      anomalyType: "reading_outlier",
      severity: 2,
      score: -0.7,
      expectedValue: 30,
      observedValue: 61.4,
    },
  });

  const response = await request(app)
    .get(`/homes/${home.id}/dashboard`)
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.summary.today.energyWh, 120);
  assert.equal(response.body.summary.today.previousEnergyWh, 240);
  assert.equal(response.body.summary.today.trend, "down");
  assert.equal(response.body.summary.today.trendPercent, -50);
  assert.equal(response.body.summary.week.energyWh, 120);
  assert.equal(response.body.summary.week.previousEnergyWh, 240);
  assert.equal(response.body.summary.activeAnomaliesCount, 1);
  assert.equal(response.body.alert.deviceId, activeDevice.id);
  assert.equal(response.body.alert.deviceName, activeDevice.displayName);

  const dashboardActiveDevice = response.body.devices.find((device: { id: string }) => device.id === activeDevice.id);
  const dashboardIdleDevice = response.body.devices.find((device: { id: string }) => device.id === idleDevice.id);

  assert.equal(dashboardActiveDevice.currentWatts, 61);
  assert.equal(dashboardActiveDevice.isOn, true);
  assert.equal(dashboardActiveDevice.status, "anomaly");
  assert.equal(dashboardActiveDevice.latestReading.apower, 61.4);
  assert.equal(dashboardActiveDevice.activeAnomaly.status, "open");
  assert.equal(dashboardIdleDevice.currentWatts, 0);
  assert.equal(dashboardIdleDevice.isOn, false);
  assert.equal(dashboardIdleDevice.status, "warning");
  assert.equal(dashboardIdleDevice.latestReading, null);
});
