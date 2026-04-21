export type AuthenticatedDevicesRequest = <T>(
  path: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    signal?: AbortSignal;
  }
) => Promise<T>;

export type Device = {
  createdAt: string;
  dataSource: string;
  deviceCode: string | null;
  displayName: string;
  externalDeviceId: string;
  homeId: string;
  id: string;
  ipAddress: string | null;
  lastSeenAt: string | null;
  macAddress: string | null;
  status: string;
  updatedAt: string;
  userId: string;
  vendor: string;
};

export type DeviceReadingSummary = {
  aenergyDelta: number | null;
  apower: number | null;
  current: number | null;
  output: boolean | null;
  ts: string;
  voltage: number | null;
};

export type DeviceAnomaly = {
  detectedAt: string;
  details: unknown;
  expectedValue: number | null;
  id: string;
  observedValue: number | null;
  readingsCount: number;
  score: number | null;
  severity: number;
  status: 'closed' | 'open' | string;
  windowEnd: string;
  windowStart: string;
};

export type DeviceModelState = {
  ready: boolean;
  status: string;
  trainedAt: string | null;
  trainedTo: string | null;
};

export type DeviceStateResponse = {
  activeAnomaly: DeviceAnomaly | null;
  device: Device;
  latestReading: DeviceReadingSummary | null;
  model: DeviceModelState;
};

export type DeviceConsumptionPoint = {
  avgPowerW: number | null;
  energyWh: number;
  maxPowerW: number | null;
  minPowerW: number | null;
  samplesCount: number;
  ts: string;
};

export type DeviceConsumptionResponse = {
  device: Device;
  granularityRequested: string;
  granularityResolved: 'daily' | 'hourly' | 'raw' | string;
  range: {
    from: string;
    to: string;
  };
  series: DeviceConsumptionPoint[];
  timezone: string;
};

export type DeviceAnomaliesResponse = {
  anomalies: DeviceAnomaly[];
  device: Device;
  filters: {
    from: string | null;
    limit: number;
    status: string;
    to: string | null;
  };
};

export type DeviceChartPeriod = '24h' | '30d' | '7d';

export type DeviceDetailStatus = 'anomaly' | 'normal' | 'warning';

export type DeviceListItem = {
  currentWatts: number;
  hasAlert: boolean;
  id: string;
  isOn: boolean;
  name: string;
  status: DeviceDetailStatus;
  vendor: string;
};

export type DeviceListSummary = {
  activeCount: number;
  alertCount: number;
  totalCount: number;
};

export type DeviceSummaryPeriod = {
  energyWh: number;
  previousEnergyWh: number;
  trend: 'down' | 'flat' | 'up';
  trendPercent: number | null;
};

export type DeviceDetailData = {
  anomalies: DeviceAnomaly[];
  chart: DeviceConsumptionResponse;
  state: DeviceStateResponse;
  summary: {
    today: DeviceSummaryPeriod;
    week: DeviceSummaryPeriod;
  };
};
