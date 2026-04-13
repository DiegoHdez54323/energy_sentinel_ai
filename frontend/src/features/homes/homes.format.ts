import type { Home, HomeCardSummary } from './homes.types';

const TIMEZONE_LABELS: Record<string, string> = {
  'America/Cancun': 'Cancun',
  'America/Mazatlan': 'Mazatlan',
  'America/Mexico_City': 'Ciudad de México',
  'America/Tijuana': 'Tijuana',
  'Etc/UTC': 'UTC',
};

type DateParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

export function buildHomeCardSummary(options: {
  deviceCount: number;
  home: Home;
  todayEnergyWh: number;
}): HomeCardSummary {
  return {
    consumptionLabel: formatTodayEnergy(options.todayEnergyWh),
    deviceCountLabel: formatDeviceCount(options.deviceCount),
    hasAnomaly: false,
    home: options.home,
    id: options.home.id,
    locationLabel: formatTimezoneLabel(options.home.timezone),
    name: options.home.name,
  };
}

export function formatDeviceCount(count: number) {
  if (count === 1) {
    return '1 dispositivo';
  }

  return `${count} dispositivos`;
}

export function formatTodayEnergy(energyWh: number) {
  const kwh = energyWh / 1000;
  return `${kwh.toFixed(1)} kWh hoy`;
}

export function formatTimezoneLabel(timezone: string) {
  if (TIMEZONE_LABELS[timezone]) {
    return TIMEZONE_LABELS[timezone];
  }

  const [, city] = timezone.split('/');
  return (city ?? timezone).replaceAll('_', ' ');
}

export function getResolvedDeviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City';
  } catch {
    return 'America/Mexico_City';
  }
}

export function getTodayRangeForTimezone(timezone: string) {
  const safeTimezone = getSafeTimezone(timezone);
  const today = getZonedParts(new Date(), safeTimezone);
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const tomorrowParts = {
    day: tomorrow.getUTCDate(),
    month: tomorrow.getUTCMonth() + 1,
    year: tomorrow.getUTCFullYear(),
  };

  return {
    from: zonedLocalTimeToUtc(
      { day: today.day, hour: 0, minute: 0, month: today.month, second: 0, year: today.year },
      safeTimezone
    ).toISOString(),
    to: zonedLocalTimeToUtc(
      {
        day: tomorrowParts.day,
        hour: 0,
        minute: 0,
        month: tomorrowParts.month,
        second: 0,
        year: tomorrowParts.year,
      },
      safeTimezone
    ).toISOString(),
  };
}

function getSafeTimezone(timezone: string) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return timezone;
  } catch {
    return getResolvedDeviceTimezone();
  }
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
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );

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
