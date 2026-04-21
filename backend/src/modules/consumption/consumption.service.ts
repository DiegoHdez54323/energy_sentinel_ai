import type { OwnedDeviceContext } from "../../common/ownership/device-ownership.js";
import type { OwnedHomeContext } from "../../common/ownership/home-ownership.js";
import {
  getDeviceTimezone,
  listDeviceDailyConsumption,
  listDeviceHourlyConsumption,
  listDeviceRawConsumption,
  listHomeDailyConsumptionBreakdown,
  listHomeDailyConsumption,
  listHomeHourlyConsumptionBreakdown,
  listHomeHourlyConsumption,
} from "./consumption.repository.js";
import { prisma } from "../../lib/prisma.js";
import type {
  ConsumptionGranularityInput,
  ConsumptionQueryInput,
  ConsumptionSummaryPeriodInput,
} from "./consumption.schemas.js";

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

type DateParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

type HomeBreakdownItem = {
  deviceId: string;
  energyWh: number;
  name: string;
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

function resolveDeviceGranularityOrThrow(
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

function getZonedParts(date: Date, timezone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    month: Number(parts.month),
    second: Number(parts.second),
    year: Number(parts.year),
  };
}

function zonedLocalTimeToUtc(parts: DateParts, timezone: string) {
  const targetUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let utc = targetUtc;

  for (let index = 0; index < 3; index += 1) {
    const zonedParts = getZonedParts(new Date(utc), timezone);
    const zonedUtc = Date.UTC(
      zonedParts.year,
      zonedParts.month - 1,
      zonedParts.day,
      zonedParts.hour,
      zonedParts.minute,
      zonedParts.second,
    );
    utc -= zonedUtc - targetUtc;
  }

  return new Date(utc);
}

function addLocalDays(parts: DateParts, days: number): DateParts {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));

  return {
    ...parts,
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth() + 1,
    year: shifted.getUTCFullYear(),
  };
}

function getMondayStartParts(parts: DateParts, timezone: string): DateParts {
  const localNoonUtc = zonedLocalTimeToUtc(
    { ...parts, hour: 12, minute: 0, second: 0 },
    timezone,
  );
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(localNoonUtc);
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const daysSinceMonday = weekdayIndex === 0 ? 6 : Math.max(weekdayIndex - 1, 0);

  return {
    ...addLocalDays(parts, -daysSinceMonday),
    hour: 0,
    minute: 0,
    second: 0,
  };
}

function getConsumptionSummaryRanges(
  now: Date,
  timezone: string,
  period: ConsumptionSummaryPeriodInput,
) {
  const nowParts = getZonedParts(now, timezone);
  const currentStartParts = period === "today"
    ? { ...nowParts, hour: 0, minute: 0, second: 0 }
    : period === "week"
      ? getMondayStartParts(nowParts, timezone)
      : { ...nowParts, day: 1, hour: 0, minute: 0, second: 0 };
  const currentFrom = zonedLocalTimeToUtc(currentStartParts, timezone);
  const currentTo = now;
  const durationMs = Math.max(currentTo.getTime() - currentFrom.getTime(), 1);
  const previousTo = new Date(currentFrom);
  const previousFrom = new Date(previousTo.getTime() - durationMs);

  return {
    current: {
      from: currentFrom,
      to: currentTo,
    },
    previous: {
      from: previousFrom,
      to: previousTo,
    },
  };
}

function buildTrend(current: number, previous: number) {
  const trend = current > previous ? "up" : current < previous ? "down" : "flat";
  const trendPercent = previous > 0
    ? Math.round(((current - previous) / previous) * 100)
    : null;

  return { trend, trendPercent } as const;
}

function sumEnergy(series: ConsumptionSeriesPoint[]) {
  return series.reduce((total, point) => total + point.energyWh, 0);
}

function computeAverageEnergyWh(options: {
  from: Date;
  period: ConsumptionSummaryPeriodInput;
  to: Date;
  totalEnergyWh: number;
}) {
  const durationMs = Math.max(options.to.getTime() - options.from.getTime(), 1);
  const divisor = options.period === "today"
    ? Math.max(durationMs / ONE_DAY_MS * 24, 1)
    : Math.max(durationMs / ONE_DAY_MS, 1);

  return Math.round(options.totalEnergyWh / divisor);
}

function resolveHomeGranularityOrThrow(
  requested: ConsumptionGranularityInput,
  from: Date,
  to: Date,
): Exclude<ResolvedConsumptionGranularity, "raw"> {
  const spanMs = to.getTime() - from.getTime();

  if (requested === "raw") {
    throw new Error("INVALID_GRANULARITY_FOR_RANGE");
  }

  if (requested === "hourly" || requested === "daily") {
    return requested;
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
  granularity: Exclude<ResolvedConsumptionGranularity, "raw">;
  from: Date;
  to: Date;
}): Promise<ConsumptionSeriesPoint[]> {
  switch (options.granularity) {
    case "hourly":
      return listHomeHourlyConsumption(options);
    case "daily":
      return listHomeDailyConsumption(options);
  }
}

async function listBreakdownForHome(options: {
  granularity: Exclude<ResolvedConsumptionGranularity, "raw">;
  homeId: string;
  from: Date;
  to: Date;
}): Promise<HomeBreakdownItem[]> {
  switch (options.granularity) {
    case "hourly":
      return listHomeHourlyConsumptionBreakdown(options);
    case "daily":
      return listHomeDailyConsumptionBreakdown(options);
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

  const granularityResolved = resolveDeviceGranularityOrThrow(query.granularity, from, to);
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

  const granularityResolved = resolveHomeGranularityOrThrow(query.granularity, from, to);
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

export async function getHomeConsumptionSummary(
  home: OwnedHomeContext,
  period: ConsumptionSummaryPeriodInput,
) {
  const generatedAt = new Date();
  const ranges = getConsumptionSummaryRanges(generatedAt, home.timezone, period);
  validateRangeOrThrow(ranges.current.from, ranges.current.to);
  validateRangeOrThrow(ranges.previous.from, ranges.previous.to);

  const granularityResolved = period === "month" ? "daily" : "hourly";
  const [currentChart, previousChart, deviceCount, breakdownRows] = await Promise.all([
    listSeriesForHome({
      homeId: home.id,
      granularity: granularityResolved,
      from: ranges.current.from,
      to: ranges.current.to,
    }),
    listSeriesForHome({
      homeId: home.id,
      granularity: granularityResolved,
      from: ranges.previous.from,
      to: ranges.previous.to,
    }),
    prisma.device.count({
      where: {
        homeId: home.id,
        userId: home.userId,
      },
    }),
    listBreakdownForHome({
      homeId: home.id,
      granularity: granularityResolved,
      from: ranges.current.from,
      to: ranges.current.to,
    }),
  ]);

  const totalEnergyWh = sumEnergy(currentChart);
  const previousTotalEnergyWh = sumEnergy(previousChart);
  const { trend, trendPercent } = buildTrend(totalEnergyWh, previousTotalEnergyWh);
  const breakdown = breakdownRows.map((item) => ({
    deviceId: item.deviceId,
    name: item.name,
    energyWh: item.energyWh,
    percentage: totalEnergyWh > 0 ? Math.round((item.energyWh / totalEnergyWh) * 100) : 0,
  }));

  return {
    home,
    generatedAt: generatedAt.toISOString(),
    timezone: home.timezone,
    period,
    range: {
      current: {
        from: ranges.current.from.toISOString(),
        to: ranges.current.to.toISOString(),
      },
      previous: {
        from: ranges.previous.from.toISOString(),
        to: ranges.previous.to.toISOString(),
      },
    },
    chart: {
      granularityResolved,
      series: currentChart,
    },
    summary: {
      totalEnergyWh,
      previousTotalEnergyWh,
      trend,
      trendPercent,
      averageEnergyWh: computeAverageEnergyWh({
        from: ranges.current.from,
        period,
        to: ranges.current.to,
        totalEnergyWh,
      }),
      averageUnit: period === "today" ? "hour" : "day",
    },
    breakdown: {
      deviceCount,
      items: breakdown,
    },
  };
}
