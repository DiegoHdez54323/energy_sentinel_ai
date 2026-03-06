import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app/app.js";
import { env } from "../../src/config/env.js";
import { prisma } from "../../src/lib/prisma.js";
import { getValidShellyAccessToken } from "../../src/modules/shelly/shelly.service.js";

const app = createApp();
const originalFetch = globalThis.fetch;

type ImportedDeviceResponse = {
  externalDeviceId: string;
  vendor: string;
  displayName: string;
  deviceCode: string | null;
  ipAddress: string | null;
  macAddress: string | null;
  status: string;
  lastSeenAt: string | null;
  dataSource: string;
};

function buildUnsignedJwt(payload: Record<string, unknown>): string {
  const header = { alg: "none", typ: "JWT" };

  return [
    Buffer.from(JSON.stringify(header)).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}

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

async function createHome(token: string, suffix: number) {
  const response = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${token}`)
    .send({
      name: `home-${suffix}`,
      timezone: "America/Mexico_City",
    });

  assert.equal(response.status, 201);
  return response.body.home as { id: string };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test.after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "shelly-it-" } } });
  await prisma.$disconnect();
});

test("POST /integrations/shelly requiere auth", async () => {
  const response = await request(app).post("/integrations/shelly");

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "UNAUTHORIZED");
});

test("GET /integrations/shelly requiere auth", async () => {
  const response = await request(app).get("/integrations/shelly");

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "UNAUTHORIZED");
});

test("POST /integrations/shelly/refresh requiere auth", async () => {
  const response = await request(app).post("/integrations/shelly/refresh");

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "UNAUTHORIZED");
});

test("POST /integrations/shelly/devices/discover requiere auth", async () => {
  const response = await request(app).post("/integrations/shelly/devices/discover");

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "UNAUTHORIZED");
});

test("POST /integrations/shelly/homes/:homeId/devices/import requiere auth", async () => {
  const response = await request(app).post("/integrations/shelly/homes/00000000-0000-0000-0000-000000000000/devices/import");

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "UNAUTHORIZED");
});

test("POST /integrations/shelly/devices/discover devuelve 404 sin integration", async () => {
  const suffix = Date.now() + 150;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);

  const response = await request(app)
    .post("/integrations/shelly/devices/discover")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 404);
  assert.equal(response.body.error, "SHELLY_INTEGRATION_NOT_FOUND");
});

test("POST /integrations/shelly/homes/:homeId/devices/import devuelve 404 sin integration", async () => {
  const suffix = Date.now() + 156;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const home = await createHome(user.token, suffix);

  const response = await request(app)
    .post(`/integrations/shelly/homes/${home.id}/devices/import`)
    .set("authorization", `Bearer ${user.token}`)
    .send({
      devices: [
        {
          externalDeviceId: "ext-without-integration",
          displayName: "Device without integration",
        },
      ],
    });

  assert.equal(response.status, 404);
  assert.equal(response.body.error, "SHELLY_INTEGRATION_NOT_FOUND");
});

test("POST /integrations/shelly/homes/:homeId/devices/import valida params y body", async () => {
  const suffix = Date.now() + 157;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);

  const invalidParams = await request(app)
    .post("/integrations/shelly/homes/not-a-uuid/devices/import")
    .set("authorization", `Bearer ${user.token}`)
    .send({
      devices: [
        {
          externalDeviceId: "ext-any",
          displayName: "Any",
        },
      ],
    });
  assert.equal(invalidParams.status, 400);
  assert.equal(invalidParams.body.error, "INVALID_PARAMS");

  const home = await createHome(user.token, suffix);

  const invalidBodyMissingDevices = await request(app)
    .post(`/integrations/shelly/homes/${home.id}/devices/import`)
    .set("authorization", `Bearer ${user.token}`)
    .send({});
  assert.equal(invalidBodyMissingDevices.status, 400);
  assert.equal(invalidBodyMissingDevices.body.error, "INVALID_BODY");

  const invalidBodyEmptyDevices = await request(app)
    .post(`/integrations/shelly/homes/${home.id}/devices/import`)
    .set("authorization", `Bearer ${user.token}`)
    .send({ devices: [] });
  assert.equal(invalidBodyEmptyDevices.status, 400);
  assert.equal(invalidBodyEmptyDevices.body.error, "INVALID_BODY");

  const invalidBodyMissingDisplayName = await request(app)
    .post(`/integrations/shelly/homes/${home.id}/devices/import`)
    .set("authorization", `Bearer ${user.token}`)
    .send({
      devices: [
        {
          externalDeviceId: "ext-any",
        },
      ],
    });
  assert.equal(invalidBodyMissingDisplayName.status, 400);
  assert.equal(invalidBodyMissingDisplayName.body.error, "INVALID_BODY");
});

test("POST /integrations/shelly/devices/discover clasifica nuevos y conocidos y actualiza lastSyncAt", async () => {
  const suffix = Date.now() + 151;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const home = await createHome(user.token, suffix);
  const userApiUrl = "https://shelly-discover-1.shelly.cloud";
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = buildUnsignedJwt({
    user_api_url: userApiUrl,
    exp,
  });

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl,
      authCode: "stored-auth-code",
      accessToken,
      accessTokenExpiresAt: new Date(exp * 1000),
      status: "active",
      lastSyncAt: null,
    },
  });

  await prisma.device.create({
    data: {
      userId: user.userId,
      homeId: home.id,
      vendor: "shelly",
      displayName: "Existing Device",
      externalDeviceId: "ext-existing",
      status: "active",
      dataSource: "shelly_cloud",
    },
  });

  let fetchUrl = "";
  let authorizationHeader = "";
  globalThis.fetch = (async (input, init) => {
    fetchUrl = String(input);
    authorizationHeader = new Headers(init?.headers).get("authorization") ?? "";

    return new Response(JSON.stringify({
      "ext-existing": {
        id: "ext-existing",
        code: "SPSW-001",
        mac: "A1:B2:C3:D4:E5:F6",
        ip: "192.168.1.10",
        online: true,
        name: "Shelly Existing",
      },
      "ext-new": {
        id: "ext-new",
        code: "SPSW-002",
        _info: {
          mac: "F6:E5:D4:C3:B2:A1",
          ip: "192.168.1.11",
          online: false,
        },
        name: "Shelly New",
      },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  const response = await request(app)
    .post("/integrations/shelly/devices/discover")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 200);
  assert.equal(fetchUrl, "https://shelly-discover-1.shelly.cloud/device/all_status?show_info=true&no_shared=true");
  assert.equal(authorizationHeader, `Bearer ${accessToken}`);

  assert.equal(response.body.discovery.counts.totalShelly, 2);
  assert.equal(response.body.discovery.counts.new, 1);
  assert.equal(response.body.discovery.counts.alreadyKnown, 1);
  assert.equal(response.body.discovery.counts.invalid, 0);

  assert.equal(response.body.discovery.newDevices.length, 1);
  assert.equal(response.body.discovery.newDevices[0].externalDeviceId, "ext-new");
  assert.equal(response.body.discovery.newDevices[0].isOnline, false);

  assert.equal(response.body.discovery.alreadyKnown.length, 1);
  assert.equal(response.body.discovery.alreadyKnown[0].externalDeviceId, "ext-existing");
  assert.equal(response.body.discovery.alreadyKnown[0].displayName, "Existing Device");

  const integration = await prisma.shellyIntegration.findUnique({
    where: { userId: user.userId },
  });
  assert.ok(integration?.lastSyncAt);
});

test("POST /integrations/shelly/devices/discover reintenta con refresh cuando Shelly invalida token", async () => {
  const suffix = Date.now() + 152;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const userApiUrl = "https://shelly-discover-retry.shelly.cloud";
  const oldExp = Math.floor(Date.now() / 1000) + 3600;
  const oldToken = buildUnsignedJwt({
    user_api_url: userApiUrl,
    exp: oldExp,
  });
  const refreshedExp = Math.floor(Date.now() / 1000) + 7200;
  const refreshedToken = buildUnsignedJwt({
    user_api_url: userApiUrl,
    exp: refreshedExp,
  });

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl,
      authCode: "stored-auth-code",
      accessToken: oldToken,
      accessTokenExpiresAt: new Date(oldExp * 1000),
      status: "active",
    },
  });

  let discoveryCalls = 0;
  let exchangeCalls = 0;
  globalThis.fetch = (async (input) => {
    const url = String(input);

    if (url.endsWith("/oauth/auth")) {
      exchangeCalls += 1;
      return new Response(JSON.stringify({ access_token: refreshedToken }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/device/all_status")) {
      discoveryCalls += 1;
      if (discoveryCalls === 1) {
        return new Response(JSON.stringify({
          isok: false,
          error: "UNAUTHORIZED",
          errors: {
            invalid_token: "expired",
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        "ext-retry": {
          id: "ext-retry",
          online: true,
          _info: {
            ip: "192.168.1.15",
            mac: "AA:BB:CC:DD:EE:11",
          },
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unexpected_url" }), { status: 500 });
  }) as typeof fetch;

  const response = await request(app)
    .post("/integrations/shelly/devices/discover")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 200);
  assert.equal(discoveryCalls, 2);
  assert.equal(exchangeCalls, 1);
  assert.equal(response.body.discovery.counts.new, 1);

  const integration = await prisma.shellyIntegration.findUnique({
    where: { userId: user.userId },
  });
  assert.ok(integration);
  assert.equal(integration.accessToken, refreshedToken);
  assert.equal(integration.status, "active");
});

test("POST /integrations/shelly/devices/discover responde 502 cuando Shelly falla sin invalid_token", async () => {
  const suffix = Date.now() + 158;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const userApiUrl = "https://shelly-discover-error.shelly.cloud";
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = buildUnsignedJwt({
    user_api_url: userApiUrl,
    exp,
  });

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl,
      authCode: "stored-auth-code",
      accessToken,
      accessTokenExpiresAt: new Date(exp * 1000),
      status: "active",
    },
  });

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({
      isok: false,
      error: "INTERNAL_ERROR",
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  const response = await request(app)
    .post("/integrations/shelly/devices/discover")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 502);
  assert.equal(response.body.error, "SHELLY_DISCOVERY_FAILED");
});

test("POST /integrations/shelly/devices/discover extrae ip/mac/online desde data.devices_status", async () => {
  const suffix = Date.now() + 155;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const userApiUrl = "https://shelly-discover-structure.shelly.cloud";
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = buildUnsignedJwt({
    user_api_url: userApiUrl,
    exp,
  });

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl,
      authCode: "stored-auth-code",
      accessToken,
      accessTokenExpiresAt: new Date(exp * 1000),
      status: "active",
    },
  });

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({
      isok: true,
      data: {
        devices_status: {
          "58e6c50a5b38": {
            id: "58e6c50a5b38",
            code: "S4PL-00116US",
            sys: { mac: "58E6C50A5B38" },
            wifi: { sta_ip: "192.168.2.18" },
            cloud: { connected: true },
            _dev_info: { online: true },
          },
        },
      },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  const response = await request(app)
    .post("/integrations/shelly/devices/discover")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.discovery.counts.totalShelly, 1);
  assert.equal(response.body.discovery.counts.new, 1);
  assert.equal(response.body.discovery.newDevices[0].externalDeviceId, "58e6c50a5b38");
  assert.equal(response.body.discovery.newDevices[0].deviceCode, "S4PL-00116US");
  assert.equal(response.body.discovery.newDevices[0].ipAddress, "192.168.2.18");
  assert.equal(response.body.discovery.newDevices[0].macAddress, "58E6C50A5B38");
  assert.equal(response.body.discovery.newDevices[0].isOnline, true);
});

test("GET /integrations/shelly devuelve not_connected cuando no existe integration", async () => {
  const suffix = Date.now() + 101;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);

  const response = await request(app)
    .get("/integrations/shelly")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.integration, {
    connected: false,
    status: "not_connected",
    userApiUrl: null,
    accessTokenExpiresAt: null,
    isAccessTokenValid: false,
    needsRefresh: false,
    lastSyncAt: null,
  });
});

test("POST /integrations/shelly/homes/:homeId/devices/import valida ownership de home", async () => {
  const suffix = Date.now() + 153;
  const userA = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const userB = await registerUser(`shelly-it-b-${suffix}@example.com`);
  const homeB = await createHome(userB.token, suffix);

  const response = await request(app)
    .post(`/integrations/shelly/homes/${homeB.id}/devices/import`)
    .set("authorization", `Bearer ${userA.token}`)
    .send({
      devices: [
        {
          externalDeviceId: "ext-any",
          displayName: "Device A",
        },
      ],
    });

  assert.equal(response.status, 404);
  assert.equal(response.body.error, "HOME_NOT_FOUND");
});

test("POST /integrations/shelly/homes/:homeId/devices/import inserta nuevos y omite existentes", async () => {
  const suffix = Date.now() + 154;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const home = await createHome(user.token, suffix);
  const userApiUrl = "https://shelly-import-1.shelly.cloud";
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = buildUnsignedJwt({
    user_api_url: userApiUrl,
    exp,
  });

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl,
      authCode: "stored-auth-code",
      accessToken,
      accessTokenExpiresAt: new Date(exp * 1000),
      status: "active",
    },
  });

  await prisma.device.create({
    data: {
      userId: user.userId,
      homeId: home.id,
      vendor: "shelly",
      displayName: "Already Imported",
      externalDeviceId: "ext-existing",
      status: "active",
      dataSource: "shelly_cloud",
    },
  });

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({
      "ext-existing": {
        id: "ext-existing",
        online: true,
        _info: { ip: "192.168.1.20", mac: "AA:AA:AA:AA:AA:AA" },
        code: "SHELLY-EXISTING",
      },
      "ext-online": {
        id: "ext-online",
        online: true,
        _info: { ip: "192.168.1.21", mac: "BB:BB:BB:BB:BB:BB" },
        code: "SHELLY-ONLINE",
      },
      "ext-offline": {
        id: "ext-offline",
        online: false,
        _info: { ip: "192.168.1.22", mac: "CC:CC:CC:CC:CC:CC" },
        code: "SHELLY-OFFLINE",
      },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  const response = await request(app)
    .post(`/integrations/shelly/homes/${home.id}/devices/import`)
    .set("authorization", `Bearer ${user.token}`)
    .send({
      devices: [
        {
          externalDeviceId: "ext-existing",
          displayName: "Should Skip Existing",
        },
        {
          externalDeviceId: "ext-online",
          displayName: "Kitchen Plug",
        },
        {
          externalDeviceId: "ext-offline",
          displayName: "Garage Relay",
          vendor: "shelly_pro",
        },
        {
          externalDeviceId: "ext-missing",
          displayName: "Not in cloud",
        },
        {
          externalDeviceId: "ext-online",
          displayName: "Duplicated request",
        },
      ],
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.import.summary.requested, 5);
  assert.equal(response.body.import.summary.created, 2);
  assert.equal(response.body.import.summary.skipped, 3);
  assert.equal(response.body.import.summary.errors, 0);

  const skippedReasons = response.body.import.skipped.map((item: { reason: string }) => item.reason);
  assert.deepEqual(skippedReasons.sort(), ["ALREADY_IMPORTED", "DUPLICATED_IN_REQUEST", "NOT_FOUND_IN_SHELLY"]);

  const createdByExternalId = new Map(
    (response.body.import.created as ImportedDeviceResponse[]).map((device) => [device.externalDeviceId, device]),
  );

  const onlineCreated = createdByExternalId.get("ext-online");
  assert.ok(onlineCreated);
  assert.equal(onlineCreated.vendor, "shelly");
  assert.equal(onlineCreated.displayName, "Kitchen Plug");
  assert.equal(onlineCreated.deviceCode, "SHELLY-ONLINE");
  assert.equal(onlineCreated.ipAddress, "192.168.1.21");
  assert.equal(onlineCreated.macAddress, "BB:BB:BB:BB:BB:BB");
  assert.equal(onlineCreated.status, "active");
  assert.ok(onlineCreated.lastSeenAt);
  assert.equal(onlineCreated.dataSource, "shelly_cloud");

  const offlineCreated = createdByExternalId.get("ext-offline");
  assert.ok(offlineCreated);
  assert.equal(offlineCreated.vendor, "shelly_pro");
  assert.equal(offlineCreated.displayName, "Garage Relay");
  assert.equal(offlineCreated.deviceCode, "SHELLY-OFFLINE");
  assert.equal(offlineCreated.ipAddress, "192.168.1.22");
  assert.equal(offlineCreated.macAddress, "CC:CC:CC:CC:CC:CC");
  assert.equal(offlineCreated.status, "disabled");
  assert.equal(offlineCreated.lastSeenAt, null);
  assert.equal(offlineCreated.dataSource, "shelly_cloud");

  const devicesInDb = await prisma.device.findMany({
    where: { userId: user.userId },
    orderBy: { externalDeviceId: "asc" },
    select: {
      externalDeviceId: true,
      status: true,
      vendor: true,
      dataSource: true,
      homeId: true,
    },
  });

  assert.equal(devicesInDb.length, 3);
  assert.deepEqual(
    devicesInDb.map((device) => device.externalDeviceId),
    ["ext-existing", "ext-offline", "ext-online"],
  );
  const secondDevice = devicesInDb.at(1);
  const thirdDevice = devicesInDb.at(2);
  assert.ok(secondDevice);
  assert.ok(thirdDevice);
  assert.equal(secondDevice.status, "disabled");
  assert.equal(thirdDevice.status, "active");
  assert.ok(devicesInDb.every((device) => device.homeId === home.id));
});

test("POST /integrations/shelly/homes/:homeId/devices/import reintenta con refresh cuando Shelly invalida token", async () => {
  const suffix = Date.now() + 159;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const home = await createHome(user.token, suffix);
  const userApiUrl = "https://shelly-import-retry.shelly.cloud";
  const oldExp = Math.floor(Date.now() / 1000) + 3600;
  const oldAccessToken = buildUnsignedJwt({
    user_api_url: userApiUrl,
    exp: oldExp,
  });
  const refreshedExp = Math.floor(Date.now() / 1000) + 7200;
  const refreshedToken = buildUnsignedJwt({
    user_api_url: userApiUrl,
    exp: refreshedExp,
  });

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl,
      authCode: "stored-auth-code",
      accessToken: oldAccessToken,
      accessTokenExpiresAt: new Date(oldExp * 1000),
      status: "active",
    },
  });

  let discoveryCalls = 0;
  let exchangeCalls = 0;
  globalThis.fetch = (async (input) => {
    const url = String(input);

    if (url.endsWith("/oauth/auth")) {
      exchangeCalls += 1;
      return new Response(JSON.stringify({ access_token: refreshedToken }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/device/all_status")) {
      discoveryCalls += 1;
      if (discoveryCalls === 1) {
        return new Response(JSON.stringify({
          isok: false,
          error: "UNAUTHORIZED",
          errors: {
            invalid_token: "expired",
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        "ext-import-retry": {
          id: "ext-import-retry",
          code: "S4PL-RETRY",
          _dev_info: {
            online: true,
          },
          wifi: {
            sta_ip: "192.168.2.88",
          },
          sys: {
            mac: "58E6C50A5B38",
          },
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unexpected_url" }), {
      status: 500,
    });
  }) as typeof fetch;

  const response = await request(app)
    .post(`/integrations/shelly/homes/${home.id}/devices/import`)
    .set("authorization", `Bearer ${user.token}`)
    .send({
      devices: [
        {
          externalDeviceId: "ext-import-retry",
          displayName: "Retry Device",
        },
      ],
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.import.summary.created, 1);
  assert.equal(discoveryCalls, 2);
  assert.equal(exchangeCalls, 1);

  const integration = await prisma.shellyIntegration.findUnique({
    where: { userId: user.userId },
  });
  assert.ok(integration);
  assert.equal(integration.accessToken, refreshedToken);
  assert.equal(integration.status, "active");
});

test("GET /integrations/shelly devuelve estado detallado cuando existe integration activa", async () => {
  const suffix = Date.now() + 102;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const accessTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const lastSyncAt = new Date(Date.now() - 30 * 1000);

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl: "https://shelly-status-active.shelly.cloud",
      authCode: "stored-auth-code",
      accessToken: "stored-access-token",
      accessTokenExpiresAt,
      status: "active",
      lastSyncAt,
    },
  });

  const response = await request(app)
    .get("/integrations/shelly")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.integration, {
    connected: true,
    status: "active",
    userApiUrl: "https://shelly-status-active.shelly.cloud",
    accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
    isAccessTokenValid: true,
    needsRefresh: false,
    lastSyncAt: lastSyncAt.toISOString(),
  });
});

test("GET /integrations/shelly marca needsRefresh cuando token esta por vencer", async () => {
  const suffix = Date.now() + 103;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const accessTokenExpiresAt = new Date(Date.now() + 2 * 60 * 1000);

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl: "https://shelly-status-near-expiry.shelly.cloud",
      authCode: "stored-auth-code",
      accessToken: "stored-access-token",
      accessTokenExpiresAt,
      status: "active",
    },
  });

  const response = await request(app)
    .get("/integrations/shelly")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.integration.connected, true);
  assert.equal(response.body.integration.isAccessTokenValid, true);
  assert.equal(response.body.integration.needsRefresh, true);
});

test("GET /integrations/shelly marca token invalido cuando ya expiro", async () => {
  const suffix = Date.now() + 104;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const accessTokenExpiresAt = new Date(Date.now() - 2 * 60 * 1000);

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl: "https://shelly-status-expired.shelly.cloud",
      authCode: "stored-auth-code",
      accessToken: "stored-access-token",
      accessTokenExpiresAt,
      status: "active",
    },
  });

  const response = await request(app)
    .get("/integrations/shelly")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.integration.connected, true);
  assert.equal(response.body.integration.isAccessTokenValid, false);
  assert.equal(response.body.integration.needsRefresh, true);
});

test("GET /integrations/shelly refleja status error", async () => {
  const suffix = Date.now() + 105;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl: "https://shelly-status-error.shelly.cloud",
      authCode: "stored-auth-code",
      accessToken: null,
      accessTokenExpiresAt: null,
      status: "error",
    },
  });

  const response = await request(app)
    .get("/integrations/shelly")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.integration.connected, true);
  assert.equal(response.body.integration.status, "error");
  assert.equal(response.body.integration.isAccessTokenValid, false);
  assert.equal(response.body.integration.needsRefresh, true);
});

test("POST /integrations/shelly crea state y retorna authUrl", async () => {
  const suffix = Date.now();
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);

  const response = await request(app)
    .post("/integrations/shelly")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 200);
  assert.ok(response.body.authUrl);

  const authUrl = new URL(response.body.authUrl as string);
  assert.equal(authUrl.origin, "https://my.shelly.cloud");
  assert.equal(authUrl.pathname, "/oauth_login.html");
  assert.equal(authUrl.searchParams.get("response_type"), "code");
  assert.equal(authUrl.searchParams.get("client_id"), "shelly-diy");
  assert.equal(authUrl.searchParams.get("redirect_uri"), env.SHELLY_OAUTH_REDIRECT_URI);

  const state = authUrl.searchParams.get("state");
  assert.ok(state);

  const storedState = await prisma.shellyOAuthState.findUnique({
    where: { state: state as string },
  });

  assert.ok(storedState);
  assert.equal(storedState.userId, user.userId);
  assert.equal(storedState.consumedAt, null);
});

test("GET /integrations/shelly/callback rechaza query invalido", async () => {
  const missingCode = await request(app).get("/integrations/shelly/callback").query({ state: "abc" });
  assert.equal(missingCode.status, 400);
  assert.equal(missingCode.body.error, "INVALID_QUERY");

  const missingState = await request(app).get("/integrations/shelly/callback").query({ code: "abc" });
  assert.equal(missingState.status, 400);
  assert.equal(missingState.body.error, "INVALID_QUERY");
});

test("GET /integrations/shelly/callback rechaza state inexistente", async () => {
  const response = await request(app)
    .get("/integrations/shelly/callback")
    .query({
      code: buildUnsignedJwt({ user_api_url: "shelly-test-1.shelly.cloud" }),
      state: "missing-state",
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "INVALID_STATE");
});

test("GET /integrations/shelly/callback rechaza state expirado", async () => {
  const suffix = Date.now() + 1;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);

  await prisma.shellyOAuthState.create({
    data: {
      userId: user.userId,
      state: "expired-state",
      expiresAt: new Date(Date.now() - 60_000),
    },
  });

  const response = await request(app)
    .get("/integrations/shelly/callback")
    .query({
      code: buildUnsignedJwt({ user_api_url: "shelly-test-2.shelly.cloud" }),
      state: "expired-state",
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "INVALID_STATE");
});

test("GET /integrations/shelly/callback rechaza state ya consumido", async () => {
  const suffix = Date.now() + 2;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);

  await prisma.shellyOAuthState.create({
    data: {
      userId: user.userId,
      state: "consumed-state",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
    },
  });

  const response = await request(app)
    .get("/integrations/shelly/callback")
    .query({
      code: buildUnsignedJwt({ user_api_url: "shelly-test-3.shelly.cloud" }),
      state: "consumed-state",
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "INVALID_STATE");
});

test("Callback exitoso persiste integracion y responde HTML", async () => {
  const suffix = Date.now() + 3;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const state = "success-state";
  const code = buildUnsignedJwt({
    user_api_url: "shelly-success-1.shelly.cloud",
  });
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = buildUnsignedJwt({
    user_api_url: "shelly-success-1.shelly.cloud",
    exp,
  });

  await prisma.shellyOAuthState.create({
    data: {
      userId: user.userId,
      state,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ access_token: accessToken }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  const response = await request(app)
    .get("/integrations/shelly/callback")
    .query({ code, state });

  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"] as string, /text\/html/);
  assert.match(response.text, /Shelly conectado/);

  const integration = await prisma.shellyIntegration.findUnique({
    where: { userId: user.userId },
  });

  assert.ok(integration);
  assert.equal(integration.clientId, "shelly-diy");
  assert.equal(integration.authCode, code);
  assert.equal(integration.userApiUrl, "shelly-success-1.shelly.cloud");
  assert.equal(integration.accessToken, accessToken);
  assert.equal(integration.status, "active");
  assert.ok(integration.accessTokenExpiresAt);
  assert.equal(integration.accessTokenExpiresAt?.toISOString(), new Date(exp * 1000).toISOString());

  const storedState = await prisma.shellyOAuthState.findUnique({
    where: { state },
  });

  assert.ok(storedState?.consumedAt);
});

test("Callback llama al host derivado de user_api_url y envia form-urlencoded correcto", async () => {
  const suffix = Date.now() + 4;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const state = "host-check-state";
  const code = buildUnsignedJwt({
    user_api_url: "https://shelly-host-check.shelly.cloud/api",
  });
  const accessToken = buildUnsignedJwt({
    user_api_url: "https://shelly-host-check.shelly.cloud/api",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  await prisma.shellyOAuthState.create({
    data: {
      userId: user.userId,
      state,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  let fetchUrl = "";
  let fetchBody = "";

  globalThis.fetch = (async (input, init) => {
    fetchUrl = String(input);
    fetchBody = String(init?.body ?? "");

    return new Response(JSON.stringify({ access_token: accessToken }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  const response = await request(app)
    .get("/integrations/shelly/callback")
    .query({ code, state });

  assert.equal(response.status, 200);
  assert.equal(fetchUrl, "https://shelly-host-check.shelly.cloud/oauth/auth");

  const body = new URLSearchParams(fetchBody);
  assert.equal(body.get("client_id"), "shelly-diy");
  assert.equal(body.get("grant_type"), "code");
  assert.equal(body.get("code"), code);
  assert.equal(body.get("redirect_uri"), env.SHELLY_OAUTH_REDIRECT_URI);
});

test("Callback maneja error de Shelly y marca integration en error", async () => {
  const suffix = Date.now() + 5;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const state = "error-state";
  const code = buildUnsignedJwt({
    user_api_url: "shelly-error-1.shelly.cloud",
  });

  await prisma.shellyOAuthState.create({
    data: {
      userId: user.userId,
      state,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ error: "upstream_error" }), {
      status: 500,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  const response = await request(app)
    .get("/integrations/shelly/callback")
    .query({ code, state });

  assert.equal(response.status, 502);
  assert.equal(response.body.error, "SHELLY_TOKEN_EXCHANGE_FAILED");

  const integration = await prisma.shellyIntegration.findUnique({
    where: { userId: user.userId },
  });

  assert.ok(integration);
  assert.equal(integration.status, "error");
  assert.equal(integration.authCode, code);
  assert.equal(integration.userApiUrl, "shelly-error-1.shelly.cloud");
  assert.equal(integration.accessToken, null);
  assert.equal(integration.accessTokenExpiresAt, null);
});

test("Callback fallido conserva userApiUrl previa cuando la integration ya existia", async () => {
  const suffix = Date.now() + 106;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const state = `error-preserve-state-${suffix}`;
  const code = buildUnsignedJwt({
    user_api_url: "https://shelly-new-from-code.shelly.cloud",
  });

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl: "https://shelly-existing-valid.shelly.cloud",
      authCode: "old-auth-code",
      accessToken: "old-access-token",
      accessTokenExpiresAt: new Date(Date.now() + 60_000),
      status: "active",
    },
  });

  await prisma.shellyOAuthState.create({
    data: {
      userId: user.userId,
      state,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ error: "upstream_error" }), {
      status: 500,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  const response = await request(app)
    .get("/integrations/shelly/callback")
    .query({ code, state });

  assert.equal(response.status, 502);
  assert.equal(response.body.error, "SHELLY_TOKEN_EXCHANGE_FAILED");

  const integration = await prisma.shellyIntegration.findUnique({
    where: { userId: user.userId },
  });

  assert.ok(integration);
  assert.equal(integration.status, "error");
  assert.equal(integration.authCode, code);
  assert.equal(integration.userApiUrl, "https://shelly-existing-valid.shelly.cloud");
  assert.equal(integration.accessToken, null);
  assert.equal(integration.accessTokenExpiresAt, null);
});

test("Callback rechaza access token sin exp", async () => {
  const suffix = Date.now() + 6;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const state = "missing-exp-state";
  const code = buildUnsignedJwt({
    user_api_url: "shelly-exp-1.shelly.cloud",
  });
  const accessToken = buildUnsignedJwt({
    user_api_url: "shelly-exp-1.shelly.cloud",
  });

  await prisma.shellyOAuthState.create({
    data: {
      userId: user.userId,
      state,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ access_token: accessToken }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  const response = await request(app)
    .get("/integrations/shelly/callback")
    .query({ code, state });

  assert.equal(response.status, 502);
  assert.equal(response.body.error, "INVALID_SHELLY_ACCESS_TOKEN");

  const integration = await prisma.shellyIntegration.findUnique({
    where: { userId: user.userId },
  });

  assert.ok(integration);
  assert.equal(integration.status, "error");
  assert.equal(integration.accessToken, null);
  assert.equal(integration.accessTokenExpiresAt, null);
});

test("Callback rechaza replay del mismo state", async () => {
  const suffix = Date.now() + 7;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const state = "replay-state";
  const code = buildUnsignedJwt({
    user_api_url: "shelly-replay-1.shelly.cloud",
  });
  const accessToken = buildUnsignedJwt({
    user_api_url: "shelly-replay-1.shelly.cloud",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  await prisma.shellyOAuthState.create({
    data: {
      userId: user.userId,
      state,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ access_token: accessToken }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  const firstResponse = await request(app)
    .get("/integrations/shelly/callback")
    .query({ code, state });
  assert.equal(firstResponse.status, 200);

  const secondResponse = await request(app)
    .get("/integrations/shelly/callback")
    .query({ code, state });
  assert.equal(secondResponse.status, 400);
  assert.equal(secondResponse.body.error, "INVALID_STATE");
});

test("POST /integrations/shelly/refresh devuelve 404 si no hay integration", async () => {
  const suffix = Date.now() + 8;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);

  const response = await request(app)
    .post("/integrations/shelly/refresh")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 404);
  assert.equal(response.body.error, "SHELLY_INTEGRATION_NOT_FOUND");
});

test("POST /integrations/shelly/refresh regenera access token usando authCode", async () => {
  const suffix = Date.now() + 9;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const authCode = "stored-auth-code";
  const oldExpiresAt = new Date(Date.now() - 60_000);
  const newExp = Math.floor(Date.now() / 1000) + 3600;
  const newAccessToken = buildUnsignedJwt({
    user_api_url: "shelly-refresh-1.shelly.cloud",
    exp: newExp,
  });

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl: "shelly-refresh-1.shelly.cloud",
      authCode,
      accessToken: "old-access-token",
      accessTokenExpiresAt: oldExpiresAt,
      status: "error",
    },
  });

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ access_token: newAccessToken }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  const response = await request(app)
    .post("/integrations/shelly/refresh")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "active");
  assert.equal(response.body.userApiUrl, "shelly-refresh-1.shelly.cloud");
  assert.equal(response.body.accessTokenExpiresAt, new Date(newExp * 1000).toISOString());
  assert.ok(!("accessToken" in response.body));

  const integration = await prisma.shellyIntegration.findUnique({
    where: { userId: user.userId },
  });

  assert.ok(integration);
  assert.equal(integration.accessToken, newAccessToken);
  assert.equal(integration.status, "active");
  assert.equal(integration.accessTokenExpiresAt?.toISOString(), new Date(newExp * 1000).toISOString());
});

test("POST /integrations/shelly/refresh limpia token y marca error si Shelly falla", async () => {
  const suffix = Date.now() + 10;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl: "shelly-refresh-error-1.shelly.cloud",
      authCode: "stored-auth-code",
      accessToken: "old-access-token",
      accessTokenExpiresAt: new Date(Date.now() + 60_000),
      status: "active",
    },
  });

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ error: "upstream_error" }), {
      status: 500,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  const response = await request(app)
    .post("/integrations/shelly/refresh")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 502);
  assert.equal(response.body.error, "SHELLY_TOKEN_EXCHANGE_FAILED");

  const integration = await prisma.shellyIntegration.findUnique({
    where: { userId: user.userId },
  });

  assert.ok(integration);
  assert.equal(integration.status, "error");
  assert.equal(integration.accessToken, null);
  assert.equal(integration.accessTokenExpiresAt, null);
});

test("DELETE /integrations/shelly requiere auth", async () => {
  const response = await request(app).delete("/integrations/shelly");

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "UNAUTHORIZED");
});

test("DELETE /integrations/shelly borra integration y limpia states", async () => {
  const suffix = Date.now() + 11;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl: "shelly-delete-1.shelly.cloud",
      authCode: "stored-auth-code",
      accessToken: "stored-access-token",
      accessTokenExpiresAt: new Date(Date.now() + 60_000),
      status: "active",
    },
  });

  await prisma.shellyOAuthState.createMany({
    data: [
      {
        userId: user.userId,
        state: `delete-state-a-${suffix}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        userId: user.userId,
        state: `delete-state-b-${suffix}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    ],
  });

  const response = await request(app)
    .delete("/integrations/shelly")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 204);

  const integration = await prisma.shellyIntegration.findUnique({
    where: { userId: user.userId },
  });
  assert.equal(integration, null);

  const stateCount = await prisma.shellyOAuthState.count({
    where: { userId: user.userId },
  });
  assert.equal(stateCount, 0);
});

test("DELETE /integrations/shelly es idempotente", async () => {
  const suffix = Date.now() + 12;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);

  const response = await request(app)
    .delete("/integrations/shelly")
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(response.status, 204);
});

test("getValidShellyAccessToken reutiliza token vigente sin llamar fetch", async () => {
  const suffix = Date.now() + 13;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const validUntil = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl: "shelly-helper-valid-1.shelly.cloud",
      authCode: "stored-auth-code",
      accessToken: "still-valid-token",
      accessTokenExpiresAt: validUntil,
      status: "active",
    },
  });

  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  const tokenContext = await getValidShellyAccessToken(user.userId);

  assert.equal(fetchCalled, false);
  assert.equal(tokenContext.accessToken, "still-valid-token");
  assert.equal(tokenContext.userApiUrl, "shelly-helper-valid-1.shelly.cloud");
  assert.equal(tokenContext.accessTokenExpiresAt.toISOString(), validUntil.toISOString());
});

test("getValidShellyAccessToken refresca token vencido", async () => {
  const suffix = Date.now() + 14;
  const user = await registerUser(`shelly-it-a-${suffix}@example.com`);
  const newExp = Math.floor(Date.now() / 1000) + 5400;
  const newAccessToken = buildUnsignedJwt({
    user_api_url: "shelly-helper-refresh-1.shelly.cloud",
    exp: newExp,
  });

  await prisma.shellyIntegration.create({
    data: {
      userId: user.userId,
      clientId: "shelly-diy",
      userApiUrl: "shelly-helper-refresh-1.shelly.cloud",
      authCode: "stored-auth-code",
      accessToken: "expired-token",
      accessTokenExpiresAt: new Date(Date.now() - 60_000),
      status: "active",
    },
  });

  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ access_token: newAccessToken }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  const tokenContext = await getValidShellyAccessToken(user.userId);

  assert.equal(fetchCalled, true);
  assert.equal(tokenContext.accessToken, newAccessToken);
  assert.equal(tokenContext.userApiUrl, "shelly-helper-refresh-1.shelly.cloud");
  assert.equal(tokenContext.accessTokenExpiresAt.toISOString(), new Date(newExp * 1000).toISOString());

  const integration = await prisma.shellyIntegration.findUnique({
    where: { userId: user.userId },
  });

  assert.ok(integration);
  assert.equal(integration.accessToken, newAccessToken);
  assert.equal(integration.status, "active");
});
