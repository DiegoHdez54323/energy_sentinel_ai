import type { Prisma } from "../../generated/prisma/client.js";

export type DeviceReadingForFeatures = {
  id: bigint;
  deviceId: string;
  ts: Date;
  timezone: string;
  apower: number | null;
  aenergyDelta: number | null;
  output: boolean | null;
};

export type DeviceReadingFeatureVector = {
  readingId: bigint;
  deviceId: string;
  ts: Date;
  localDate: Date;
  timezone: string;
  featureSchemaVersion: string;
  dayGroup: "weekday" | "weekend";
  localHour: number;
  dayOfWeek: number;
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
};

export type MlTrainingRow = {
  readingId: string;
  ts: string;
  localDate: string;
  localHour: number;
  dayGroup: "weekday" | "weekend";
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
};

export type MlTrainingResponse = {
  artifact: Prisma.InputJsonValue;
  summary: Prisma.InputJsonValue | null;
  trainingSampleCount: number;
};

export type MlScoringResult = {
  score: number;
  isAnomaly: boolean;
  decisionFunction: number | null;
};

export type DeviceModelTrainingResult =
  | { status: "disabled" | "insufficient_history" | "up_to_date" | "no_training_rows"; featureRowsUpserted: number; trained: false }
  | { status: "trained"; featureRowsUpserted: number; trained: true; modelId: string; trainingSampleCount: number };

export type DeviceReadingScoringResult =
  | { status: "disabled" | "duplicate" | "model_not_ready"; predictionCreated: boolean; anomalyCreated: boolean }
  | { status: "scored" | "score_failed"; predictionCreated: boolean; anomalyCreated: boolean };

export type DeviceAnomalyIncidentStatus = "open" | "closed";

export type DeviceAnomalyIncidentSummary = {
  id: string;
  status: DeviceAnomalyIncidentStatus;
  detectedAt: string;
  windowStart: string;
  windowEnd: string;
  readingsCount: number;
  severity: number;
  score: number | null;
  expectedValue: number | null;
  observedValue: number | null;
  details: Prisma.JsonValue | null;
};

export type DeviceLatestReadingSummary = {
  ts: string;
  apower: number | null;
  aenergyDelta: number | null;
  voltage: number | null;
  current: number | null;
  output: boolean | null;
};
