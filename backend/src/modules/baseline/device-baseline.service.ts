import { env } from "../../config/env.js";
import {
  getActiveDeviceBaseline,
  getDeviceBaselineTimezone,
  listRecentDeviceUsageDailyDates,
  listTrainingHourlyRows,
  replaceActiveDeviceBaseline,
} from "./device-baseline.repository.js";
import {
  DEVICE_BASELINE_DAY_GROUPS,
  DEVICE_BASELINE_MODEL_VERSION,
  type DeviceBaselineBucketInput,
  type DeviceBaselineDayGroup,
  type DeviceBaselineRefreshResult,
} from "./device-baseline.types.js";

export async function refreshDeviceBaseline(
  deviceId: string,
  options?: {
    enabled?: boolean;
    windowDays?: number;
    minBucketSamples?: number;
  },
): Promise<DeviceBaselineRefreshResult> {
  const enabled = options?.enabled ?? env.BASELINE_ENABLED;
  if (!enabled) {
    return {
      status: "disabled",
      bucketsCreated: 0,
    };
  }

  const windowDays = Math.max(1, options?.windowDays ?? env.BASELINE_WINDOW_DAYS);
  const minBucketSamples = Math.max(1, options?.minBucketSamples ?? env.BASELINE_MIN_BUCKET_SAMPLES);

  const timezone = await getDeviceBaselineTimezone(deviceId);
  if (!timezone) {
    return {
      status: "insufficient_history",
      bucketsCreated: 0,
    };
  }

  const dailyDates = await listRecentDeviceUsageDailyDates(deviceId, windowDays);
  const windowBounds = getContiguousWindowBounds(dailyDates, windowDays);
  if (!windowBounds) {
    return {
      status: "insufficient_history",
      bucketsCreated: 0,
    };
  }

  const activeBaseline = await getActiveDeviceBaseline(deviceId);
  if (
    activeBaseline
    && activeBaseline.timezone === timezone
    && activeBaseline.windowDays === windowDays
    && activeBaseline.minBucketSamples === minBucketSamples
    && activeBaseline.modelVersion === DEVICE_BASELINE_MODEL_VERSION
    && normalizeLocalDate(activeBaseline.sourceEndDate) === windowBounds.endDate
  ) {
    return {
      status: "up_to_date",
      bucketsCreated: 0,
    };
  }

  const hourlyRows = await listTrainingHourlyRows(
    deviceId,
    windowBounds.startDate,
    windowBounds.endDate,
  );
  const buckets = buildBaselineBuckets(hourlyRows, minBucketSamples);
  if (!buckets) {
    return {
      status: "insufficient_samples",
      bucketsCreated: 0,
    };
  }

  const created = await replaceActiveDeviceBaseline({
    deviceId,
    timezone,
    windowDays,
    sourceStartDate: localDateStringToDate(windowBounds.startDate),
    sourceEndDate: localDateStringToDate(windowBounds.endDate),
    historyDaysUsed: windowDays,
    minBucketSamples,
    summary: {
      bucketsCount: buckets.length,
      hourlyRowsUsed: hourlyRows.length,
      startDate: windowBounds.startDate,
      endDate: windowBounds.endDate,
    },
    buckets,
  });

  return {
    status: "activated",
    bucketsCreated: created.bucketsCreated,
  };
}

function getContiguousWindowBounds(
  dates: Date[],
  windowDays: number,
): { startDate: string; endDate: string } | null {
  if (dates.length < windowDays) {
    return null;
  }

  const localDates = dates.map(normalizeLocalDate);
  const endDate = localDates[0];
  if (!endDate) {
    return null;
  }

  for (let index = 1; index < windowDays; index += 1) {
    if (localDates[index] !== addLocalDays(endDate, -index)) {
      return null;
    }
  }

  return {
    startDate: localDates[windowDays - 1]!,
    endDate,
  };
}

function buildBaselineBuckets(
  rows: Array<{ dayGroup: DeviceBaselineDayGroup; localHour: number; energyWh: number }>,
  minBucketSamples: number,
): DeviceBaselineBucketInput[] | null {
  const grouped = new Map<string, number[]>();

  for (const row of rows) {
    if (row.localHour < 0 || row.localHour > 23) {
      continue;
    }

    const key = `${row.dayGroup}:${row.localHour}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(row.energyWh);
    grouped.set(key, bucket);
  }

  const buckets: DeviceBaselineBucketInput[] = [];
  for (const dayGroup of DEVICE_BASELINE_DAY_GROUPS) {
    for (let localHour = 0; localHour < 24; localHour += 1) {
      const values = grouped.get(`${dayGroup}:${localHour}`);
      if (!values || values.length < minBucketSamples) {
        return null;
      }

      const sortedValues = [...values].sort((left, right) => left - right);
      buckets.push({
        dayGroup,
        localHour,
        sampleCount: sortedValues.length,
        expectedEnergyWh: roundTo4(getQuantile(sortedValues, 0.5)),
        lowerBoundEnergyWh: roundTo4(getQuantile(sortedValues, 0.1)),
        upperBoundEnergyWh: roundTo4(getQuantile(sortedValues, 0.9)),
      });
    }
  }

  return buckets;
}

function getQuantile(sortedValues: number[], quantile: number): number {
  if (sortedValues.length === 1) {
    return sortedValues[0]!;
  }

  const position = (sortedValues.length - 1) * quantile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lowerValue = sortedValues[lowerIndex]!;
  const upperValue = sortedValues[upperIndex]!;

  if (lowerIndex === upperIndex) {
    return lowerValue;
  }

  const weight = position - lowerIndex;
  return lowerValue + ((upperValue - lowerValue) * weight);
}

function roundTo4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function normalizeLocalDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addLocalDays(value: string, days: number): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return normalizeLocalDate(parsed);
}

function localDateStringToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
