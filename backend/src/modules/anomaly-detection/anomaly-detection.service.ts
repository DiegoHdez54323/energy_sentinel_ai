import { Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { buildFeatureVector, featureVectorToMlRow } from "./feature-engineering.js";
import {
  closeAnomalyIncident,
  createManyReadingFeatures,
  createAnomalyIncident,
  findPredictionByReadingId,
  getLatestDeviceReadingSummary,
  getOpenAnomalyIncidentForDevice,
  getDeviceTimezone,
  getActiveDeviceModel,
  getReadingForScoring,
  linkPredictionToAnomalyEvent,
  listMissingTrainingWindowReadings,
  listDeviceAnomalyIncidents,
  listPreviousReadingsForDevice,
  listReadingsBeforeLocalDate,
  listRecentClosedDailyDates,
  listTrainingFeatureRows,
  listTrainingWindowReadings,
  replaceActiveDeviceModel,
  extendAnomalyIncident,
  upsertPrediction,
  upsertReadingFeature,
} from "./anomaly-detection.repository.js";
import { scoreIsolationForestReading, trainIsolationForestModel } from "./ml-service.client.js";
import {
  ANOMALY_FEATURE_SCHEMA_VERSION,
  ANOMALY_INCIDENT_GAP_MS,
  ANOMALY_MODEL_TYPE,
  ANOMALY_MODEL_VERSION,
  FEATURE_ROLLING_WINDOW_SIZE,
} from "./anomaly-detection.constants.js";
import type {
  DeviceAnomalyIncidentSummary,
  DeviceLatestReadingSummary,
  DeviceModelTrainingResult,
  DeviceReadingFeatureVector,
  DeviceReadingScoringResult,
  DeviceReadingForFeatures,
} from "./anomaly-detection.types.js";
import type { OwnedDeviceContext } from "../../common/ownership/device-ownership.js";

export async function trainDeviceAnomalyModel(
  deviceId: string,
  options?: {
    enabled?: boolean;
    trainingWindowDays?: number;
    contamination?: number;
    mlServiceBaseUrl?: string;
  },
): Promise<DeviceModelTrainingResult> {
  const startedAt = Date.now();
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
  logTrainingStage(deviceId, "start", {
    trainingWindowDays,
    contamination,
  });

  const timezone = await getDeviceTimezone(deviceId);
  if (!timezone) {
    logTrainingStage(deviceId, "skip:no-timezone");
    return {
      status: "insufficient_history",
      featureRowsUpserted: 0,
      trained: false,
    };
  }
  const dailyDates = await listRecentClosedDailyDates(deviceId, trainingWindowDays);
  const windowBounds = getContiguousWindowBounds(dailyDates, trainingWindowDays);
  logTrainingStage(deviceId, "window:checked", {
    closedDaysFound: dailyDates.length,
    windowStartDate: windowBounds?.startDate ?? null,
    windowEndDate: windowBounds?.endDate ?? null,
  });
  if (!windowBounds) {
    logTrainingStage(deviceId, "skip:insufficient-history");
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
    logTrainingStage(deviceId, "skip:up-to-date", {
      trainedTo: activeModel.trainedTo.toISOString().slice(0, 10),
    });
    return {
      status: "up_to_date",
      featureRowsUpserted: 0,
      trained: false,
    };
  }

  const backfillStartedAt = Date.now();
  const featureRowsUpserted = await backfillTrainingFeatures(deviceId, windowBounds.startDate, windowBounds.endDate);
  logTrainingStage(deviceId, "features:backfill-complete", {
    featureRowsUpserted,
    durationMs: Date.now() - backfillStartedAt,
  });

  const readFeaturesStartedAt = Date.now();
  const trainingFeatures = await listTrainingFeatureRows({
    deviceId,
    startDate: localDateStringToDate(windowBounds.startDate),
    endDate: localDateStringToDate(windowBounds.endDate),
  });
  logTrainingStage(deviceId, "features:loaded", {
    trainingFeaturesCount: trainingFeatures.length,
    durationMs: Date.now() - readFeaturesStartedAt,
  });

  if (trainingFeatures.length === 0) {
    logTrainingStage(deviceId, "skip:no-training-rows");
    return {
      status: "no_training_rows",
      featureRowsUpserted,
      trained: false,
    };
  }

  const trainedAt = new Date();
  const trainRequestStartedAt = Date.now();
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
  logTrainingStage(deviceId, "ml-service:train-complete", {
    trainingSampleCount: trainingResponse.trainingSampleCount,
    durationMs: Date.now() - trainRequestStartedAt,
  });

  const persistStartedAt = Date.now();
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
  logTrainingStage(deviceId, "persist:model-complete", {
    modelId,
    durationMs: Date.now() - persistStartedAt,
  });

  logTrainingStage(deviceId, "done", {
    modelId,
    trainingSampleCount: trainingResponse.trainingSampleCount,
    featureRowsUpserted,
    totalDurationMs: Date.now() - startedAt,
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
  const existingPrediction = await findPredictionByReadingId(readingId);

  const activeModel = await getActiveDeviceModel(reading.deviceId);
  if (!activeModel) {
    await upsertPrediction({
      readingId,
      deviceId: reading.deviceId,
      anomalyEventId: existingPrediction?.anomalyEventId ?? null,
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
    const openIncident = await getOpenAnomalyIncidentForDevice(reading.deviceId);
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
      anomalyEventId: existingPrediction?.anomalyEventId ?? null,
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
      if (openIncident && reading.ts.getTime() >= new Date(openIncident.windowEnd).getTime()) {
        await closeAnomalyIncident({
          id: openIncident.id,
          details: buildClosedIncidentDetails(openIncident.details, "normal_reading", reading.id, reading.ts),
        });
      }

      return {
        status: "scored",
        predictionCreated: true,
        anomalyCreated: false,
      };
    }

    const expectedValue = getExpectedValueFromSummary(activeModel.summary, feature.dayGroup, feature.localHour);
    if (existingPrediction?.anomalyEventId) {
      return {
        status: "scored",
        predictionCreated: true,
        anomalyCreated: false,
      };
    }

    const incidentDetails = buildIncidentDetails(null, {
      readingId,
      predictionId: prediction.id,
      detectedAt: reading.ts,
      dayGroup: feature.dayGroup,
      localHour: feature.localHour,
      decisionFunction: scoring.decisionFunction,
      featureSchemaVersion: feature.featureSchemaVersion,
    });

    if (openIncident) {
      const openStartMs = new Date(openIncident.windowStart).getTime();
      const openEndMs = new Date(openIncident.windowEnd).getTime();
      const readingTsMs = reading.ts.getTime();

      if (readingTsMs >= openStartMs && readingTsMs <= openEndMs + ANOMALY_INCIDENT_GAP_MS) {
        await extendAnomalyIncident({
          id: openIncident.id,
          modelId: activeModel.id,
          detectedAt: new Date(Math.max(readingTsMs, openEndMs)),
          observedValue: reading.apower,
          expectedValue,
          score: scoring.score,
          details: buildIncidentDetails(openIncident.details, {
            readingId,
            predictionId: prediction.id,
            detectedAt: new Date(Math.max(readingTsMs, openEndMs)),
            dayGroup: feature.dayGroup,
            localHour: feature.localHour,
            decisionFunction: scoring.decisionFunction,
            featureSchemaVersion: feature.featureSchemaVersion,
          }),
        });
        await linkPredictionToAnomalyEvent(prediction.id, openIncident.id);

        return {
          status: "scored",
          predictionCreated: true,
          anomalyCreated: false,
        };
      }

      if (readingTsMs > openEndMs + ANOMALY_INCIDENT_GAP_MS) {
        await closeAnomalyIncident({
          id: openIncident.id,
          details: buildClosedIncidentDetails(openIncident.details, "gap", reading.id, reading.ts),
        });
      }
    }

    const incident = await createAnomalyIncident({
      deviceId: reading.deviceId,
      modelId: activeModel.id,
      predictionId: prediction.id,
      readingId,
      detectedAt: reading.ts,
      observedValue: reading.apower,
      expectedValue,
      score: scoring.score,
      details: incidentDetails,
    });
    await linkPredictionToAnomalyEvent(prediction.id, incident.id);

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
      anomalyEventId: existingPrediction?.anomalyEventId ?? null,
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

export async function getDeviceAnomalyState(device: OwnedDeviceContext) {
  const [latestReading, activeModel, activeAnomaly] = await Promise.all([
    getLatestDeviceReadingSummary(device.id),
    getActiveDeviceModel(device.id),
    getOpenAnomalyIncidentForDevice(device.id),
  ]);

  return {
    device,
    latestReading,
    model: activeModel
      ? {
        ready: true,
        status: activeModel.status,
        trainedAt: activeModel.trainedAt.toISOString(),
        trainedTo: activeModel.trainedTo.toISOString().slice(0, 10),
      }
      : {
        ready: false,
        status: "model_not_ready",
        trainedAt: null,
        trainedTo: null,
      },
    activeAnomaly: activeAnomaly ?? null,
  };
}

export async function listDeviceAnomalies(
  device: OwnedDeviceContext,
  query: {
    from?: string;
    to?: string;
    status: "all" | "open" | "closed";
    limit: number;
  },
) {
  const from = query.from ? parseOptionalDateOrThrow(query.from) : undefined;
  const to = query.to ? parseOptionalDateOrThrow(query.to) : undefined;

  if (from && to && from.getTime() >= to.getTime()) {
    throw new Error("INVALID_RANGE");
  }

  const anomalies = await listDeviceAnomalyIncidents({
    deviceId: device.id,
    from,
    to,
    status: query.status,
    limit: query.limit,
  });

  return {
    device,
    filters: {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      status: query.status,
      limit: query.limit,
    },
    anomalies,
  };
}

async function backfillTrainingFeatures(
  deviceId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const missingReadingsStartedAt = Date.now();
  const missingWindowRows = await listMissingTrainingWindowReadings({
    deviceId,
    startDate,
    endDate,
  });
  logTrainingStage(deviceId, "features:missing-readings-loaded", {
    missingRowsCount: missingWindowRows.length,
    durationMs: Date.now() - missingReadingsStartedAt,
  });

  if (missingWindowRows.length === 0) {
    logTrainingStage(deviceId, "features:backfill-skipped-window-complete");
    return 0;
  }

  const contextStartedAt = Date.now();
  const contextRowsDesc = await listReadingsBeforeLocalDate({
    deviceId,
    localDate: startDate,
    limit: FEATURE_ROLLING_WINDOW_SIZE - 1,
  });
  logTrainingStage(deviceId, "features:context-loaded", {
    contextRowsCount: contextRowsDesc.length,
    durationMs: Date.now() - contextStartedAt,
  });

  const windowReadingsStartedAt = Date.now();
  const windowRows = await listTrainingWindowReadings({
    deviceId,
    startDate,
    endDate,
  });
  logTrainingStage(deviceId, "features:window-readings-loaded", {
    windowRowsCount: windowRows.length,
    durationMs: Date.now() - windowReadingsStartedAt,
  });

  const missingReadingIds = new Set(missingWindowRows.map((reading) => reading.id));
  const contextById = new Map<bigint, DeviceReadingForFeatures>();
  const combinedRows = [...contextRowsDesc.reverse(), ...windowRows];
  const featuresToInsert: DeviceReadingFeatureVector[] = [];

  const buildStartedAt = Date.now();
  for (const reading of combinedRows) {
    const previousReadingsDesc = [...contextById.values()]
      .filter((candidate) => candidate.deviceId === reading.deviceId && candidate.id !== reading.id)
      .sort((left, right) => right.ts.getTime() - left.ts.getTime())
      .slice(0, FEATURE_ROLLING_WINDOW_SIZE - 1);

    if (missingReadingIds.has(reading.id)) {
      const feature = buildFeatureVector(reading, previousReadingsDesc);
      featuresToInsert.push(feature);
    }

    contextById.set(reading.id, reading);
  }
  logTrainingStage(deviceId, "features:built", {
    featuresToInsertCount: featuresToInsert.length,
    durationMs: Date.now() - buildStartedAt,
  });

  const insertStartedAt = Date.now();
  const insertedCount = await createManyReadingFeatures(featuresToInsert);
  logTrainingStage(deviceId, "features:inserted", {
    insertedCount,
    attemptedCount: featuresToInsert.length,
    durationMs: Date.now() - insertStartedAt,
  });

  return insertedCount;
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

function parseOptionalDateOrThrow(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("INVALID_RANGE");
  }
  return parsed;
}

function buildIncidentDetails(
  existing: Prisma.JsonValue | null,
  updates: {
    readingId: bigint;
    predictionId: string;
    detectedAt: Date;
    dayGroup: string;
    localHour: number;
    decisionFunction: number | null;
    featureSchemaVersion: string;
  },
): Prisma.InputJsonValue {
  const base = asJsonObject(existing);

  return {
    ...base,
    dayGroup: updates.dayGroup,
    localHour: updates.localHour,
    decisionFunction: updates.decisionFunction,
    featureSchemaVersion: updates.featureSchemaVersion,
    firstReadingId: typeof base.firstReadingId === "string" ? base.firstReadingId : updates.readingId.toString(),
    lastReadingId: updates.readingId.toString(),
    firstPredictionId: typeof base.firstPredictionId === "string"
      ? base.firstPredictionId
      : updates.predictionId,
    lastPredictionId: updates.predictionId,
    lastDetectedAt: updates.detectedAt.toISOString(),
  };
}

function buildClosedIncidentDetails(
  existing: Prisma.JsonValue | null,
  reason: "gap" | "normal_reading",
  readingId: bigint,
  closedAt: Date,
): Prisma.InputJsonValue {
  const base = asJsonObject(existing);

  return {
    ...base,
    closedReason: reason,
    closedAt: closedAt.toISOString(),
    closedByReadingId: readingId.toString(),
  };
}

function asJsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
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

function logTrainingStage(
  deviceId: string,
  stage: string,
  details?: Record<string, unknown>,
) {
  const serializedDetails = details ? ` ${JSON.stringify(details)}` : "";
  console.log(`[AnomalyTraining] device=${deviceId} stage=${stage}${serializedDetails}`);
}
