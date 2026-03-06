import { createApp } from "./app/app.js";
import { env } from "./config/env.js";
import { startShellyReadingsPolling } from "./modules/shelly/shelly.service.js";

const app = createApp();
console.log(
  `[ShellyPolling] enabled=${env.SHELLY_POLLING_ENABLED} intervalMs=${env.SHELLY_POLLING_INTERVAL_MS} batchSize=${env.SHELLY_POLLING_BATCH_SIZE} maxConcurrency=${env.SHELLY_POLLING_MAX_CONCURRENCY}`,
);
const polling = startShellyReadingsPolling();

app.listen(env.PORT, () => {
  console.log(`Server is running on port ${env.PORT}`);
  console.log(`[ShellyPolling] ${env.SHELLY_POLLING_ENABLED ? "started" : "disabled"}`);
});

function stopPolling(signal: "SIGINT" | "SIGTERM") {
  console.log(`[ShellyPolling] stopping (${signal})`);
  polling.stop();
  console.log("[ShellyPolling] stopped");
}

process.on("SIGINT", () => stopPolling("SIGINT"));
process.on("SIGTERM", () => stopPolling("SIGTERM"));
