import type { OwnedDeviceContext } from "../../../common/ownership/device-ownership.js";

export type ShellyJwtPayload = {
  user_api_url: string;
  exp?: number;
};

export type ShellyAccessTokenContext = {
  accessToken: string;
  accessTokenExpiresAt: Date;
  userApiUrl: string;
};

export type ShellyIntegrationStatus = {
  connected: boolean;
  status: string;
  userApiUrl: string | null;
  accessTokenExpiresAt: Date | null;
  isAccessTokenValid: boolean;
  needsRefresh: boolean;
  lastSyncAt: Date | null;
};

export type ShellyDiscoveredDevice = {
  externalDeviceId: string;
  deviceCode: string | null;
  macAddress: string | null;
  ipAddress: string | null;
  isOnline: boolean;
  suggestedVendor: string;
  suggestedDisplayName: string | null;
};

export type ShellyDiscoveryInvalidEntry = {
  key: string | null;
  reason: string;
};

export type ShellyDiscoveryKnownDevice = {
  deviceId: string;
  homeId: string;
  externalDeviceId: string;
  vendor: string;
  displayName: string;
  status: string;
  dataSource: string;
};

export type ShellyDiscoveryResult = {
  discoveredAt: Date;
  counts: {
    totalShelly: number;
    new: number;
    alreadyKnown: number;
    invalid: number;
  };
  newDevices: ShellyDiscoveredDevice[];
  alreadyKnown: ShellyDiscoveryKnownDevice[];
  invalidEntries: ShellyDiscoveryInvalidEntry[];
};

export type ShellyImportSkippedReason =
  | "DUPLICATED_IN_REQUEST"
  | "NOT_FOUND_IN_SHELLY"
  | "ALREADY_IMPORTED";

export type ShellyImportErrorReason = "INTERNAL_ERROR";

export type ShellyImportResult = {
  homeId: string;
  summary: {
    requested: number;
    created: number;
    skipped: number;
    errors: number;
  };
  created: OwnedDeviceContext[];
  skipped: Array<{
    externalDeviceId: string;
    reason: ShellyImportSkippedReason;
    existingDeviceId?: string;
  }>;
  errors: Array<{
    externalDeviceId: string;
    reason: ShellyImportErrorReason;
  }>;
};

export type ShellyPollingStats = {
  integrationsProcessed: number;
  integrationsFailed: number;
  readingsInserted: number;
  readingsDuplicated: number;
  readingsSkipped: number;
};

export type ShellyRawDeviceEntry = {
  keyHint: string | null;
  raw: Record<string, unknown>;
};

export type ShellySwitch0Reading = {
  ts: Date;
  apower: number | null;
  voltage: number | null;
  current: number | null;
  freq: number | null;
  output: boolean | null;
  aenergyTotal: number | null;
  aenergyMinuteTs: number | null;
  aenergyByMinute: unknown[] | null;
  retAenergyTotal: number | null;
  retAenergyMinuteTs: number | null;
  retAenergyByMinute: unknown[] | null;
  temperatureTc: number | null;
  temperatureTf: number | null;
  source: string;
};
