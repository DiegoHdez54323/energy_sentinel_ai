export type AuthenticatedDashboardRequest = <T>(
  path: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    signal?: AbortSignal;
  }
) => Promise<T>;

export type DashboardTrend = 'down' | 'flat' | 'up';
export type DashboardDeviceStatus = 'anomaly' | 'normal' | 'warning';

export type DashboardHome = {
  createdAt: string;
  id: string;
  name: string;
  timezone: string;
  updatedAt: string;
  userId: string;
};

export type DashboardReading = {
  aenergyDelta: number | null;
  apower: number | null;
  current: number | null;
  output: boolean | null;
  ts: string;
  voltage: number | null;
};

export type DashboardAnomaly = {
  detectedAt: string;
  details: unknown;
  expectedValue: number | null;
  id: string;
  observedValue: number | null;
  readingsCount: number;
  score: number | null;
  severity: number;
  status: string;
  windowEnd: string;
  windowStart: string;
};

export type DashboardSummaryPeriod = {
  energyWh: number;
  previousEnergyWh: number;
  trend: DashboardTrend;
  trendPercent: number | null;
};

export type DashboardDevice = {
  activeAnomaly: DashboardAnomaly | null;
  currentWatts: number;
  device: {
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
  id: string;
  isOn: boolean;
  latestReading: DashboardReading | null;
  name: string;
  room: null;
  status: DashboardDeviceStatus;
};

export type HomeDashboardResponse = {
  alert: {
    detectedAt: string;
    deviceId: string;
    deviceName: string;
    message: string;
    severity: number;
  } | null;
  devices: DashboardDevice[];
  generatedAt: string;
  home: DashboardHome;
  summary: {
    activeAnomaliesCount: number;
    today: DashboardSummaryPeriod;
    week: DashboardSummaryPeriod;
  };
  timezone: string;
};
