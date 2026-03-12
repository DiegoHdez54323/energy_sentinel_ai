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
    refreshToken: registerResponse.body.refreshToken as string,
    userId: registerResponse.body.user.id as string,
  };
}

test.after(async () => {
  await prisma.home.deleteMany({ where: { name: { startsWith: "it-home-" } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: "homes-it-" } } });
  await prisma.$disconnect();
});

test("Usuario A crea y lista su home", async () => {
  const suffix = Date.now();
  const userA = await registerUser(`homes-it-a-${suffix}@example.com`);

  const createResponse = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${userA.token}`)
    .send({
      name: " it-home-main ",
      timezone: "America/Mexico_City",
    });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.home.name, "it-home-main");

  const listResponse = await request(app)
    .get("/homes")
    .set("authorization", `Bearer ${userA.token}`);

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.homes.length, 1);
  assert.equal(listResponse.body.homes[0].id, createResponse.body.home.id);
});

test("GET /homes solo devuelve homes del usuario autenticado", async () => {
  const suffix = Date.now() + 10;
  const userA = await registerUser(`homes-it-a-${suffix}@example.com`);
  const userB = await registerUser(`homes-it-b-${suffix}@example.com`);

  const homeA1 = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${userA.token}`)
    .send({
      name: "it-home-a-1",
      timezone: "America/Mexico_City",
    });
  assert.equal(homeA1.status, 201);

  const homeA2 = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${userA.token}`)
    .send({
      name: "it-home-a-2",
      timezone: "America/Bogota",
    });
  assert.equal(homeA2.status, 201);

  const homeB = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${userB.token}`)
    .send({
      name: "it-home-b-1",
      timezone: "America/Lima",
    });
  assert.equal(homeB.status, 201);

  const listResponse = await request(app)
    .get("/homes")
    .set("authorization", `Bearer ${userA.token}`);

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.homes.length, 2);

  const listedIds = new Set((listResponse.body.homes as Array<{ id: string }>).map((home) => home.id));
  assert.ok(listedIds.has(homeA1.body.home.id as string));
  assert.ok(listedIds.has(homeA2.body.home.id as string));
  assert.ok(!listedIds.has(homeB.body.home.id as string));

  for (const home of listResponse.body.homes as Array<{ userId: string }>) {
    assert.equal(home.userId, userA.userId);
  }
});

test("Usuario B no puede ver/editar/eliminar home de A", async () => {
  const suffix = Date.now() + 1;
  const userA = await registerUser(`homes-it-a-${suffix}@example.com`);
  const userB = await registerUser(`homes-it-b-${suffix}@example.com`);

  const createResponse = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${userA.token}`)
    .send({
      name: "it-home-owned-by-a",
      timezone: "America/Bogota",
    });

  const homeId = createResponse.body.home.id as string;

  const getResponse = await request(app)
    .get(`/homes/${homeId}`)
    .set("authorization", `Bearer ${userB.token}`);
  assert.equal(getResponse.status, 404);

  const patchResponse = await request(app)
    .patch(`/homes/${homeId}`)
    .set("authorization", `Bearer ${userB.token}`)
    .send({ name: "should-not-update" });
  assert.equal(patchResponse.status, 404);

  const deleteResponse = await request(app)
    .delete(`/homes/${homeId}`)
    .set("authorization", `Bearer ${userB.token}`);
  assert.equal(deleteResponse.status, 404);
});

test("Owner puede obtener detalle de su home", async () => {
  const suffix = Date.now() + 11;
  const user = await registerUser(`homes-it-a-${suffix}@example.com`);

  const createResponse = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${user.token}`)
    .send({
      name: "it-home-detail",
      timezone: "America/Guayaquil",
    });

  assert.equal(createResponse.status, 201);

  const detailResponse = await request(app)
    .get(`/homes/${createResponse.body.home.id as string}`)
    .set("authorization", `Bearer ${user.token}`);

  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.body.home.id, createResponse.body.home.id);
  assert.equal(detailResponse.body.home.userId, user.userId);
  assert.equal(detailResponse.body.home.name, "it-home-detail");
  assert.equal(detailResponse.body.home.timezone, "America/Guayaquil");
});

test("Update parcial funciona correctamente", async () => {
  const suffix = Date.now() + 2;
  const userA = await registerUser(`homes-it-a-${suffix}@example.com`);

  const createResponse = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${userA.token}`)
    .send({
      name: "it-home-partial",
      timezone: "America/Lima",
    });

  const homeId = createResponse.body.home.id as string;

  const patchResponse = await request(app)
    .patch(`/homes/${homeId}`)
    .set("authorization", `Bearer ${userA.token}`)
    .send({ timezone: "America/Santiago" });

  assert.equal(patchResponse.status, 200);
  assert.equal(patchResponse.body.home.name, "it-home-partial");
  assert.equal(patchResponse.body.home.timezone, "America/Santiago");
});

test("Rutas de homes rechazan request sin token", async () => {
  const suffix = Date.now() + 12;
  const user = await registerUser(`homes-it-a-${suffix}@example.com`);

  const createResponse = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${user.token}`)
    .send({
      name: "it-home-auth-check",
      timezone: "America/Panama",
    });
  assert.equal(createResponse.status, 201);

  const createWithoutToken = await request(app)
    .post("/homes")
    .send({
      name: "it-home-unauthorized",
      timezone: "America/Panama",
    });
  assert.equal(createWithoutToken.status, 401);
  assert.equal(createWithoutToken.body.error, "UNAUTHORIZED");

  const listWithoutToken = await request(app).get("/homes");
  assert.equal(listWithoutToken.status, 401);
  assert.equal(listWithoutToken.body.error, "UNAUTHORIZED");

  const detailWithoutToken = await request(app).get(`/homes/${createResponse.body.home.id as string}`);
  assert.equal(detailWithoutToken.status, 401);
  assert.equal(detailWithoutToken.body.error, "UNAUTHORIZED");
});

test("Rutas de homes rechazan tokens invalidos o con esquema incorrecto", async () => {
  const invalidSchemeResponse = await request(app)
    .get("/homes")
    .set("authorization", "Basic abc");
  assert.equal(invalidSchemeResponse.status, 401);
  assert.equal(invalidSchemeResponse.body.error, "UNAUTHORIZED");

  const invalidTokenResponse = await request(app)
    .get("/homes")
    .set("authorization", "Bearer not-a-jwt");
  assert.equal(invalidTokenResponse.status, 401);
  assert.equal(invalidTokenResponse.body.error, "UNAUTHORIZED");
});

test("Rutas de homes rechazan refresh token usado como bearer", async () => {
  const suffix = Date.now() + 13;
  const user = await registerUser(`homes-it-a-${suffix}@example.com`);

  const response = await request(app)
    .get("/homes")
    .set("authorization", `Bearer ${user.refreshToken}`);

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "UNAUTHORIZED");
});

test("POST /homes valida body invalido", async () => {
  const suffix = Date.now() + 14;
  const user = await registerUser(`homes-it-a-${suffix}@example.com`);

  const invalidTimezoneResponse = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${user.token}`)
    .send({
      name: "it-home-invalid-timezone",
      timezone: "Not/A_Real_Timezone",
    });
  assert.equal(invalidTimezoneResponse.status, 400);
  assert.equal(invalidTimezoneResponse.body.error, "INVALID_BODY");

  const invalidNameResponse = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${user.token}`)
    .send({
      name: "   ",
      timezone: "America/Mexico_City",
    });
  assert.equal(invalidNameResponse.status, 400);
  assert.equal(invalidNameResponse.body.error, "INVALID_BODY");
});

test("Delete elimina y luego devuelve 404 en lectura", async () => {
  const suffix = Date.now() + 3;
  const userA = await registerUser(`homes-it-a-${suffix}@example.com`);

  const createResponse = await request(app)
    .post("/homes")
    .set("authorization", `Bearer ${userA.token}`)
    .send({
      name: "it-home-delete",
      timezone: "America/Guayaquil",
    });

  const homeId = createResponse.body.home.id as string;

  const deleteResponse = await request(app)
    .delete(`/homes/${homeId}`)
    .set("authorization", `Bearer ${userA.token}`);
  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteResponse.body.ok, true);

  const getAfterDeleteResponse = await request(app)
    .get(`/homes/${homeId}`)
    .set("authorization", `Bearer ${userA.token}`);
  assert.equal(getAfterDeleteResponse.status, 404);
});
