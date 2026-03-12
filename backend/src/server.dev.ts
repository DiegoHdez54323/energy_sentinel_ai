import { createApp } from "./app/app.js";
import { env } from "./config/env.js";
import { closePrisma } from "./lib/prisma.js";
import { startDeviceUsageAggregation } from "./modules/aggregates/aggregates.service.js";
import { startShellyReadingsPolling } from "./modules/shelly/shelly.service.js";

const app = createApp();
console.log(
  `[ShellyPolling] enabled=${env.SHELLY_POLLING_ENABLED} intervalMs=${env.SHELLY_POLLING_INTERVAL_MS} batchSize=${env.SHELLY_POLLING_BATCH_SIZE} maxConcurrency=${env.SHELLY_POLLING_MAX_CONCURRENCY} debugDumps=${env.SHELLY_POLLING_DEBUG_DUMPS}`,
);
console.log(
  `[UsageAggregates] enabled=${env.AGGREGATES_ENABLED} intervalMs=${env.AGGREGATES_INTERVAL_MS} deviceBatchSize=${env.AGGREGATES_DEVICE_BATCH_SIZE}`,
);

const polling = startShellyReadingsPolling();
const aggregates = startDeviceUsageAggregation();
const server = app.listen(env.PORT, () => {
  console.log(`Server is running on port ${env.PORT}`);
  console.log(`[ShellyPolling] ${env.SHELLY_POLLING_ENABLED ? "started" : "disabled"}`);
  console.log(`[UsageAggregates] ${env.AGGREGATES_ENABLED ? "started" : "disabled"}`);
});

async function shutdown(signal: "SIGINT" | "SIGTERM") {
  console.log(`[ShellyPolling] stopping (${signal})`);
  polling.stop();
  console.log("[ShellyPolling] stopped");
  console.log(`[UsageAggregates] stopping (${signal})`);
  aggregates.stop();
  console.log("[UsageAggregates] stopped");

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  await closePrisma();
}

function registerShutdown(signal: "SIGINT" | "SIGTERM") {
  process.once(signal, () => {
    void shutdown(signal).catch((error) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error(`[ServerDev] shutdown failed: ${message}`);
      process.exitCode = 1;
    });
  });
}

registerShutdown("SIGINT");
registerShutdown("SIGTERM");
