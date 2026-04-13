import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { getHomeConsumption, listHomeDevices, listHomes } from './homes.api';
import { buildHomeCardSummary, getTodayRangeForTimezone } from './homes.format';
import type { AuthenticatedHomesRequest, Home, HomeCardSummary } from './homes.types';

type HomeSummariesStatus = 'error' | 'loading' | 'refreshing' | 'success';

type HomeSummariesState = {
  error: unknown;
  homes: HomeCardSummary[];
  status: HomeSummariesStatus;
};

export function useHomeSummaries() {
  const { authenticatedRequest, status: authStatus } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<HomeSummariesState>({
    error: null,
    homes: [],
    status: 'loading',
  });

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      return;
    }

    const controller = new AbortController();

    setState((current) => ({
      error: null,
      homes: current.homes,
      status: current.homes.length > 0 ? 'refreshing' : 'loading',
    }));

    async function load() {
      try {
        const homes = await loadHomeSummaries(authenticatedRequest, controller.signal);

        if (!controller.signal.aborted) {
          setState({ error: null, homes, status: 'success' });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState((current) => ({ error, homes: current.homes, status: 'error' }));
        }
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [authStatus, authenticatedRequest, reloadKey]);

  return {
    ...state,
    reload: () => {
      setReloadKey((current) => current + 1);
    },
  };
}

async function loadHomeSummaries(
  authenticatedRequest: AuthenticatedHomesRequest,
  signal: AbortSignal
) {
  const { homes } = await listHomes(authenticatedRequest, signal);
  return Promise.all(homes.map((home) => loadHomeSummary(authenticatedRequest, home, signal)));
}

async function loadHomeSummary(
  authenticatedRequest: AuthenticatedHomesRequest,
  home: Home,
  signal: AbortSignal
) {
  const range = getTodayRangeForTimezone(home.timezone);
  const [devicesResult, consumptionResult] = await Promise.allSettled([
    listHomeDevices(authenticatedRequest, home.id, signal),
    getHomeConsumption(authenticatedRequest, {
      from: range.from,
      homeId: home.id,
      signal,
      to: range.to,
    }),
  ]);

  const deviceCount = devicesResult.status === 'fulfilled' ? devicesResult.value.devices.length : 0;
  const todayEnergyWh =
    consumptionResult.status === 'fulfilled'
      ? consumptionResult.value.series.reduce((total, point) => total + point.energyWh, 0)
      : 0;

  return buildHomeCardSummary({ deviceCount, home, todayEnergyWh });
}
