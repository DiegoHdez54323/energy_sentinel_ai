import { env } from "../../config/env.js";
import {
  aggregateDeviceUsage,
  listAggregateEligibleDevices,
} from "./usage-aggregation.repository.js";
import type { DeviceUsageAggregationStats } from "./usage-aggregation.types.js";

export async function runDeviceUsageAggregationOnce(options?: {
  batchSize?: number;
}): Promise<DeviceUsageAggregationStats> {
  const batchSize = Math.max(1, options?.batchSize ?? env.AGGREGATES_DEVICE_BATCH_SIZE);
  const stats: DeviceUsageAggregationStats = {
    devicesProcessed: 0,
    devicesFailed: 0,
    hourlyRowsUpserted: 0,
    dailyRowsUpserted: 0,
  };

  let cursorId: string | null = null;

  while (true) {
    const devices = await listAggregateEligibleDevices({
      cursorId,
      batchSize,
    });

    if (devices.length === 0) {
      break;
    }

    for (const device of devices) {
      try {
        const result = await aggregateDeviceUsage(device.id);
        stats.devicesProcessed += 1;
        stats.hourlyRowsUpserted += result.hourlyRowsUpserted;
        stats.dailyRowsUpserted += result.dailyRowsUpserted;
      } catch (error) {
        stats.devicesFailed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[UsageAggregates] device ${device.id} failed: ${message}`);
      }
    }

    cursorId = devices[devices.length - 1]?.id ?? null;
  }

  return stats;
}

let aggregatesTimer: NodeJS.Timeout | null = null;
let aggregatesInFlight = false;

export function startDeviceUsageAggregation(): { stop: () => void } {
  if (!env.AGGREGATES_ENABLED || aggregatesTimer) {
    return {
      stop: () => {
        if (aggregatesTimer) {
          clearInterval(aggregatesTimer);
          aggregatesTimer = null;
        }
      },
    };
  }

  const run = async () => {
    if (aggregatesInFlight) {
      return;
    }

    aggregatesInFlight = true;
    try {
      await runDeviceUsageAggregationOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[UsageAggregates] run failed: ${message}`);
    } finally {
      aggregatesInFlight = false;
    }
  };

  aggregatesTimer = setInterval(() => {
    void run();
  }, env.AGGREGATES_INTERVAL_MS);

  void run();

  return {
    stop: () => {
      if (aggregatesTimer) {
        clearInterval(aggregatesTimer);
        aggregatesTimer = null;
      }
    },
  };
}
