export type AuthenticatedHomesRequest = <T>(
  path: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    signal?: AbortSignal;
  }
) => Promise<T>;

export type Home = {
  createdAt: string;
  id: string;
  name: string;
  timezone: string;
  updatedAt: string;
  userId: string;
};

export type HomesResponse = {
  homes: Home[];
};

export type HomeResponse = {
  home: Home;
};

export type CreateHomePayload = {
  name: string;
  timezone: string;
};

export type Device = {
  createdAt: string;
  dataSource: string;
  deviceCode: string | null;
  displayName: string;
  externalDeviceId: string | null;
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

export type DevicesResponse = {
  devices: Device[];
};

export type ConsumptionSeriesPoint = {
  avgPowerW: number | null;
  energyWh: number;
  maxPowerW: number | null;
  minPowerW: number | null;
  samplesCount: number;
  ts: string;
};

export type HomeConsumptionResponse = {
  granularityRequested: string;
  granularityResolved: string;
  home: Home;
  range: {
    from: string;
    to: string;
  };
  series: ConsumptionSeriesPoint[];
  timezone: string;
};

export type HomeCardSummary = {
  consumptionLabel: string;
  deviceCountLabel: string;
  hasAnomaly: boolean;
  home: Home;
  id: string;
  locationLabel: string;
  name: string;
};
