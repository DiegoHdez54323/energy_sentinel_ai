import { Prisma } from "../../generated/prisma/client.js";
import type { OwnedHomeContext } from "../../common/ownership/home-ownership.js";
import { prisma } from "../../lib/prisma.js";

type DashboardTrend = "up" | "down" | "flat";
type DashboardDeviceStatus = "normal" | "warning" | "anomaly";

type DateParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

type EnergyRow = {
  energyWh: Prisma.Decimal | number | string | null;
};

type LatestReadingRow = {
  aenergyDelta: Prisma.Decimal | number | string | null;
  apower: Prisma.Decimal | number | string | null;
  current: Prisma.Decimal | number | string | null;
  deviceId: string;
  output: boolean | null;
  ts: Date;
  voltage: Prisma.Decimal | number | string | null;
};

type OpenAnomalyRow = {
  details: Prisma.JsonValue | null;
  detectedAt: Date;
  deviceId: string;
  expectedValue: Prisma.Decimal | number | string | null;
  id: string;
  observedValue: Prisma.Decimal | number | string | null;
  readingsCount: number;
  score: Prisma.Decimal | number | string | null;
  severity: number;
  status: string;
  windowEnd: Date;
  windowStart: Date;
};

function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value == null) {
    return null;
  }

  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  return Number(value);
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

function getDashboardRanges(now: Date, timezone: string) {
  const nowParts = getZonedParts(now, timezone);
  const todayStartParts = {
    ...nowParts,
    hour: 0,
    minute: 0,
    second: 0,
  };
  const weekStartParts = getMondayStartParts(nowParts, timezone);

  return {
    today: {
      from: zonedLocalTimeToUtc(todayStartParts, timezone),
      to: now,
    },
    previousToday: {
      from: zonedLocalTimeToUtc(addLocalDays(todayStartParts, -7), timezone),
      to: zonedLocalTimeToUtc(addLocalDays(nowParts, -7), timezone),
    },
    week: {
      from: zonedLocalTimeToUtc(weekStartParts, timezone),
      to: now,
    },
    previousWeek: {
      from: zonedLocalTimeToUtc(addLocalDays(weekStartParts, -7), timezone),
      to: zonedLocalTimeToUtc(addLocalDays(nowParts, -7), timezone),
    },
  };
}

function buildTrend(current: number, previous: number) {
  const trend: DashboardTrend = current > previous ? "up" : current < previous ? "down" : "flat";
  const trendPercent = previous > 0
    ? Math.round(((current - previous) / previous) * 100)
    : null;

  return { trend, trendPercent };
}

async function sumHomeEnergyWh(homeId: string, from: Date, to: Date) {
  const rows = await prisma.$queryRaw<EnergyRow[]>`
    SELECT COALESCE(SUM(dr."aenergy_delta"), 0)::double precision AS "energyWh"
    FROM "device_readings" dr
    JOIN "devices" d ON d."id" = dr."device_id"
    WHERE d."home_id" = ${homeId}
      AND dr."ts" >= ${from}
      AND dr."ts" < ${to}
  `;

  return decimalToNumber(rows.at(0)?.energyWh) ?? 0;
}

async function listLatestReadings(deviceIds: string[]) {
  if (deviceIds.length === 0) {
    return new Map<string, LatestReadingRow>();
  }

  const rows = await prisma.$queryRaw<LatestReadingRow[]>`
    SELECT DISTINCT ON (dr."device_id")
      dr."device_id" AS "deviceId",
      dr."ts" AS "ts",
      dr."apower"::double precision AS "apower",
      dr."aenergy_delta"::double precision AS "aenergyDelta",
      dr."voltage"::double precision AS "voltage",
      dr."current"::double precision AS "current",
      dr."output" AS "output"
    FROM "device_readings" dr
    WHERE dr."device_id" IN (${Prisma.join(deviceIds)})
    ORDER BY dr."device_id", dr."ts" DESC, dr."id" DESC
  `;

  return new Map(rows.map((row) => [row.deviceId, row]));
}

async function listOpenAnomalies(deviceIds: string[]) {
  if (deviceIds.length === 0) {
    return new Map<string, OpenAnomalyRow>();
  }

  const rows = await prisma.$queryRaw<OpenAnomalyRow[]>`
    SELECT DISTINCT ON (ae."device_id")
      ae."id" AS "id",
      ae."device_id" AS "deviceId",
      ae."status" AS "status",
      ae."detected_at" AS "detectedAt",
      ae."window_start" AS "windowStart",
      ae."window_end" AS "windowEnd",
      ae."readings_count"::int AS "readingsCount",
      ae."severity"::int AS "severity",
      ae."score"::double precision AS "score",
      ae."expected_value"::double precision AS "expectedValue",
      ae."observed_value"::double precision AS "observedValue",
      ae."details" AS "details"
    FROM "anomaly_events" ae
    WHERE ae."device_id" IN (${Prisma.join(deviceIds)})
      AND ae."status" = 'open'
    ORDER BY ae."device_id", ae."detected_at" DESC
  `;

  return new Map(rows.map((row) => [row.deviceId, row]));
}

function normalizeLatestReading(reading: LatestReadingRow | undefined) {
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

function normalizeOpenAnomaly(anomaly: OpenAnomalyRow | undefined) {
  if (!anomaly) {
    return null;
  }

  return {
    id: anomaly.id,
    status: anomaly.status,
    detectedAt: anomaly.detectedAt.toISOString(),
    windowStart: anomaly.windowStart.toISOString(),
    windowEnd: anomaly.windowEnd.toISOString(),
    readingsCount: anomaly.readingsCount,
    severity: anomaly.severity,
    score: decimalToNumber(anomaly.score),
    expectedValue: decimalToNumber(anomaly.expectedValue),
    observedValue: decimalToNumber(anomaly.observedValue),
    details: anomaly.details,
  };
}

function resolveDeviceStatus(options: {
  deviceStatus: string;
  hasAnomaly: boolean;
  hasReading: boolean;
}): DashboardDeviceStatus {
  if (options.hasAnomaly) {
    return "anomaly";
  }

  if (options.deviceStatus !== "active" || !options.hasReading) {
    return "warning";
  }

  return "normal";
}

export async function getHomeDashboard(home: OwnedHomeContext) {
  const generatedAt = new Date();
  const ranges = getDashboardRanges(generatedAt, home.timezone);
  const [todayEnergyWh, previousTodayEnergyWh, weekEnergyWh, previousWeekEnergyWh, devices] = await Promise.all([
    sumHomeEnergyWh(home.id, ranges.today.from, ranges.today.to),
    sumHomeEnergyWh(home.id, ranges.previousToday.from, ranges.previousToday.to),
    sumHomeEnergyWh(home.id, ranges.week.from, ranges.week.to),
    sumHomeEnergyWh(home.id, ranges.previousWeek.from, ranges.previousWeek.to),
    prisma.device.findMany({
      where: { homeId: home.id, userId: home.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        homeId: true,
        userId: true,
        vendor: true,
        deviceCode: true,
        displayName: true,
        ipAddress: true,
        macAddress: true,
        externalDeviceId: true,
        status: true,
        lastSeenAt: true,
        dataSource: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const deviceIds = devices.map((device) => device.id);
  const [latestReadings, openAnomalies] = await Promise.all([
    listLatestReadings(deviceIds),
    listOpenAnomalies(deviceIds),
  ]);

  const dashboardDevices = devices.map((device) => {
    const latestReading = normalizeLatestReading(latestReadings.get(device.id));
    const activeAnomaly = normalizeOpenAnomaly(openAnomalies.get(device.id));
    const currentWatts = Math.max(0, Math.round(latestReading?.apower ?? 0));
    const isOn = latestReading?.output ?? currentWatts > 0;

    return {
      id: device.id,
      name: device.displayName,
      room: null,
      currentWatts,
      isOn,
      status: resolveDeviceStatus({
        deviceStatus: device.status,
        hasAnomaly: Boolean(activeAnomaly),
        hasReading: Boolean(latestReading),
      }),
      device,
      latestReading,
      activeAnomaly,
    };
  });

  const activeAnomalyDevice = dashboardDevices.find((device) => device.activeAnomaly);
  const todayTrend = buildTrend(todayEnergyWh, previousTodayEnergyWh);
  const weekTrend = buildTrend(weekEnergyWh, previousWeekEnergyWh);

  return {
    home,
    generatedAt: generatedAt.toISOString(),
    timezone: home.timezone,
    summary: {
      today: {
        energyWh: todayEnergyWh,
        previousEnergyWh: previousTodayEnergyWh,
        ...todayTrend,
      },
      week: {
        energyWh: weekEnergyWh,
        previousEnergyWh: previousWeekEnergyWh,
        ...weekTrend,
      },
      activeAnomaliesCount: dashboardDevices.filter((device) => device.activeAnomaly).length,
    },
    alert: activeAnomalyDevice?.activeAnomaly
      ? {
        deviceId: activeAnomalyDevice.id,
        deviceName: activeAnomalyDevice.name,
        message: `${activeAnomalyDevice.name} muestra consumo inusual`,
        detectedAt: activeAnomalyDevice.activeAnomaly.detectedAt,
        severity: activeAnomalyDevice.activeAnomaly.severity,
      }
      : null,
    devices: dashboardDevices,
  };
}
