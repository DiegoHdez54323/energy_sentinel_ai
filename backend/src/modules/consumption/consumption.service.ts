import type { OwnedDeviceContext } from "../../common/ownership/device-ownership.js";
import type { OwnedHomeContext } from "../../common/ownership/home-ownership.js";
import {
  getDeviceTimezone,
  listDeviceDailyConsumption,
  listDeviceHourlyConsumption,
  listDeviceRawConsumption,
  listHomeDailyConsumption,
  listHomeHourlyConsumption,
  listHomeRawConsumption,
} from "./consumption.repository.js";
import type { ConsumptionGranularityInput, ConsumptionQueryInput } from "./consumption.schemas.js";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * ONE_DAY_MS;
const NINETY_DAYS_MS = 90 * ONE_DAY_MS;

export type ResolvedConsumptionGranularity = "raw" | "hourly" | "daily";

type ConsumptionSeriesPoint = {
  ts: string;
  energyWh: number;
  avgPowerW: number | null;
  maxPowerW: number | null;
  minPowerW: number | null;
  samplesCount: number;
};

function parseDateOrThrow(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("INVALID_RANGE");
  }
  return parsed;
}

function validateRangeOrThrow(from: Date, to: Date) {
  const spanMs = to.getTime() - from.getTime();
  if (spanMs <= 0 || spanMs > NINETY_DAYS_MS) {
    throw new Error("INVALID_RANGE");
  }
}

function resolveGranularityOrThrow(
  requested: ConsumptionGranularityInput,
  from: Date,
  to: Date,
): ResolvedConsumptionGranularity {
  const spanMs = to.getTime() - from.getTime();

  if (requested === "raw") {
    if (spanMs > ONE_DAY_MS) {
      throw new Error("INVALID_GRANULARITY_FOR_RANGE");
    }
    return "raw";
  }

  if (requested === "hourly" || requested === "daily") {
    return requested;
  }

  if (spanMs <= SIX_HOURS_MS) {
    return "raw";
  }

  if (spanMs <= FOURTEEN_DAYS_MS) {
    return "hourly";
  }

  return "daily";
}

async function listSeriesForDevice(options: {
  deviceId: string;
  granularity: ResolvedConsumptionGranularity;
  from: Date;
  to: Date;
}): Promise<ConsumptionSeriesPoint[]> {
  switch (options.granularity) {
    case "raw":
      return listDeviceRawConsumption(options);
    case "hourly":
      return listDeviceHourlyConsumption(options);
    case "daily":
      return listDeviceDailyConsumption(options);
  }
}

async function listSeriesForHome(options: {
  homeId: string;
  granularity: ResolvedConsumptionGranularity;
  from: Date;
  to: Date;
}): Promise<ConsumptionSeriesPoint[]> {
  switch (options.granularity) {
    case "raw":
      return listHomeRawConsumption(options);
    case "hourly":
      return listHomeHourlyConsumption(options);
    case "daily":
      return listHomeDailyConsumption(options);
  }
}

export async function getDeviceConsumption(
  device: OwnedDeviceContext,
  query: ConsumptionQueryInput,
) {
  const from = parseDateOrThrow(query.from);
  const to = parseDateOrThrow(query.to);
  validateRangeOrThrow(from, to);

  const timezone = await getDeviceTimezone(device.id);
  if (!timezone) {
    throw new Error("DEVICE_NOT_FOUND");
  }

  const granularityResolved = resolveGranularityOrThrow(query.granularity, from, to);
  const series = await listSeriesForDevice({
    deviceId: device.id,
    granularity: granularityResolved,
    from,
    to,
  });

  return {
    device,
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    granularityRequested: query.granularity,
    granularityResolved,
    timezone,
    series,
  };
}

export async function getHomeConsumption(
  home: OwnedHomeContext,
  query: ConsumptionQueryInput,
) {
  const from = parseDateOrThrow(query.from);
  const to = parseDateOrThrow(query.to);
  validateRangeOrThrow(from, to);

  const granularityResolved = resolveGranularityOrThrow(query.granularity, from, to);
  const series = await listSeriesForHome({
    homeId: home.id,
    granularity: granularityResolved,
    from,
    to,
  });

  return {
    home,
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    granularityRequested: query.granularity,
    granularityResolved,
    timezone: home.timezone,
    series,
  };
}
