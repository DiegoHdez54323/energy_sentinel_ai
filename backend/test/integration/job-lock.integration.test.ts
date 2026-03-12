import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { withJobLock } from "../../src/lib/job-lock.js";

test.after(async () => {
  await prisma.$disconnect();
});

test("withJobLock evita solapes del mismo lock", async () => {
  let releaseFirst: (() => void) | undefined;
  let firstStarted = false;

  const firstRun = withJobLock({ key: "test-lock", leaseMs: 60_000 }, async () => {
    firstStarted = true;
    await new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    return "first";
  });

  while (!firstStarted) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const secondRun = await withJobLock({ key: "test-lock", leaseMs: 60_000 }, async () => "second");
  assert.deepEqual(secondRun, { acquired: false });

  assert.ok(releaseFirst);
  releaseFirst();

  const firstResult = await firstRun;
  assert.deepEqual(firstResult, { acquired: true, result: "first" });
});
