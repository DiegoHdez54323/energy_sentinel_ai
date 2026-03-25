import { env } from "../../config/env.js";
import { trainDeviceAnomalyModel } from "../anomaly-detection/anomaly-detection.service.js";
import {
  aggregateDeviceUsage,
  listAggregateEligibleDevices,
} from "./usage-aggregation.repository.js";
import type { DeviceUsageAggregationStats } from "./usage-aggregation.types.js";

export async function runDeviceUsageAggregationOnce(options?: {
  batchSize?: number;
  enableMl?: boolean;
  mlTrainingWindowDays?: number;
  mlContamination?: number;
  mlServiceBaseUrl?: string;
}): Promise<DeviceUsageAggregationStats> {
  const batchSize = Math.max(1, options?.batchSize ?? env.AGGREGATES_DEVICE_BATCH_SIZE);
  const mlEnabled = options?.enableMl ?? env.ML_ENABLED;
  const stats: DeviceUsageAggregationStats = {
    devicesProcessed: 0,
    devicesFailed: 0,
    hourlyRowsUpserted: 0,
    dailyRowsUpserted: 0,
    modelDevicesEvaluated: 0,
    modelDevicesTrained: 0,
    modelDevicesSkipped: 0,
    modelDevicesFailed: 0,
    featureRowsUpserted: 0,
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

        if (!mlEnabled) {
          continue;
        }

        stats.modelDevicesEvaluated += 1;

        try {
          const trainingResult = await trainDeviceAnomalyModel(device.id, {
            enabled: mlEnabled,
            trainingWindowDays: options?.mlTrainingWindowDays,
            contamination: options?.mlContamination,
            mlServiceBaseUrl: options?.mlServiceBaseUrl,
          });

          stats.featureRowsUpserted += trainingResult.featureRowsUpserted;
          if (trainingResult.status === "trained") {
            stats.modelDevicesTrained += 1;
          } else if (trainingResult.status !== "disabled") {
            stats.modelDevicesSkipped += 1;
          }
        } catch (error) {
          stats.modelDevicesFailed += 1;
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[UsageAggregates][ML] device ${device.id} failed: ${message}`);
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
