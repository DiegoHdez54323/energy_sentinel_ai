import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import {
  ANOMALY_FEATURE_SCHEMA_VERSION,
  ANOMALY_INCIDENT_STATUS_OPEN,
  ANOMALY_MODEL_TYPE,
  ANOMALY_MODEL_VERSION,
} from "./anomaly-detection.constants.js";
import type {
  DeviceAnomalyIncidentSummary,
  DeviceLatestReadingSummary,
  DeviceReadingFeatureVector,
  DeviceReadingForFeatures,
} from "./anomaly-detection.types.js";

type IncidentRow = {
  id: string;
  status: string;
  detectedAt: Date;
  windowStart: Date;
  windowEnd: Date;
  readingsCount: number;
  severity: number;
  score: Prisma.Decimal | number | string | null;
  expectedValue: Prisma.Decimal | number | string | null;
  observedValue: Prisma.Decimal | number | string | null;
  details: Prisma.JsonValue | null;
};

function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return value instanceof Prisma.Decimal ? value.toNumber() : null;
}

function normalizeIncident(row: IncidentRow): DeviceAnomalyIncidentSummary {
  return {
    id: row.id,
    status: row.status as DeviceAnomalyIncidentSummary["status"],
    detectedAt: row.detectedAt.toISOString(),
    windowStart: row.windowStart.toISOString(),
    windowEnd: row.windowEnd.toISOString(),
    readingsCount: row.readingsCount,
    severity: row.severity,
    score: decimalToNumber(row.score),
    expectedValue: decimalToNumber(row.expectedValue),
    observedValue: decimalToNumber(row.observedValue),
    details: row.details,
  };
}

export async function getReadingForScoring(readingId: bigint): Promise<DeviceReadingForFeatures | null> {
  const rows = await prisma.$queryRaw<Array<{
    id: bigint;
    deviceId: string;
    ts: Date;
    timezone: string;
    apower: number | null;
    aenergyDelta: number | null;
    output: boolean | null;
  }>>`
    SELECT
      dr."id" AS "id",
      dr."device_id" AS "deviceId",
      dr."ts" AS "ts",
      h."timezone" AS "timezone",
      dr."apower"::double precision AS "apower",
      dr."aenergy_delta"::double precision AS "aenergyDelta",
      dr."output" AS "output"
    FROM "device_readings" dr
    JOIN "devices" d ON d."id" = dr."device_id"
    JOIN "homes" h ON h."id" = d."home_id"
    WHERE dr."id" = ${readingId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function getDeviceTimezone(deviceId: string): Promise<string | null> {
  const device = await prisma.device.findUnique({
    where: {
      id: deviceId,
    },
    select: {
      home: {
        select: {
          timezone: true,
        },
      },
    },
  });

  return device?.home.timezone ?? null;
}

export async function listPreviousReadingsForDevice(
  deviceId: string,
  ts: Date,
  limit: number,
  excludedReadingId?: bigint,
): Promise<DeviceReadingForFeatures[]> {
  if (excludedReadingId !== undefined) {
    return prisma.$queryRaw<Array<{
      id: bigint;
      deviceId: string;
      ts: Date;
      timezone: string;
      apower: number | null;
      aenergyDelta: number | null;
      output: boolean | null;
    }>>`
      SELECT
        dr."id" AS "id",
        dr."device_id" AS "deviceId",
        dr."ts" AS "ts",
        h."timezone" AS "timezone",
        dr."apower"::double precision AS "apower",
        dr."aenergy_delta"::double precision AS "aenergyDelta",
        dr."output" AS "output"
      FROM "device_readings" dr
      JOIN "devices" d ON d."id" = dr."device_id"
      JOIN "homes" h ON h."id" = d."home_id"
      WHERE dr."device_id" = ${deviceId}
        AND dr."ts" <= ${ts}
        AND dr."id" <> ${excludedReadingId}
      ORDER BY dr."ts" DESC, dr."id" DESC
      LIMIT ${limit}
    `;
  }

  const rows = await prisma.$queryRaw<Array<{
    id: bigint;
    deviceId: string;
    ts: Date;
    timezone: string;
    apower: number | null;
    aenergyDelta: number | null;
    output: boolean | null;
  }>>`
    SELECT
      dr."id" AS "id",
      dr."device_id" AS "deviceId",
      dr."ts" AS "ts",
      h."timezone" AS "timezone",
      dr."apower"::double precision AS "apower",
      dr."aenergy_delta"::double precision AS "aenergyDelta",
      dr."output" AS "output"
    FROM "device_readings" dr
    JOIN "devices" d ON d."id" = dr."device_id"
    JOIN "homes" h ON h."id" = d."home_id"
    WHERE dr."device_id" = ${deviceId}
      AND dr."ts" <= ${ts}
    ORDER BY dr."ts" DESC, dr."id" DESC
    LIMIT ${limit}
  `;

  return rows;
}

export async function upsertReadingFeature(feature: DeviceReadingFeatureVector) {
  return prisma.deviceReadingFeature.upsert({
    where: {
      readingId_featureSchemaVersion: {
        readingId: feature.readingId,
        featureSchemaVersion: feature.featureSchemaVersion,
      },
    },
    create: feature,
    update: feature,
  });
}

export async function createManyReadingFeatures(features: DeviceReadingFeatureVector[]): Promise<number> {
  if (features.length === 0) {
    return 0;
  }

  const CHUNK_SIZE = 500;
  let insertedCount = 0;

  for (let index = 0; index < features.length; index += CHUNK_SIZE) {
    const chunk = features.slice(index, index + CHUNK_SIZE);
    const result = await prisma.deviceReadingFeature.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    insertedCount += result.count;
  }

  return insertedCount;
}

export async function listTrainingWindowReadings(options: {
  deviceId: string;
  startDate: string;
  endDate: string;
}): Promise<DeviceReadingForFeatures[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: bigint;
    deviceId: string;
    ts: Date;
    timezone: string;
    apower: number | null;
    aenergyDelta: number | null;
    output: boolean | null;
  }>>`
    SELECT
      dr."id" AS "id",
      dr."device_id" AS "deviceId",
      dr."ts" AS "ts",
      h."timezone" AS "timezone",
      dr."apower"::double precision AS "apower",
      dr."aenergy_delta"::double precision AS "aenergyDelta",
      dr."output" AS "output"
    FROM "device_readings" dr
    JOIN "devices" d ON d."id" = dr."device_id"
    JOIN "homes" h ON h."id" = d."home_id"
    WHERE dr."device_id" = ${options.deviceId}
      AND ((dr."ts" AT TIME ZONE h."timezone")::date) BETWEEN ${options.startDate}::date AND ${options.endDate}::date
    ORDER BY dr."ts" ASC, dr."id" ASC
  `;

  return rows;
}

export async function listMissingTrainingWindowReadings(options: {
  deviceId: string;
  startDate: string;
  endDate: string;
}): Promise<DeviceReadingForFeatures[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: bigint;
    deviceId: string;
    ts: Date;
    timezone: string;
    apower: number | null;
    aenergyDelta: number | null;
    output: boolean | null;
  }>>`
    SELECT
      dr."id" AS "id",
      dr."device_id" AS "deviceId",
      dr."ts" AS "ts",
      h."timezone" AS "timezone",
      dr."apower"::double precision AS "apower",
      dr."aenergy_delta"::double precision AS "aenergyDelta",
      dr."output" AS "output"
    FROM "device_readings" dr
    JOIN "devices" d ON d."id" = dr."device_id"
    JOIN "homes" h ON h."id" = d."home_id"
    WHERE dr."device_id" = ${options.deviceId}
      AND ((dr."ts" AT TIME ZONE h."timezone")::date) BETWEEN ${options.startDate}::date AND ${options.endDate}::date
      AND NOT EXISTS (
        SELECT 1
        FROM "device_reading_features" drf
        WHERE drf."reading_id" = dr."id"
          AND drf."feature_schema_version" = ${ANOMALY_FEATURE_SCHEMA_VERSION}
      )
    ORDER BY dr."ts" ASC, dr."id" ASC
  `;

  return rows;
}

export async function listReadingsBeforeLocalDate(options: {
  deviceId: string;
  localDate: string;
  limit: number;
}): Promise<DeviceReadingForFeatures[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: bigint;
    deviceId: string;
    ts: Date;
    timezone: string;
    apower: number | null;
    aenergyDelta: number | null;
    output: boolean | null;
  }>>`
    SELECT
      dr."id" AS "id",
      dr."device_id" AS "deviceId",
      dr."ts" AS "ts",
      h."timezone" AS "timezone",
      dr."apower"::double precision AS "apower",
      dr."aenergy_delta"::double precision AS "aenergyDelta",
      dr."output" AS "output"
    FROM "device_readings" dr
    JOIN "devices" d ON d."id" = dr."device_id"
    JOIN "homes" h ON h."id" = d."home_id"
    WHERE dr."device_id" = ${options.deviceId}
      AND ((dr."ts" AT TIME ZONE h."timezone")::date) < ${options.localDate}::date
    ORDER BY dr."ts" DESC, dr."id" DESC
    LIMIT ${options.limit}
  `;

  return rows;
}

export async function listRecentClosedDailyDates(
  deviceId: string,
  take: number,
): Promise<Date[]> {
  const rows = await prisma.deviceUsageDaily.findMany({
    where: { deviceId },
    select: { date: true },
    orderBy: { date: "desc" },
    take,
  });

  return rows.map((row) => row.date);
}

export async function listTrainingFeatureRows(options: {
  deviceId: string;
  startDate: Date;
  endDate: Date;
}): Promise<Array<{
  readingId: bigint;
  ts: Date;
  localDate: Date;
  localHour: number;
  dayGroup: string;
  apower: number | null;
  aenergyDelta: number | null;
  outputNumeric: number | null;
  hourSin: number;
  hourCos: number;
  dayOfWeekSin: number;
  dayOfWeekCos: number;
  deltaPowerPrev: number | null;
  rollingMeanPower5: number | null;
  rollingStdPower5: number | null;
}>> {
  return prisma.deviceReadingFeature.findMany({
    where: {
      deviceId: options.deviceId,
      featureSchemaVersion: ANOMALY_FEATURE_SCHEMA_VERSION,
      localDate: {
        gte: options.startDate,
        lte: options.endDate,
      },
    },
    orderBy: {
      ts: "asc",
    },
    select: {
      readingId: true,
      ts: true,
      localDate: true,
      localHour: true,
      dayGroup: true,
      apower: true,
      aenergyDelta: true,
      outputNumeric: true,
      hourSin: true,
      hourCos: true,
      dayOfWeekSin: true,
      dayOfWeekCos: true,
      deltaPowerPrev: true,
      rollingMeanPower5: true,
      rollingStdPower5: true,
    },
  });
}

export async function getActiveDeviceModel(deviceId: string) {
  return prisma.deviceAnomalyModel.findFirst({
    where: {
      deviceId,
      modelType: ANOMALY_MODEL_TYPE,
      featureSchemaVersion: ANOMALY_FEATURE_SCHEMA_VERSION,
      isActive: true,
    },
    orderBy: {
      trainedAt: "desc",
    },
  });
}

export async function replaceActiveDeviceModel(input: {
  deviceId: string;
  contamination: number;
  trainingWindowDays: number;
  trainedFrom: Date;
  trainedTo: Date;
  trainedAt: Date;
  trainingSampleCount: number;
  timezone: string;
  artifact: Prisma.InputJsonValue;
  summary: Prisma.InputJsonValue | null;
}): Promise<string> {
  const supersededAt = input.trainedAt;

  const created = await prisma.$transaction(async (tx) => {
    await tx.deviceAnomalyModel.updateMany({
      where: {
        deviceId: input.deviceId,
        modelType: ANOMALY_MODEL_TYPE,
        featureSchemaVersion: ANOMALY_FEATURE_SCHEMA_VERSION,
        isActive: true,
      },
      data: {
        isActive: false,
        status: "superseded",
        supersededAt,
      },
    });

    return tx.deviceAnomalyModel.create({
      data: {
        deviceId: input.deviceId,
        modelType: ANOMALY_MODEL_TYPE,
        modelVersion: ANOMALY_MODEL_VERSION,
        featureSchemaVersion: ANOMALY_FEATURE_SCHEMA_VERSION,
        contamination: input.contamination,
        trainingWindowDays: input.trainingWindowDays,
        trainedFrom: input.trainedFrom,
        trainedTo: input.trainedTo,
        trainedAt: input.trainedAt,
        trainingSampleCount: input.trainingSampleCount,
        timezone: input.timezone,
        artifact: input.artifact,
        summary: input.summary ?? Prisma.JsonNull,
        isActive: true,
        status: "active",
      },
      select: {
        id: true,
      },
    });
  });

  return created.id;
}

export async function upsertPrediction(input: {
  readingId: bigint;
  deviceId: string;
  modelId?: string | null;
  anomalyEventId?: string | null;
  scoredAt: Date;
  score?: number | null;
  decisionFunction?: number | null;
  isAnomaly?: boolean | null;
  status: string;
  details?: Prisma.InputJsonValue | null;
}) {
  const createData = {
    readingId: input.readingId,
    deviceId: input.deviceId,
    modelId: input.modelId ?? null,
    anomalyEventId: input.anomalyEventId ?? null,
    scoredAt: input.scoredAt,
    score: input.score ?? null,
    decisionFunction: input.decisionFunction ?? null,
    isAnomaly: input.isAnomaly ?? null,
    status: input.status,
    details: input.details ?? Prisma.JsonNull,
  };

  const updateData = {
    modelId: input.modelId ?? null,
    scoredAt: input.scoredAt,
    score: input.score ?? null,
    decisionFunction: input.decisionFunction ?? null,
    isAnomaly: input.isAnomaly ?? null,
    status: input.status,
    details: input.details ?? Prisma.JsonNull,
    ...(input.anomalyEventId !== undefined
      ? {
        anomalyEventId: input.anomalyEventId,
      }
      : {}),
  };

  return prisma.deviceAnomalyPrediction.upsert({
    where: {
      readingId: input.readingId,
    },
    create: createData,
    update: updateData,
  });
}

export async function findPredictionByReadingId(readingId: bigint) {
  return prisma.deviceAnomalyPrediction.findUnique({
    where: {
      readingId,
    },
    select: {
      id: true,
      anomalyEventId: true,
      status: true,
      isAnomaly: true,
    },
  });
}

export async function linkPredictionToAnomalyEvent(predictionId: string, anomalyEventId: string) {
  return prisma.deviceAnomalyPrediction.update({
    where: {
      id: predictionId,
    },
    data: {
      anomalyEventId,
    },
  });
}

export async function getOpenAnomalyIncidentForDevice(deviceId: string) {
  const incident = await prisma.anomalyEvent.findFirst({
    where: {
      deviceId,
      status: ANOMALY_INCIDENT_STATUS_OPEN,
    },
    orderBy: {
      detectedAt: "desc",
    },
    select: {
      id: true,
      status: true,
      detectedAt: true,
      windowStart: true,
      windowEnd: true,
      readingsCount: true,
      severity: true,
      score: true,
      expectedValue: true,
      observedValue: true,
      details: true,
    },
  });

  return incident ? normalizeIncident(incident) : null;
}

export async function createAnomalyIncident(input: {
  deviceId: string;
  modelId?: string | null;
  predictionId: string;
  readingId: bigint;
  detectedAt: Date;
  observedValue?: number | null;
  expectedValue?: number | null;
  score?: number | null;
  details?: Prisma.InputJsonValue | null;
}) {
  const incident = await prisma.anomalyEvent.create({
    data: {
      deviceId: input.deviceId,
      modelId: input.modelId ?? null,
      predictionId: input.predictionId,
      readingId: input.readingId,
      status: ANOMALY_INCIDENT_STATUS_OPEN,
      readingsCount: 1,
      detectedAt: input.detectedAt,
      windowStart: input.detectedAt,
      windowEnd: input.detectedAt,
      anomalyType: "reading_outlier",
      severity: 1,
      score: input.score ?? null,
      expectedValue: input.expectedValue ?? null,
      observedValue: input.observedValue ?? null,
      details: input.details ?? Prisma.JsonNull,
    },
    select: {
      id: true,
      status: true,
      detectedAt: true,
      windowStart: true,
      windowEnd: true,
      readingsCount: true,
      severity: true,
      score: true,
      expectedValue: true,
      observedValue: true,
      details: true,
    },
  });

  return normalizeIncident(incident);
}

export async function extendAnomalyIncident(input: {
  id: string;
  modelId?: string | null;
  detectedAt: Date;
  observedValue?: number | null;
  expectedValue?: number | null;
  score?: number | null;
  details?: Prisma.InputJsonValue | null;
}) {
  const incident = await prisma.anomalyEvent.update({
    where: {
      id: input.id,
    },
    data: {
      modelId: input.modelId ?? null,
      windowEnd: input.detectedAt,
      readingsCount: {
        increment: 1,
      },
      score: input.score ?? null,
      expectedValue: input.expectedValue ?? null,
      observedValue: input.observedValue ?? null,
      details: input.details ?? Prisma.JsonNull,
    },
    select: {
      id: true,
      status: true,
      detectedAt: true,
      windowStart: true,
      windowEnd: true,
      readingsCount: true,
      severity: true,
      score: true,
      expectedValue: true,
      observedValue: true,
      details: true,
    },
  });

  return normalizeIncident(incident);
}

export async function closeAnomalyIncident(input: {
  id: string;
  details?: Prisma.InputJsonValue | null;
}) {
  const incident = await prisma.anomalyEvent.update({
    where: {
      id: input.id,
    },
    data: {
      status: "closed",
      details: input.details ?? Prisma.JsonNull,
    },
    select: {
      id: true,
      status: true,
      detectedAt: true,
      windowStart: true,
      windowEnd: true,
      readingsCount: true,
      severity: true,
      score: true,
      expectedValue: true,
      observedValue: true,
      details: true,
    },
  });

  return normalizeIncident(incident);
}

export async function getLatestDeviceReadingSummary(deviceId: string): Promise<DeviceLatestReadingSummary | null> {
  const reading = await prisma.deviceReading.findFirst({
    where: {
      deviceId,
    },
    orderBy: [
      {
        ts: "desc",
      },
      {
        id: "desc",
      },
    ],
    select: {
      ts: true,
      apower: true,
      aenergyDelta: true,
      voltage: true,
      current: true,
      output: true,
    },
  });

  if (!reading) {
    return null;
  }

  return {
    ts: reading.ts.toISOString(),
    apower: decimalToNumber(reading.apower),
    aenergyDelta: decimalToNumber(reading.aenergyDelta),
    voltage: decimalToNumber(reading.voltage),
    current: decimalToNumber(reading.current),
    output: reading.output,
  };
}

export async function listDeviceAnomalyIncidents(options: {
  deviceId: string;
  from?: Date;
  to?: Date;
  status?: "all" | "open" | "closed";
  limit: number;
}): Promise<DeviceAnomalyIncidentSummary[]> {
  const incidents = await prisma.anomalyEvent.findMany({
    where: {
      deviceId: options.deviceId,
      ...(options.status && options.status !== "all"
        ? {
          status: options.status,
        }
        : {}),
      ...(options.from || options.to
        ? {
          AND: [
            ...(options.from
              ? [{
                windowEnd: {
                  gte: options.from,
                },
              }]
              : []),
            ...(options.to
              ? [{
                windowStart: {
                  lt: options.to,
                },
              }]
              : []),
          ],
        }
        : {}),
    },
    orderBy: {
      detectedAt: "desc",
    },
    take: options.limit,
    select: {
      id: true,
      status: true,
      detectedAt: true,
      windowStart: true,
      windowEnd: true,
      readingsCount: true,
      severity: true,
      score: true,
      expectedValue: true,
      observedValue: true,
      details: true,
    },
  });

  return incidents.map((incident) => normalizeIncident(incident));
}
