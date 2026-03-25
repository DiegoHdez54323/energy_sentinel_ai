import { closePrisma, prisma } from "../src/lib/prisma.js";
import { scoreDeviceReading } from "../src/modules/anomaly-detection/anomaly-detection.service.js";

async function main() {
  const readingIdRaw = process.argv[2];
  if (!readingIdRaw) {
    throw new Error("Usage: npm run ml:score-reading -- <readingId>");
  }

  const readingId = BigInt(readingIdRaw);
  const result = await scoreDeviceReading(readingId);
  const prediction = await prisma.deviceAnomalyPrediction.findUnique({
    where: {
      readingId,
    },
    select: {
      id: true,
      modelId: true,
      scoredAt: true,
      score: true,
      decisionFunction: true,
      isAnomaly: true,
      status: true,
      details: true,
    },
  });
  const anomalyEvent = await prisma.anomalyEvent.findUnique({
    where: {
      readingId,
    },
    select: {
      id: true,
      modelId: true,
      predictionId: true,
      detectedAt: true,
      score: true,
      expectedValue: true,
      observedValue: true,
      details: true,
    },
  });

  console.log(JSON.stringify({
    readingId: readingId.toString(),
    result,
    prediction,
    anomalyEvent,
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
