import type { DashboardDeviceStatus, DashboardSummaryPeriod } from './dashboard.types';

export function formatDashboardEnergy(energyWh: number) {
  return (energyWh / 1000).toFixed(1);
}

export function formatDashboardTrend(period: DashboardSummaryPeriod) {
  if (period.trendPercent == null) {
    return null;
  }

  if (period.trendPercent > 0) {
    return `+${period.trendPercent}%`;
  }

  return `${period.trendPercent}%`;
}

export function getDashboardStatusLabel(status: DashboardDeviceStatus) {
  switch (status) {
    case 'anomaly':
      return 'Anomalía';
    case 'warning':
      return 'Atención';
    case 'normal':
      return 'Normal';
  }
}
