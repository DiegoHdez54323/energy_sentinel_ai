import { env } from "../../../config/env.js";
import { prisma } from "../../../lib/prisma.js";
import { pollShellyIntegrationReadings } from "./shelly-readings.ingestion.js";
import type { ShellyPollingStats } from "../shared/shelly.types.js";

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  const active = new Set<Promise<void>>();

  for (const item of items) {
    const task = (async () => {
      await worker(item);
    })();

    active.add(task);
    task.finally(() => active.delete(task));

    if (active.size >= limit) {
      await Promise.race(active);
    }
  }

  await Promise.all(active);
}

export async function runShellyReadingsPollingOnce(options?: {
  batchSize?: number;
  maxConcurrency?: number;
}): Promise<ShellyPollingStats> {
  const batchSize = Math.max(1, options?.batchSize ?? env.SHELLY_POLLING_BATCH_SIZE);
  const maxConcurrency = Math.max(1, options?.maxConcurrency ?? env.SHELLY_POLLING_MAX_CONCURRENCY);

  const stats: ShellyPollingStats = {
    integrationsProcessed: 0,
    integrationsFailed: 0,
    readingsInserted: 0,
    readingsDuplicated: 0,
    readingsSkipped: 0,
  };

  let cursorId: string | null = null;

  while (true) {
    const integrations: Array<{ id: string; userId: string }> = await prisma.shellyIntegration.findMany({
      where: {
        status: "active",
        authCode: {
          not: null,
        },
      },
      select: {
        id: true,
        userId: true,
      },
      orderBy: {
        id: "asc",
      },
      take: batchSize,
      ...(cursorId
        ? {
          cursor: {
            id: cursorId,
          },
          skip: 1,
        }
        : {}),
    });

    if (integrations.length === 0) {
      break;
    }

    await runWithConcurrency(integrations, maxConcurrency, async (integration) => {
      try {
        const result = await pollShellyIntegrationReadings(integration.userId);
        stats.integrationsProcessed += 1;
        stats.readingsInserted += result.readingsInserted;
        stats.readingsDuplicated += result.readingsDuplicated;
        stats.readingsSkipped += result.readingsSkipped;
      } catch {
        stats.integrationsFailed += 1;
      }
    });

    cursorId = integrations[integrations.length - 1]?.id ?? null;
  }

  return stats;
}

let shellyPollingTimer: NodeJS.Timeout | null = null;
let shellyPollingInFlight = false;

export function startShellyReadingsPolling(): { stop: () => void } {
  if (!env.SHELLY_POLLING_ENABLED || shellyPollingTimer) {
    return {
      stop: () => {
        if (shellyPollingTimer) {
          clearInterval(shellyPollingTimer);
          shellyPollingTimer = null;
        }
      },
    };
  }

  const run = async () => {
    if (shellyPollingInFlight) {
      return;
    }

    shellyPollingInFlight = true;
    try {
      await runShellyReadingsPollingOnce();
    } finally {
      shellyPollingInFlight = false;
    }
  };

  shellyPollingTimer = setInterval(() => {
    void run();
  }, env.SHELLY_POLLING_INTERVAL_MS);

  void run();

  return {
    stop: () => {
      if (shellyPollingTimer) {
        clearInterval(shellyPollingTimer);
        shellyPollingTimer = null;
      }
    },
  };
}
