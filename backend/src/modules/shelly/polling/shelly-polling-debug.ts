import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ShellyPollingStats } from "../shared/shelly.types.js";

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
};

export type ShellyPollingDebugRunSummary = {
  status: "success" | "error";
  finishedAt: Date;
  intervalMs: number;
  batchSize: number;
  maxConcurrency: number;
  batchesProcessed: number;
  integrationsAttempted: number;
  stats: ShellyPollingStats;
  error?: unknown;
};

export type ShellyPollingDebugIntegrationDump = {
  userId: string;
  startedAt: Date;
  finishedAt: Date;
  status: "success" | "error";
  payload: unknown;
  rawEntriesCount: number;
  externalIds: string[];
  devices: Array<{ id: string; externalDeviceId: string }>;
  result: {
    readingsInserted: number;
    readingsDuplicated: number;
    readingsSkipped: number;
  };
  error?: unknown;
};

export type ShellyPollingDebugRun = {
  enabled: boolean;
  runId: string | null;
  startedAt: Date;
  writeRunSummary: (summary: ShellyPollingDebugRunSummary) => Promise<void>;
  writeIntegrationDump: (dump: ShellyPollingDebugIntegrationDump) => Promise<void>;
};

function buildRunId(at: Date): string {
  const timestamp = at.toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${suffix}`;
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function serializeError(error: unknown): SerializedError | undefined {
  if (!(error instanceof Error)) {
    return error === undefined
      ? undefined
      : {
        name: "NonError",
        message: JSON.stringify(error),
      };
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return serializeError(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return value;
}

async function writeDebugJson(
  runDir: string,
  filename: string,
  payload: unknown,
): Promise<void> {
  try {
    await mkdir(runDir, { recursive: true });
    await writeFile(
      path.join(runDir, filename),
      `${JSON.stringify(payload, jsonReplacer, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ShellyPolling] debug dump write failed (${filename}): ${message}`);
  }
}

export function createShellyPollingDebugRun(options: {
  enabled: boolean;
  baseDir?: string;
}): ShellyPollingDebugRun {
  const startedAt = new Date();

  if (!options.enabled) {
    return {
      enabled: false,
      runId: null,
      startedAt,
      writeRunSummary: async () => {},
      writeIntegrationDump: async () => {},
    };
  }

  const rootDir = options.baseDir ?? path.resolve(process.cwd(), "debug", "shelly-polling");
  const runId = buildRunId(startedAt);
  const runDir = path.join(rootDir, runId);

  return {
    enabled: true,
    runId,
    startedAt,
    writeRunSummary: async (summary) => {
      await writeDebugJson(runDir, "run.json", {
        runId,
        startedAt,
        ...summary,
        error: serializeError(summary.error),
      });
    },
    writeIntegrationDump: async (dump) => {
      await writeDebugJson(
        runDir,
        `integration-${sanitizeFileSegment(dump.userId)}.json`,
        {
          runId,
          ...dump,
          error: serializeError(dump.error),
        },
      );
    },
  };
}
