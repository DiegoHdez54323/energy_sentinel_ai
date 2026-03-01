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
