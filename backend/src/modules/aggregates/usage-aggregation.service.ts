import { env } from "../../config/env.js";
import { refreshDeviceBaseline } from "../baseline/device-baseline.service.js";
import {
  aggregateDeviceUsage,
  listAggregateEligibleDevices,
} from "./usage-aggregation.repository.js";
import type { DeviceUsageAggregationStats } from "./usage-aggregation.types.js";

export async function runDeviceUsageAggregationOnce(options?: {
  batchSize?: number;
  enableBaseline?: boolean;
}): Promise<DeviceUsageAggregationStats> {
  const batchSize = Math.max(1, options?.batchSize ?? env.AGGREGATES_DEVICE_BATCH_SIZE);
  const baselineEnabled = options?.enableBaseline ?? env.BASELINE_ENABLED;
  const stats: DeviceUsageAggregationStats = {
    devicesProcessed: 0,
    devicesFailed: 0,
    hourlyRowsUpserted: 0,
    dailyRowsUpserted: 0,
    baselineDevicesEvaluated: 0,
    baselineDevicesActivated: 0,
    baselineDevicesSkipped: 0,
    baselineDevicesFailed: 0,
    baselineBucketsCreated: 0,
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

        if (!baselineEnabled) {
          continue;
        }

        stats.baselineDevicesEvaluated += 1;

        try {
          const baselineResult = await refreshDeviceBaseline(device.id, {
            enabled: baselineEnabled,
          });

          if (baselineResult.status === "activated") {
            stats.baselineDevicesActivated += 1;
            stats.baselineBucketsCreated += baselineResult.bucketsCreated;
          } else if (baselineResult.status !== "disabled") {
            stats.baselineDevicesSkipped += 1;
          }
        } catch (error) {
          stats.baselineDevicesFailed += 1;
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[UsageAggregates][Baseline] device ${device.id} failed: ${message}`);
        }
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
