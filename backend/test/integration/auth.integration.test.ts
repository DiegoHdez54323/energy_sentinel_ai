import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app/app.js";
import { prisma } from "../../src/lib/prisma.js";

const app = createApp();

test.after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "auth-it-" } } });
  await prisma.$disconnect();
});

test("Segundo login revoca refresh token previo", async () => {
  const email = `auth-it-${Date.now()}@example.com`;
  const password = "Password123!";

  const registerResponse = await request(app).post("/auth/register").send({
    email,
    password,
    name: "Auth Integration",
  });

  assert.equal(registerResponse.status, 201);
  const refreshTokenA = registerResponse.body.refreshToken as string;
  assert.ok(refreshTokenA);

  const loginResponse = await request(app).post("/auth/login").send({
    email,
    password,
  });

  assert.equal(loginResponse.status, 200);
  const refreshTokenB = loginResponse.body.refreshToken as string;
  assert.ok(refreshTokenB);
  assert.notEqual(refreshTokenA, refreshTokenB);

  const refreshWithOldToken = await request(app).post("/auth/refresh").send({
    refreshToken: refreshTokenA,
  });

  assert.equal(refreshWithOldToken.status, 401);
  assert.equal(refreshWithOldToken.body.error, "INVALID_REFRESH_TOKEN");

  const refreshWithCurrentToken = await request(app).post("/auth/refresh").send({
    refreshToken: refreshTokenB,
  });

  assert.equal(refreshWithCurrentToken.status, 200);
  assert.ok(refreshWithCurrentToken.body.accessToken);
  assert.ok(refreshWithCurrentToken.body.refreshToken);
});
