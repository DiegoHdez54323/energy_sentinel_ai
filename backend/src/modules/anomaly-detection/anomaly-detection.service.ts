import { Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { buildFeatureVector, featureVectorToMlRow } from "./feature-engineering.js";
import {
  createManyReadingFeatures,
  getDeviceTimezone,
  getActiveDeviceModel,
  getReadingForScoring,
  listPreviousReadingsForDevice,
  listReadingsBeforeLocalDate,
  listRecentClosedDailyDates,
  listTrainingFeatureRows,
  listTrainingWindowReadings,
  replaceActiveDeviceModel,
  upsertAnomalyEvent,
  upsertPrediction,
  upsertReadingFeature,
} from "./anomaly-detection.repository.js";
import { scoreIsolationForestReading, trainIsolationForestModel } from "./ml-service.client.js";
import {
  ANOMALY_FEATURE_SCHEMA_VERSION,
  ANOMALY_MODEL_TYPE,
  ANOMALY_MODEL_VERSION,
  FEATURE_ROLLING_WINDOW_SIZE,
} from "./anomaly-detection.constants.js";
import type {
  DeviceModelTrainingResult,
  DeviceReadingFeatureVector,
  DeviceReadingScoringResult,
  DeviceReadingForFeatures,
} from "./anomaly-detection.types.js";

export async function trainDeviceAnomalyModel(
  deviceId: string,
  options?: {
    enabled?: boolean;
    trainingWindowDays?: number;
    contamination?: number;
    mlServiceBaseUrl?: string;
  },
): Promise<DeviceModelTrainingResult> {
  const enabled = options?.enabled ?? env.ML_ENABLED;
  if (!enabled) {
    return {
      status: "disabled",
      featureRowsUpserted: 0,
      trained: false,
    };
  }

  const trainingWindowDays = Math.max(1, options?.trainingWindowDays ?? env.ML_TRAINING_WINDOW_DAYS);
  const contamination = options?.contamination ?? env.ML_IF_CONTAMINATION;
  const timezone = await getDeviceTimezone(deviceId);
  if (!timezone) {
    return {
      status: "insufficient_history",
      featureRowsUpserted: 0,
      trained: false,
    };
  }
  const dailyDates = await listRecentClosedDailyDates(deviceId, trainingWindowDays);
  const windowBounds = getContiguousWindowBounds(dailyDates, trainingWindowDays);
  if (!windowBounds) {
    return {
      status: "insufficient_history",
      featureRowsUpserted: 0,
      trained: false,
    };
  }

  const activeModel = await getActiveDeviceModel(deviceId);
  if (
    activeModel
    && activeModel.modelVersion === ANOMALY_MODEL_VERSION
    && activeModel.featureSchemaVersion === ANOMALY_FEATURE_SCHEMA_VERSION
    && activeModel.trainingWindowDays === trainingWindowDays
    && Math.abs(activeModel.contamination - contamination) < 0.000001
    && activeModel.trainedTo.toISOString().slice(0, 10) === windowBounds.endDate
  ) {
    return {
      status: "up_to_date",
      featureRowsUpserted: 0,
      trained: false,
    };
  }

  const featureRowsUpserted = await backfillTrainingFeatures(deviceId, windowBounds.startDate, windowBounds.endDate);
  const trainingFeatures = await listTrainingFeatureRows({
    deviceId,
    startDate: localDateStringToDate(windowBounds.startDate),
    endDate: localDateStringToDate(windowBounds.endDate),
  });

  if (trainingFeatures.length === 0) {
    return {
      status: "no_training_rows",
      featureRowsUpserted,
      trained: false,
    };
  }

  const trainedAt = new Date();
  const trainingResponse = await trainIsolationForestModel({
    deviceId,
    modelType: ANOMALY_MODEL_TYPE,
    modelVersion: ANOMALY_MODEL_VERSION,
    featureSchemaVersion: ANOMALY_FEATURE_SCHEMA_VERSION,
    contamination,
    trainingRows: trainingFeatures.map((row) => ({
      readingId: row.readingId.toString(),
      ts: row.ts.toISOString(),
      localDate: row.localDate.toISOString().slice(0, 10),
      localHour: row.localHour,
      dayGroup: row.dayGroup,
      apower: row.apower,
      aenergyDelta: row.aenergyDelta,
      outputNumeric: row.outputNumeric,
      hourSin: row.hourSin,
      hourCos: row.hourCos,
      dayOfWeekSin: row.dayOfWeekSin,
      dayOfWeekCos: row.dayOfWeekCos,
      deltaPowerPrev: row.deltaPowerPrev,
      rollingMeanPower5: row.rollingMeanPower5,
      rollingStdPower5: row.rollingStdPower5,
    })),
  }, {
    enabled,
    baseUrl: options?.mlServiceBaseUrl,
  });

  const modelId = await replaceActiveDeviceModel({
    deviceId,
    contamination,
    trainingWindowDays,
    trainedFrom: localDateStringToDate(windowBounds.startDate),
    trainedTo: localDateStringToDate(windowBounds.endDate),
    trainedAt,
    trainingSampleCount: trainingResponse.trainingSampleCount,
    timezone,
    artifact: trainingResponse.artifact,
    summary: trainingResponse.summary,
  });

  return {
    status: "trained",
    featureRowsUpserted,
    trained: true,
    modelId,
    trainingSampleCount: trainingResponse.trainingSampleCount,
  };
}

export async function scoreDeviceReading(
  readingId: bigint,
  options?: {
    enabled?: boolean;
    mlServiceBaseUrl?: string;
  },
): Promise<DeviceReadingScoringResult> {
  const enabled = options?.enabled ?? env.ML_ENABLED;
  if (!enabled) {
    return {
      status: "disabled",
      predictionCreated: false,
      anomalyCreated: false,
    };
  }

  const reading = await getReadingForScoring(readingId);
  if (!reading) {
    return {
      status: "duplicate",
      predictionCreated: false,
      anomalyCreated: false,
    };
  }

  const previousReadings = await listPreviousReadingsForDevice(
    reading.deviceId,
    reading.ts,
    FEATURE_ROLLING_WINDOW_SIZE,
    reading.id,
  );

  const feature = buildFeatureVector(reading, previousReadings);
  await upsertReadingFeature(feature);

  const activeModel = await getActiveDeviceModel(reading.deviceId);
  if (!activeModel) {
    await upsertPrediction({
      readingId,
      deviceId: reading.deviceId,
      scoredAt: new Date(),
      status: "model_not_ready",
      details: {
        featureSchemaVersion: feature.featureSchemaVersion,
      },
    });

    return {
      status: "model_not_ready",
      predictionCreated: true,
      anomalyCreated: false,
    };
  }

  try {
    const scoredAt = new Date();
    const scoring = await scoreIsolationForestReading({
      artifact: activeModel.artifact,
      featureSchemaVersion: feature.featureSchemaVersion,
      featureVector: featureVectorToMlRow(feature),
    }, {
      enabled,
      baseUrl: options?.mlServiceBaseUrl,
    });

    const prediction = await upsertPrediction({
      readingId,
      deviceId: reading.deviceId,
      modelId: activeModel.id,
      scoredAt,
      score: scoring.score,
      decisionFunction: scoring.decisionFunction,
      isAnomaly: scoring.isAnomaly,
      status: "scored",
      details: {
        featureSchemaVersion: feature.featureSchemaVersion,
      },
    });

    if (!scoring.isAnomaly) {
      return {
        status: "scored",
        predictionCreated: true,
        anomalyCreated: false,
      };
    }

    const expectedValue = getExpectedValueFromSummary(activeModel.summary, feature.dayGroup, feature.localHour);
    await upsertAnomalyEvent({
      deviceId: reading.deviceId,
      modelId: activeModel.id,
      predictionId: prediction.id,
      readingId,
      detectedAt: reading.ts,
      observedValue: reading.apower,
      expectedValue,
      score: scoring.score,
      details: {
        dayGroup: feature.dayGroup,
        localHour: feature.localHour,
        decisionFunction: scoring.decisionFunction,
        featureSchemaVersion: feature.featureSchemaVersion,
      },
    });

    return {
      status: "scored",
      predictionCreated: true,
      anomalyCreated: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await upsertPrediction({
      readingId,
      deviceId: reading.deviceId,
      modelId: activeModel.id,
      scoredAt: new Date(),
      status: "score_failed",
      details: {
        error: message,
        featureSchemaVersion: feature.featureSchemaVersion,
      },
    });

    return {
      status: "score_failed",
      predictionCreated: true,
      anomalyCreated: false,
    };
  }
}

async function backfillTrainingFeatures(
  deviceId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const contextRowsDesc = await listReadingsBeforeLocalDate({
    deviceId,
    localDate: startDate,
    limit: FEATURE_ROLLING_WINDOW_SIZE - 1,
  });
  const windowRows = await listTrainingWindowReadings({
    deviceId,
    startDate,
    endDate,
  });

  const contextById = new Map<bigint, DeviceReadingForFeatures>();
  const combinedRows = [...contextRowsDesc.reverse(), ...windowRows];
  const featuresToInsert: DeviceReadingFeatureVector[] = [];

  for (const reading of combinedRows) {
    const previousReadingsDesc = [...contextById.values()]
      .filter((candidate) => candidate.deviceId === reading.deviceId && candidate.id !== reading.id)
      .sort((left, right) => right.ts.getTime() - left.ts.getTime())
      .slice(0, FEATURE_ROLLING_WINDOW_SIZE - 1);

    const feature = buildFeatureVector(reading, previousReadingsDesc);
    if (feature.localDate.toISOString().slice(0, 10) >= startDate) {
      featuresToInsert.push(feature);
    }

    contextById.set(reading.id, reading);
  }

  return createManyReadingFeatures(featuresToInsert);
}

function getContiguousWindowBounds(
  dates: Date[],
  trainingWindowDays: number,
): { startDate: string; endDate: string } | null {
  if (dates.length < trainingWindowDays) {
    return null;
  }

  const localDates = dates.map((value) => value.toISOString().slice(0, 10));
  const endDate = localDates[0];
  if (!endDate) {
    return null;
  }

  for (let index = 1; index < trainingWindowDays; index += 1) {
    if (localDates[index] !== addLocalDays(endDate, -index)) {
      return null;
    }
  }

  return {
    startDate: localDates[trainingWindowDays - 1]!,
    endDate,
  };
}

function addLocalDays(value: string, days: number): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function localDateStringToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function getExpectedValueFromSummary(
  summary: Prisma.JsonValue | null,
  dayGroup: string,
  localHour: number,
): number | null {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  const buckets = (summary as { hourlyReference?: unknown }).hourlyReference;
  if (!Array.isArray(buckets)) {
    return null;
  }

  const match = buckets.find((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }

    return (entry as { dayGroup?: unknown; localHour?: unknown }).dayGroup === dayGroup
      && (entry as { localHour?: unknown }).localHour === localHour;
  }) as { expectedApower?: unknown } | undefined;

  return typeof match?.expectedApower === "number" ? match.expectedApower : null;
}
