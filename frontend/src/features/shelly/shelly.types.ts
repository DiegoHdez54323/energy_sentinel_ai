export type AuthenticatedShellyRequest = <T>(
  path: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    signal?: AbortSignal;
  }
) => Promise<T>;

export type ShellyIntegration = {
  accessTokenExpiresAt: string | null;
  connected: boolean;
  isAccessTokenValid: boolean;
  lastSyncAt: string | null;
  needsRefresh: boolean;
  status: string;
  userApiUrl: string | null;
};

export type ShellyIntegrationResponse = {
  integration: ShellyIntegration;
};

export type StartShellyOAuthResponse = {
  authUrl: string;
};

export type RefreshShellyIntegrationResponse = {
  accessTokenExpiresAt: string;
  ok: boolean;
  status: string;
  userApiUrl: string;
};

export type ShellyDiscoveredDevice = {
  deviceCode: string | null;
  externalDeviceId: string;
  ipAddress: string | null;
  isOnline: boolean;
  macAddress: string | null;
  suggestedDisplayName: string | null;
  suggestedVendor: string;
};

export type ShellyKnownDevice = {
  dataSource: string;
  deviceId: string;
  displayName: string;
  externalDeviceId: string;
  homeId: string;
  status: string;
  vendor: string;
};

export type ShellyInvalidEntry = {
  key: string | null;
  reason: string;
};

export type ShellyDiscovery = {
  alreadyKnown: ShellyKnownDevice[];
  counts: {
    alreadyKnown: number;
    invalid: number;
    new: number;
    totalShelly: number;
  };
  discoveredAt: string;
  invalidEntries: ShellyInvalidEntry[];
  newDevices: ShellyDiscoveredDevice[];
};

export type ShellyDiscoveryResponse = {
  discovery: ShellyDiscovery;
};

export type ShellyImportDevicePayload = {
  displayName: string;
  externalDeviceId: string;
  vendor?: string;
};

export type ShellyImportPayload = {
  devices: ShellyImportDevicePayload[];
};

export type ShellyImportedDevice = {
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

export type ShellyImportResult = {
  created: ShellyImportedDevice[];
  errors: {
    externalDeviceId: string;
    reason: string;
  }[];
  homeId: string;
  skipped: {
    existingDeviceId?: string;
    externalDeviceId: string;
    reason: string;
  }[];
  summary: {
    created: number;
    errors: number;
    requested: number;
    skipped: number;
  };
};

export type ShellyImportResponse = {
  import: ShellyImportResult;
};
