import type {
  AuthenticatedShellyRequest,
  RefreshShellyIntegrationResponse,
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
