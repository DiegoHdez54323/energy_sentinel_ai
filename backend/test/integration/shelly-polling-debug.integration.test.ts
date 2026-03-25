import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createShellyPollingDebugRun } from "../../src/modules/shelly/polling/shelly-polling-debug.js";

test("createShellyPollingDebugRun guarda resumen global y archivo por integracion", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "shelly-polling-debug-"));

  try {
    const run = createShellyPollingDebugRun({
      enabled: true,
      baseDir,
    });

    await run.writeIntegrationDump({
      userId: "user:debug",
      startedAt: new Date("2026-03-10T00:00:00.000Z"),
      finishedAt: new Date("2026-03-10T00:00:02.000Z"),
      status: "error",
      payload: {
        data: {
          "ext-1": {
            id: "ext-1",
            "switch:0": {
              apower: 123.4,
            },
          },
        },
      },
      rawEntriesCount: 1,
      externalIds: ["ext-1"],
      devices: [{ id: "dev-1", externalDeviceId: "ext-1" }],
      result: {
        readingsInserted: 0,
        readingsDuplicated: 0,
        readingsSkipped: 1,
        anomalyPredictionsCreated: 0,
        anomalyModelNotReady: 0,
        anomalyScoreFailures: 0,
        anomalyEventsCreated: 0,
      },
      error: new Error("debug failure"),
    });

    await run.writeRunSummary({
      status: "error",
      finishedAt: new Date("2026-03-10T00:00:03.000Z"),
      intervalMs: 60_000,
      batchSize: 100,
      maxConcurrency: 3,
      batchesProcessed: 1,
      integrationsAttempted: 1,
      stats: {
        integrationsProcessed: 0,
        integrationsFailed: 1,
        readingsInserted: 0,
        readingsDuplicated: 0,
        readingsSkipped: 1,
        anomalyPredictionsCreated: 0,
        anomalyModelNotReady: 0,
        anomalyScoreFailures: 0,
        anomalyEventsCreated: 0,
      },
      error: new Error("run failure"),
    });

    const runDirs = await readdir(baseDir);
    assert.equal(runDirs.length, 1);
    assert.equal(runDirs[0], run.runId);

    const runDir = path.join(baseDir, runDirs[0] as string);
    const files = await readdir(runDir);
    assert.deepEqual(files.sort(), ["integration-user_debug.json", "run.json"]);

    const integrationDump = JSON.parse(
      await readFile(path.join(runDir, "integration-user_debug.json"), "utf8"),
    ) as {
      runId: string;
      status: string;
      payload: { data: Record<string, { id: string }> };
      error: { message: string };
    };
    const dumpedEntry = integrationDump.payload.data["ext-1"];
    assert.equal(integrationDump.runId, run.runId);
    assert.equal(integrationDump.status, "error");
    assert.ok(dumpedEntry);
    assert.equal(dumpedEntry.id, "ext-1");
    assert.equal(integrationDump.error.message, "debug failure");

    const runSummary = JSON.parse(
      await readFile(path.join(runDir, "run.json"), "utf8"),
    ) as {
      runId: string;
      status: string;
      intervalMs: number;
      stats: { integrationsFailed: number };
      error: { message: string };
    };
    assert.equal(runSummary.runId, run.runId);
    assert.equal(runSummary.status, "error");
    assert.equal(runSummary.intervalMs, 60_000);
    assert.equal(runSummary.stats.integrationsFailed, 1);
    assert.equal(runSummary.error.message, "run failure");
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test("createShellyPollingDebugRun no escribe archivos cuando esta desactivado", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "shelly-polling-debug-off-"));

  try {
    const run = createShellyPollingDebugRun({
      enabled: false,
      baseDir,
    });

    await run.writeIntegrationDump({
      userId: "user-1",
      startedAt: new Date("2026-03-10T00:00:00.000Z"),
      finishedAt: new Date("2026-03-10T00:00:01.000Z"),
      status: "success",
      payload: { ok: true },
      rawEntriesCount: 0,
      externalIds: [],
      devices: [],
      result: {
        readingsInserted: 0,
        readingsDuplicated: 0,
        readingsSkipped: 0,
        anomalyPredictionsCreated: 0,
        anomalyModelNotReady: 0,
        anomalyScoreFailures: 0,
        anomalyEventsCreated: 0,
      },
    });

    await run.writeRunSummary({
      status: "success",
      finishedAt: new Date("2026-03-10T00:00:02.000Z"),
      intervalMs: 60_000,
      batchSize: 100,
      maxConcurrency: 3,
      batchesProcessed: 0,
      integrationsAttempted: 0,
      stats: {
        integrationsProcessed: 0,
        integrationsFailed: 0,
        readingsInserted: 0,
        readingsDuplicated: 0,
        readingsSkipped: 0,
        anomalyPredictionsCreated: 0,
        anomalyModelNotReady: 0,
        anomalyScoreFailures: 0,
        anomalyEventsCreated: 0,
      },
    });

    const entries = await readdir(baseDir);
    assert.deepEqual(entries, []);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});
