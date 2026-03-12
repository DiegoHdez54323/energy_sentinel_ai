import { closePrisma } from "../lib/prisma.js";
import { withJobLock } from "../lib/job-lock.js";
import { runShellyReadingsPollingOnce } from "../modules/shelly/shelly.service.js";

const SHELLY_POLLING_LOCK = {
  key: "shelly-polling",
  leaseMs: 30 * 60 * 1000,
};

async function main() {
  console.log("[ShellyPollingJob] starting");

  const lockResult = await withJobLock(SHELLY_POLLING_LOCK, async () => {
    const stats = await runShellyReadingsPollingOnce();
    console.log(`[ShellyPollingJob] completed ${JSON.stringify(stats)}`);
    return stats;
  });

  if (!lockResult.acquired) {
    console.log("[ShellyPollingJob] skipped: lock already held");
  }
}

void main()
  .catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[ShellyPollingJob] failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePrisma();
  });
