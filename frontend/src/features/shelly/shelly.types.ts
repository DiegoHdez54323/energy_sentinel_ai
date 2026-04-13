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
