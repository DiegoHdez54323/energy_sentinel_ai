import type {
  AuthenticatedHomesRequest,
  CreateHomePayload,
  DevicesResponse,
  HomeConsumptionResponse,
  HomeResponse,
  HomesResponse,
} from './homes.types';

export function listHomes(
  authenticatedRequest: AuthenticatedHomesRequest,
  signal?: AbortSignal
) {
  return authenticatedRequest<HomesResponse>('/homes', { signal });
}

export function createHome(
  authenticatedRequest: AuthenticatedHomesRequest,
  payload: CreateHomePayload,
  signal?: AbortSignal
) {
  return authenticatedRequest<HomeResponse>('/homes', {
    body: payload,
    method: 'POST',
    signal,
  });
}

export function listHomeDevices(
  authenticatedRequest: AuthenticatedHomesRequest,
  homeId: string,
  signal?: AbortSignal
) {
  return authenticatedRequest<DevicesResponse>(`/homes/${homeId}/devices`, { signal });
}

export function getHomeConsumption(
  authenticatedRequest: AuthenticatedHomesRequest,
  options: {
    from: string;
    homeId: string;
    signal?: AbortSignal;
    to: string;
  }
) {
  const query = [
    `from=${encodeURIComponent(options.from)}`,
    `to=${encodeURIComponent(options.to)}`,
    'granularity=hourly',
  ].join('&');

  return authenticatedRequest<HomeConsumptionResponse>(
    `/homes/${options.homeId}/consumption?${query}`,
    { signal: options.signal }
  );
}
