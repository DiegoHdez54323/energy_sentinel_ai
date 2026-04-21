import type {
  DeviceAnomaly,
  DeviceChartPeriod,
  DeviceConsumptionPoint,
  DeviceDetailStatus,
  DeviceListItem,
  DeviceListSummary,
  DeviceModelState,
  DeviceReadingSummary,
  DeviceSummaryPeriod,
} from './devices.types';

type DateParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

export function formatWatts(value: number | null | undefined) {
  return `${Math.max(0, Math.round(value ?? 0))}`;
}

export function buildDeviceListSummary(devices: DeviceListItem[]): DeviceListSummary {
  return {
    activeCount: devices.filter((device) => device.isOn).length,
    alertCount: devices.filter((device) => device.hasAlert).length,
    totalCount: devices.length,
  };
}

export function filterDeviceListItems(devices: DeviceListItem[], query: string) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return devices;
  }

  return devices.filter((device) => normalizeSearchValue(device.name).includes(normalizedQuery));
}

export function formatEnergyKwh(energyWh: number) {
  return (energyWh / 1000).toFixed(1);
}

export function formatTrendValue(period: DeviceSummaryPeriod) {
  if (period.trendPercent == null) {
    return null;
  }

  return period.trendPercent > 0 ? `+${period.trendPercent}%` : `${period.trendPercent}%`;
}

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) {
    return 'Sin lecturas';
  }

  const elapsedMs = Date.now() - new Date(value).getTime();
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60_000));

  if (elapsedMinutes < 1) {
    return 'Actualizado ahora';
  }

  if (elapsedMinutes < 60) {
    return `Actualizado hace ${elapsedMinutes} min`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `Actualizado hace ${elapsedHours} h`;
  }

  const elapsedDays = Math.round(elapsedHours / 24);
  return `Actualizado hace ${elapsedDays} d`;
}

export function formatIncidentRange(incident: DeviceAnomaly) {
  const start = new Date(incident.windowStart);
  const end = new Date(incident.windowEnd);
  const dateFormatter = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
  });
  const timeFormatter = new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${dateFormatter.format(start)}, ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
}

export function getIncidentTitle(incident: DeviceAnomaly) {
  return incident.status === 'open' ? 'Pico de consumo inusual' : 'Consumo elevado prolongado';
}

export function getDeviceDetailStatus(options: {
  activeAnomaly: DeviceAnomaly | null;
  deviceStatus: string;
  latestReading: DeviceReadingSummary | null;
  model: DeviceModelState;
}): DeviceDetailStatus {
  if (options.activeAnomaly) {
    return 'anomaly';
  }

  if (!options.latestReading || !options.model.ready || options.deviceStatus !== 'active') {
    return 'warning';
  }

  return 'normal';
}

export function getDevicePowerState(latestReading: DeviceReadingSummary | null) {
  if (!latestReading) {
    return {
      isOn: false,
      label: 'Sin lecturas',
    };
  }

  const isOn = latestReading.output ?? (latestReading.apower ?? 0) > 0;

  return {
    isOn,
    label: isOn ? 'Encendido' : 'Apagado',
  };
}

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function getChartRange(period: DeviceChartPeriod) {
  const to = new Date();
  const spanMs = period === '24h'
    ? 24 * 60 * 60 * 1000
    : period === '7d'
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;

  return {
    from: new Date(to.getTime() - spanMs).toISOString(),
    to: to.toISOString(),
  };
}

export function getSummaryRanges(timezone: string) {
  const now = new Date();
  const nowParts = getZonedParts(now, timezone);
  const todayStartParts = {
    ...nowParts,
    hour: 0,
    minute: 0,
    second: 0,
  };
  const weekStartParts = getMondayStartParts(nowParts, timezone);

  return {
    previousToday: {
      from: zonedLocalTimeToUtc(addLocalDays(todayStartParts, -7), timezone).toISOString(),
      to: zonedLocalTimeToUtc(addLocalDays(nowParts, -7), timezone).toISOString(),
    },
    previousWeek: {
      from: zonedLocalTimeToUtc(addLocalDays(weekStartParts, -7), timezone).toISOString(),
      to: zonedLocalTimeToUtc(addLocalDays(nowParts, -7), timezone).toISOString(),
    },
    today: {
      from: zonedLocalTimeToUtc(todayStartParts, timezone).toISOString(),
      to: now.toISOString(),
    },
    week: {
      from: zonedLocalTimeToUtc(weekStartParts, timezone).toISOString(),
      to: now.toISOString(),
    },
  };
}

export function buildSummaryPeriod(currentSeries: DeviceConsumptionPoint[], previousSeries: DeviceConsumptionPoint[]) {
  const energyWh = sumEnergy(currentSeries);
  const previousEnergyWh = sumEnergy(previousSeries);
  const trend = energyWh > previousEnergyWh ? 'up' : energyWh < previousEnergyWh ? 'down' : 'flat';
  const trendPercent = previousEnergyWh > 0
    ? Math.round(((energyWh - previousEnergyWh) / previousEnergyWh) * 100)
    : null;

  return {
    energyWh,
    previousEnergyWh,
    trend,
    trendPercent,
  } satisfies DeviceSummaryPeriod;
}

function sumEnergy(series: DeviceConsumptionPoint[]) {
  return series.reduce((total, point) => total + point.energyWh, 0);
}

function getZonedParts(date: Date, timezone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: timezone,
    year: 'numeric',
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
    parts.second
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
      zonedParts.second
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
  const localNoonUtc = zonedLocalTimeToUtc({ ...parts, hour: 12, minute: 0, second: 0 }, timezone);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(localNoonUtc);
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
  const daysSinceMonday = weekdayIndex === 0 ? 6 : Math.max(weekdayIndex - 1, 0);

  return {
    ...addLocalDays(parts, -daysSinceMonday),
    hour: 0,
    minute: 0,
    second: 0,
  };
}
