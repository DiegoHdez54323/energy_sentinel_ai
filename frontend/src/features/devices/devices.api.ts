import type {
  AuthenticatedDevicesRequest,
  DeviceAnomaliesResponse,
  DeviceConsumptionResponse,
  DeviceStateResponse,
} from './devices.types';

export function getDeviceState(
  authenticatedRequest: AuthenticatedDevicesRequest,
  deviceId: string,
  signal?: AbortSignal
) {
  return authenticatedRequest<DeviceStateResponse>(`/devices/${deviceId}/state`, { signal });
}

export function getDeviceConsumption(
  authenticatedRequest: AuthenticatedDevicesRequest,
  options: {
    deviceId: string;
    from: string;
    signal?: AbortSignal;
    to: string;
  }
) {
  const query = [
    `from=${encodeURIComponent(options.from)}`,
    `to=${encodeURIComponent(options.to)}`,
    'granularity=auto',
  ].join('&');

  return authenticatedRequest<DeviceConsumptionResponse>(
    `/devices/${options.deviceId}/consumption?${query}`,
    { signal: options.signal }
  );
}

export function getDeviceAnomalies(
  authenticatedRequest: AuthenticatedDevicesRequest,
  options: {
    deviceId: string;
    limit?: number;
    signal?: AbortSignal;
  }
) {
  const limit = options.limit ?? 20;
  return authenticatedRequest<DeviceAnomaliesResponse>(
    `/devices/${options.deviceId}/anomalies?status=all&limit=${limit}`,
    { signal: options.signal }
  );
}
