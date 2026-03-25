import { closePrisma, prisma } from "../src/lib/prisma.js";
import { trainDeviceAnomalyModel } from "../src/modules/anomaly-detection/anomaly-detection.service.js";

async function main() {
  const deviceId = process.argv[2];
  if (!deviceId) {
    throw new Error("Usage: npm run ml:train-device -- <deviceId>");
  }

  const result = await trainDeviceAnomalyModel(deviceId);
  const activeModel = await prisma.deviceAnomalyModel.findFirst({
    where: {
      deviceId,
      isActive: true,
    },
    orderBy: {
      trainedAt: "desc",
    },
    select: {
      id: true,
      trainedFrom: true,
      trainedTo: true,
      trainedAt: true,
      trainingSampleCount: true,
      trainingWindowDays: true,
      contamination: true,
      status: true,
    },
  });

  console.log(JSON.stringify({
    deviceId,
    result,
    activeModel,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePrisma();
  });
