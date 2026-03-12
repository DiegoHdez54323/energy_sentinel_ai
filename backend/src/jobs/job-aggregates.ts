import { closePrisma } from "../lib/prisma.js";
import { withJobLock } from "../lib/job-lock.js";
import { runDeviceUsageAggregationOnce } from "../modules/aggregates/aggregates.service.js";

const AGGREGATES_LOCK = {
  key: "usage-aggregates",
  leaseMs: 4 * 60 * 60 * 1000,
};

async function main() {
  console.log("[UsageAggregatesJob] starting");

  const lockResult = await withJobLock(AGGREGATES_LOCK, async () => {
    const stats = await runDeviceUsageAggregationOnce();
    console.log(`[UsageAggregatesJob] completed ${JSON.stringify(stats)}`);
    return stats;
  });

  if (!lockResult.acquired) {
    console.log("[UsageAggregatesJob] skipped: lock already held");
  }
}

void main()
  .catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[UsageAggregatesJob] failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePrisma();
  });
