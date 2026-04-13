import type {
  AuthenticatedShellyRequest,
  RefreshShellyIntegrationResponse,
  ShellyDiscoveryResponse,
  ShellyImportPayload,
  ShellyImportResponse,
  ShellyIntegrationResponse,
  StartShellyOAuthResponse,
} from './shelly.types';

export function getShellyIntegration(
  authenticatedRequest: AuthenticatedShellyRequest,
  signal?: AbortSignal
) {
  return authenticatedRequest<ShellyIntegrationResponse>('/integrations/shelly', { signal });
}

export function startShellyOAuth(authenticatedRequest: AuthenticatedShellyRequest) {
  return authenticatedRequest<StartShellyOAuthResponse>('/integrations/shelly', {
    method: 'POST',
  });
}

export function refreshShellyIntegration(authenticatedRequest: AuthenticatedShellyRequest) {
  return authenticatedRequest<RefreshShellyIntegrationResponse>('/integrations/shelly/refresh', {
    method: 'POST',
  });
}

export function deleteShellyIntegration(authenticatedRequest: AuthenticatedShellyRequest) {
  return authenticatedRequest<null>('/integrations/shelly', {
    method: 'DELETE',
  });
}

export function discoverShellyDevices(authenticatedRequest: AuthenticatedShellyRequest) {
  return authenticatedRequest<ShellyDiscoveryResponse>('/integrations/shelly/devices/discover', {
    method: 'POST',
  });
}

export function importShellyDevices(
  authenticatedRequest: AuthenticatedShellyRequest,
  homeId: string,
  payload: ShellyImportPayload
) {
  return authenticatedRequest<ShellyImportResponse>(
    `/integrations/shelly/homes/${homeId}/devices/import`,
    {
      body: payload,
      method: 'POST',
    }
  );
}
