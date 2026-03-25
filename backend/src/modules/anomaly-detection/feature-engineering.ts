import {
  ANOMALY_FEATURE_SCHEMA_VERSION,
  FEATURE_ROLLING_WINDOW_SIZE,
} from "./anomaly-detection.constants.js";
import type {
  DeviceReadingFeatureVector,
  DeviceReadingForFeatures,
} from "./anomaly-detection.types.js";

const TWO_PI = Math.PI * 2;

export function buildFeatureVector(
  current: DeviceReadingForFeatures,
  previousReadingsDesc: DeviceReadingForFeatures[],
): DeviceReadingFeatureVector {
  const localParts = getLocalDateParts(current.ts, current.timezone);
  const outputNumeric = current.output === null ? null : (current.output ? 1 : 0);
  const previousPower = previousReadingsDesc[0]?.apower ?? null;
  const rollingPowers = [
    current.apower,
    ...previousReadingsDesc.slice(0, FEATURE_ROLLING_WINDOW_SIZE - 1).map((reading) => reading.apower),
  ].filter((value): value is number => value !== null);

  return {
    readingId: current.id,
    deviceId: current.deviceId,
    ts: current.ts,
    localDate: new Date(`${localParts.localDate}T00:00:00.000Z`),
    timezone: current.timezone,
    featureSchemaVersion: ANOMALY_FEATURE_SCHEMA_VERSION,
    dayGroup: localParts.dayOfWeek >= 6 ? "weekend" : "weekday",
    localHour: localParts.localHour,
    dayOfWeek: localParts.dayOfWeek,
    apower: current.apower,
    aenergyDelta: current.aenergyDelta,
    outputNumeric,
    hourSin: roundTo6(Math.sin((TWO_PI * localParts.localHour) / 24)),
    hourCos: roundTo6(Math.cos((TWO_PI * localParts.localHour) / 24)),
    dayOfWeekSin: roundTo6(Math.sin((TWO_PI * (localParts.dayOfWeek - 1)) / 7)),
    dayOfWeekCos: roundTo6(Math.cos((TWO_PI * (localParts.dayOfWeek - 1)) / 7)),
    deltaPowerPrev: current.apower !== null && previousPower !== null
      ? roundTo6(current.apower - previousPower)
      : null,
    rollingMeanPower5: rollingPowers.length > 0
      ? roundTo6(rollingPowers.reduce((sum, value) => sum + value, 0) / rollingPowers.length)
      : null,
    rollingStdPower5: rollingPowers.length > 1
      ? roundTo6(computeStandardDeviation(rollingPowers))
      : null,
  };
}

export function featureVectorToMlRow(feature: DeviceReadingFeatureVector) {
  return {
    readingId: feature.readingId.toString(),
    ts: feature.ts.toISOString(),
    localDate: feature.localDate.toISOString().slice(0, 10),
    localHour: feature.localHour,
    dayGroup: feature.dayGroup,
    apower: feature.apower,
    aenergyDelta: feature.aenergyDelta,
    outputNumeric: feature.outputNumeric,
    hourSin: feature.hourSin,
    hourCos: feature.hourCos,
    dayOfWeekSin: feature.dayOfWeekSin,
    dayOfWeekCos: feature.dayOfWeekCos,
    deltaPowerPrev: feature.deltaPowerPrev,
    rollingMeanPower5: feature.rollingMeanPower5,
    rollingStdPower5: feature.rollingStdPower5,
  };
}

function getLocalDateParts(date: Date, timeZone: string): {
  localDate: string;
  localHour: number;
  dayOfWeek: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const weekday = parts.find((part) => part.type === "weekday")?.value;

  if (!year || !month || !day || !hour || !weekday) {
    throw new Error(`Unable to derive local date parts for timezone ${timeZone}`);
  }

  return {
    localDate: `${year}-${month}-${day}`,
    localHour: Number(hour),
    dayOfWeek: mapWeekdayToIso(weekday),
  };
}

function mapWeekdayToIso(value: string): number {
  switch (value) {
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    case "Sun":
      return 7;
    default:
      throw new Error(`Unsupported weekday value ${value}`);
  }
}

function computeStandardDeviation(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function roundTo6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
