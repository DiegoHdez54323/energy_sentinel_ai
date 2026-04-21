import type { ConsumptionSeriesPoint, Home } from '@/features/homes/homes.types';

export type ConsumptionPeriodKey = 'month' | 'today' | 'week';
export type ConsumptionLoadStatus = 'error' | 'idle' | 'loading' | 'refreshing' | 'success';
export type ConsumptionTrend = 'down' | 'flat' | 'up';

export type ConsumptionBreakdownItem = {
  deviceId: string;
  energyWh: number;
  name: string;
  percentage: number;
};

export type HomeConsumptionSummaryResponse = {
  breakdown: {
    deviceCount: number;
    items: ConsumptionBreakdownItem[];
  };
  chart: {
    granularityResolved: 'daily' | 'hourly';
    series: ConsumptionSeriesPoint[];
  };
  generatedAt: string;
  home: Home;
  period: ConsumptionPeriodKey;
  range: {
    current: {
      from: string;
      to: string;
    };
    previous: {
      from: string;
      to: string;
    };
  };
  summary: {
    averageEnergyWh: number;
    averageUnit: 'day' | 'hour';
    previousTotalEnergyWh: number;
    totalEnergyWh: number;
    trend: ConsumptionTrend;
    trendPercent: number | null;
  };
  timezone: string;
};
