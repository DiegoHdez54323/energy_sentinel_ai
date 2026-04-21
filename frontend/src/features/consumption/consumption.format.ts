import type {
  ConsumptionPeriodKey,
  ConsumptionTrend,
  HomeConsumptionSummaryResponse,
} from './consumption.types';

type PeriodOption = {
  key: ConsumptionPeriodKey;
  tabLabel: string;
};

const PERIOD_OPTIONS: PeriodOption[] = [
  { key: 'today', tabLabel: 'Hoy' },
  { key: 'week', tabLabel: 'Semana' },
  { key: 'month', tabLabel: 'Mes' },
];

export function getConsumptionPeriodOptions() {
  return PERIOD_OPTIONS;
}

export function formatAverageLabel(unit: HomeConsumptionSummaryResponse['summary']['averageUnit']) {
  return unit === 'hour' ? 'Promedio/hora' : 'Promedio/día';
}

export function formatChartTitle(period: ConsumptionPeriodKey) {
  if (period === 'today') {
    return 'Consumo hoy';
  }

  if (period === 'week') {
    return 'Consumo semanal';
  }

  return 'Consumo mensual';
}

export function formatTotalLabel(period: ConsumptionPeriodKey) {
  if (period === 'today') {
    return 'Hoy';
  }

  if (period === 'week') {
    return 'Esta semana';
  }

  return 'Este mes';
}

export function formatConsumptionEnergyKwh(energyWh: number) {
  return (energyWh / 1000).toFixed(1);
}

export function formatConsumptionPercentage(percentage: number) {
  return `${percentage}% del total`;
}

export function formatConsumptionTrend(options: {
  trend: ConsumptionTrend;
  trendPercent: number | null;
}) {
  if (options.trendPercent == null) {
    return null;
  }

  return options.trendPercent > 0 ? `+${options.trendPercent}%` : `${options.trendPercent}%`;
}

export function formatConsumptionTickLabel(options: {
  period: ConsumptionPeriodKey;
  timestamp: string;
}) {
  const date = new Date(options.timestamp);

  if (options.period === 'today') {
    return new Intl.DateTimeFormat('es-MX', {
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
    }).format(date);
  }

  if (options.period === 'week') {
    return new Intl.DateTimeFormat('es-MX', {
      weekday: 'short',
    })
      .format(date)
      .replace('.', '')
      .replace(/^./, (value) => value.toUpperCase());
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function formatConsumptionPointerTime(options: {
  period: ConsumptionPeriodKey;
  timestamp: string;
}) {
  const date = new Date(options.timestamp);

  if (options.period === 'today') {
    return new Intl.DateTimeFormat('es-MX', {
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
    }).format(date);
  }

  if (options.period === 'week') {
    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: 'short',
    }).format(date);
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
