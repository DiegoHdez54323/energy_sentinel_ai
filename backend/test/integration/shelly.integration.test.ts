import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app/app.js";
import { env } from "../../src/config/env.js";
import { prisma } from "../../src/lib/prisma.js";
import { getValidShellyAccessToken } from "../../src/modules/shelly/shelly.service.js";

const app = createApp();
const originalFetch = globalThis.fetch;

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
