import { useEffect, useState } from 'react';

import { listHomeDevices } from '@/features/homes/homes.api';
import type { AuthenticatedHomesRequest, Device as HomeDevice } from '@/features/homes/homes.types';
import { useAuth } from '@/features/auth/auth-provider';
import { getDeviceState } from './devices.api';
import {
  buildDeviceListSummary,
  filterDeviceListItems,
  getDeviceDetailStatus,
  getDevicePowerState,
} from './devices.format';
import type {
  DeviceListItem,
  DeviceStateResponse,
} from './devices.types';

type DevicesScreenStatus = 'error' | 'idle' | 'loading' | 'refreshing' | 'success';

type DevicesScreenState = {
  devices: DeviceListItem[];
  error: unknown;
  homeId: string | null;
  status: DevicesScreenStatus;
};

export function useDevicesScreen(homeId: string | null | undefined) {
  const { authenticatedRequest, status: authStatus } = useAuth();
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<DevicesScreenState>({
    devices: [],
    error: null,
    homeId: null,
    status: 'idle',
  });

  useEffect(() => {
    setQuery('');
  }, [homeId]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !homeId) {
      setState({ devices: [], error: null, homeId: null, status: 'idle' });
      return;
    }

    const activeHomeId = homeId;
    const controller = new AbortController();

    setState((current) => ({
      devices: current.homeId === activeHomeId ? current.devices : [],
      error: null,
      homeId: current.homeId === activeHomeId ? current.homeId : activeHomeId,
      status: current.homeId === activeHomeId && current.devices.length > 0 ? 'refreshing' : 'loading',
    }));

    async function load() {
      try {
        const devices = await loadDeviceListItems(
          authenticatedRequest,
          activeHomeId,
          controller.signal
        );

        if (!controller.signal.aborted) {
          setState({ devices, error: null, homeId: activeHomeId, status: 'success' });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState((current) => ({
            devices: current.devices,
            error,
            homeId: current.homeId,
            status: 'error',
          }));
        }
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [authStatus, authenticatedRequest, homeId, reloadKey]);

  const filteredDevices = filterDeviceListItems(state.devices, query);
  const summary = buildDeviceListSummary(state.devices);

  return {
    ...state,
    filteredDevices,
    query,
    reload: () => {
      setReloadKey((current) => current + 1);
    },
    setQuery,
    summary,
  };
}

async function loadDeviceListItems(
  authenticatedRequest: AuthenticatedHomesRequest,
  homeId: string,
  signal: AbortSignal
) {
  const { devices } = await listHomeDevices(authenticatedRequest, homeId, signal);
  const stateResults = await Promise.allSettled(
    devices.map((device) => getDeviceState(authenticatedRequest, device.id, signal))
  );

  return devices.map((device, index) => {
    const stateResult = stateResults[index];
    return buildDeviceListItem(
      device,
      stateResult?.status === 'fulfilled' ? stateResult.value : null
    );
  });
}

function buildDeviceListItem(device: HomeDevice, deviceState: DeviceStateResponse | null): DeviceListItem {
  if (!deviceState) {
    return {
      currentWatts: 0,
      hasAlert: false,
      id: device.id,
      isOn: false,
      name: device.displayName,
      status: 'warning',
      vendor: device.vendor,
    };
  }

  const status = getDeviceDetailStatus({
    activeAnomaly: deviceState.activeAnomaly,
    deviceStatus: deviceState.device.status,
    latestReading: deviceState.latestReading,
    model: deviceState.model,
  });
  const powerState = getDevicePowerState(deviceState.latestReading);

  return {
    currentWatts: Math.max(0, Math.round(deviceState.latestReading?.apower ?? 0)),
    hasAlert: status === 'anomaly',
    id: deviceState.device.id,
    isOn: powerState.isOn,
    name: deviceState.device.displayName,
    status,
    vendor: deviceState.device.vendor,
  };
}
