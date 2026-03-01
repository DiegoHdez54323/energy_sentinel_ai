import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app/app.js";
import { prisma } from "../../src/lib/prisma.js";

const app = createApp();

async function registerUser(email: string) {
  const registerResponse = await request(app).post("/auth/register").send({
    email,
    password: "Password123!",
    name: email,
  });

  assert.equal(registerResponse.status, 201);

  return {
    token: registerResponse.body.accessToken as string,
    userId: registerResponse.body.user.id as string,
  };
}

async function createHome(token: string, input: { name: string; timezone: string }) {
  const response = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${token}`)
    .send(input);

  assert.equal(response.status, 201);

  return response.body.home as {
    id: string;
    userId: string;
    name: string;
    timezone: string;
  };
}

async function createDevice(
  token: string,
  homeId: string,
  input?: Partial<{
    vendor: string;
    displayName: string;
    externalDeviceId: string;
    deviceCode: string;
    ipAddress: string;
    macAddress: string;
    status: string;
    dataSource: string;
  }>,
) {
  const response = await request(app)
    .post(`/homes/${homeId}/devices`)
    .set("authorization", `Bearer ${token}`)
    .send({
      vendor: " shelly ",
      displayName: " Living Room Plug ",
      externalDeviceId: ` ext-${Date.now()}-${Math.random()} `,
      ...input,
    });

  assert.equal(response.status, 201);

  return response.body.device as {
    id: string;
    homeId: string;
    userId: string;
    vendor: string;
    deviceCode: string | null;
    displayName: string;
    ipAddress: string | null;
    macAddress: string | null;
    externalDeviceId: string;
    status: string;
    lastSeenAt: string | null;
    dataSource: string;
    createdAt: string;
    updatedAt: string;
  };
}

test.after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "devices-it-" } } });
  await prisma.$disconnect();
});

test("Usuario crea device dentro de su home y puede listarlo y ver detalle", async () => {
  const suffix = Date.now();
  const user = await registerUser(`devices-it-a-${suffix}@example.com`);
  const home = await createHome(user.token, {
    name: "devices-home-main",
    timezone: "America/Mexico_City",
  });

  const createResponse = await request(app)
    .post(`/homes/${home.id}/devices`)
    .set("authorization", `Bearer ${user.token}`)
    .send({
      vendor: " shelly ",
      displayName: " Living Room Plug ",
      externalDeviceId: " ext-device-a ",
      deviceCode: " s4plug ",
      ipAddress: " 192.168.1.10 ",
      macAddress: " AA:BB:CC:DD:EE:FF ",
    });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.device.userId, user.userId);
  assert.equal(createResponse.body.device.homeId, home.id);
  assert.equal(createResponse.body.device.vendor, "shelly");
  assert.equal(createResponse.body.device.displayName, "Living Room Plug");
  assert.equal(createResponse.body.device.externalDeviceId, "ext-device-a");
  assert.equal(createResponse.body.device.deviceCode, "s4plug");
  assert.equal(createResponse.body.device.ipAddress, "192.168.1.10");
  assert.equal(createResponse.body.device.macAddress, "AA:BB:CC:DD:EE:FF");

  const deviceId = createResponse.body.device.id as string;

  const listResponse = await request(app)
    .get(`/homes/${home.id}/devices`)
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.devices.length, 1);
  assert.equal(listResponse.body.devices[0].id, deviceId);

  const detailResponse = await request(app)
    .get(`/devices/${deviceId}`)
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.body.device.id, deviceId);
  assert.equal(detailResponse.body.device.homeId, home.id);
});

test("Ownership evita operar homes y devices de otros usuarios", async () => {
  const suffix = Date.now() + 1;
  const userA = await registerUser(`devices-it-a-${suffix}@example.com`);
  const userB = await registerUser(`devices-it-b-${suffix}@example.com`);
  const homeA = await createHome(userA.token, {
    name: "devices-owned-by-a",
    timezone: "America/Bogota",
  });
  const deviceA = await createDevice(userA.token, homeA.id, {
    externalDeviceId: "device-owned-by-a",
  });

  const createOnForeignHome = await request(app)
    .post(`/homes/${homeA.id}/devices`)
    .set("authorization", `Bearer ${userB.token}`)
    .send({
      vendor: "shelly",
      displayName: "blocked-device",
      externalDeviceId: "blocked-device",
    });
  assert.equal(createOnForeignHome.status, 404);
  assert.equal(createOnForeignHome.body.error, "HOME_NOT_FOUND");

  const listForeignHome = await request(app)
    .get(`/homes/${homeA.id}/devices`)
    .set("authorization", `Bearer ${userB.token}`);
  assert.equal(listForeignHome.status, 404);
  assert.equal(listForeignHome.body.error, "HOME_NOT_FOUND");

  const getForeignDevice = await request(app)
    .get(`/devices/${deviceA.id}`)
    .set("authorization", `Bearer ${userB.token}`);
  assert.equal(getForeignDevice.status, 404);
  assert.equal(getForeignDevice.body.error, "DEVICE_NOT_FOUND");

  const patchForeignDevice = await request(app)
    .patch(`/devices/${deviceA.id}`)
    .set("authorization", `Bearer ${userB.token}`)
    .send({ displayName: "should-not-update" });
  assert.equal(patchForeignDevice.status, 404);
  assert.equal(patchForeignDevice.body.error, "DEVICE_NOT_FOUND");

  const deleteForeignDevice = await request(app)
    .delete(`/devices/${deviceA.id}`)
    .set("authorization", `Bearer ${userB.token}`);
  assert.equal(deleteForeignDevice.status, 404);
  assert.equal(deleteForeignDevice.body.error, "DEVICE_NOT_FOUND");
});

test("Update parcial y move entre homes del mismo usuario funcionan", async () => {
  const suffix = Date.now() + 2;
  const user = await registerUser(`devices-it-a-${suffix}@example.com`);
  const homeA = await createHome(user.token, {
    name: "devices-move-a",
    timezone: "America/Lima",
  });
  const homeB = await createHome(user.token, {
    name: "devices-move-b",
    timezone: "America/Santiago",
  });
  const device = await createDevice(user.token, homeA.id, {
    externalDeviceId: "device-to-move",
    dataSource: "manual_import",
  });

  const patchResponse = await request(app)
    .patch(`/devices/${device.id}`)
    .set("authorization", `Bearer ${user.token}`)
    .send({
      displayName: "Bedroom Plug",
      homeId: homeB.id,
      status: "disabled",
    });

  assert.equal(patchResponse.status, 200);
  assert.equal(patchResponse.body.device.id, device.id);
  assert.equal(patchResponse.body.device.displayName, "Bedroom Plug");
  assert.equal(patchResponse.body.device.homeId, homeB.id);
  assert.equal(patchResponse.body.device.status, "disabled");
  assert.equal(patchResponse.body.device.dataSource, "manual_import");

  const oldHomeList = await request(app)
    .get(`/homes/${homeA.id}/devices`)
    .set("authorization", `Bearer ${user.token}`);
  assert.equal(oldHomeList.status, 200);
  assert.equal(oldHomeList.body.devices.length, 0);

  const newHomeList = await request(app)
    .get(`/homes/${homeB.id}/devices`)
    .set("authorization", `Bearer ${user.token}`);
  assert.equal(newHomeList.status, 200);
  assert.equal(newHomeList.body.devices.length, 1);
  assert.equal(newHomeList.body.devices[0].id, device.id);
});

test("Se valida home destino y unicidad del inventario", async () => {
  const suffix = Date.now() + 3;
  const userA = await registerUser(`devices-it-a-${suffix}@example.com`);
  const userB = await registerUser(`devices-it-b-${suffix}@example.com`);
  const homeA = await createHome(userA.token, {
    name: "devices-unique-a",
    timezone: "America/Guayaquil",
  });
  const homeB = await createHome(userB.token, {
    name: "devices-unique-b",
    timezone: "America/Panama",
  });

  const deviceA = await createDevice(userA.token, homeA.id, {
    vendor: "shelly",
    externalDeviceId: "duplicate-key-a",
  });
  const deviceB = await createDevice(userA.token, homeA.id, {
    vendor: "sonoff",
    externalDeviceId: "duplicate-key-b",
  });

  const duplicateCreate = await request(app)
    .post(`/homes/${homeA.id}/devices`)
    .set("authorization", `Bearer ${userA.token}`)
    .send({
      vendor: "shelly",
      displayName: "Duplicate Device",
      externalDeviceId: "duplicate-key-a",
    });
  assert.equal(duplicateCreate.status, 409);
  assert.equal(duplicateCreate.body.error, "DEVICE_ALREADY_EXISTS");

  const duplicateUpdate = await request(app)
    .patch(`/devices/${deviceB.id}`)
    .set("authorization", `Bearer ${userA.token}`)
    .send({
      vendor: "shelly",
      externalDeviceId: "duplicate-key-a",
    });
  assert.equal(duplicateUpdate.status, 409);
  assert.equal(duplicateUpdate.body.error, "DEVICE_ALREADY_EXISTS");

  const moveToForeignHome = await request(app)
    .patch(`/devices/${deviceA.id}`)
    .set("authorization", `Bearer ${userA.token}`)
    .send({ homeId: homeB.id });
  assert.equal(moveToForeignHome.status, 404);
  assert.equal(moveToForeignHome.body.error, "HOME_NOT_FOUND");
});

test("Delete y validaciones de params/body responden como se espera", async () => {
  const suffix = Date.now() + 4;
  const user = await registerUser(`devices-it-a-${suffix}@example.com`);
  const home = await createHome(user.token, {
    name: "devices-delete-home",
    timezone: "America/Costa_Rica",
  });
  const device = await createDevice(user.token, home.id, {
    externalDeviceId: "delete-me",
  });

  const invalidHomeParams = await request(app)
    .get("/homes/not-a-uuid/devices")
    .set("authorization", `Bearer ${user.token}`);
  assert.equal(invalidHomeParams.status, 400);
  assert.equal(invalidHomeParams.body.error, "INVALID_PARAMS");

  const invalidDeviceParams = await request(app)
    .get("/devices/not-a-uuid")
    .set("authorization", `Bearer ${user.token}`);
  assert.equal(invalidDeviceParams.status, 400);
  assert.equal(invalidDeviceParams.body.error, "INVALID_PARAMS");

  const invalidPatchBody = await request(app)
    .patch(`/devices/${device.id}`)
    .set("authorization", `Bearer ${user.token}`)
    .send({});
  assert.equal(invalidPatchBody.status, 400);
  assert.equal(invalidPatchBody.body.error, "INVALID_BODY");

  const deleteResponse = await request(app)
    .delete(`/devices/${device.id}`)
    .set("authorization", `Bearer ${user.token}`);
  assert.equal(deleteResponse.status, 204);

  const getAfterDelete = await request(app)
    .get(`/devices/${device.id}`)
    .set("authorization", `Bearer ${user.token}`);
  assert.equal(getAfterDelete.status, 404);
  assert.equal(getAfterDelete.body.error, "DEVICE_NOT_FOUND");
});
