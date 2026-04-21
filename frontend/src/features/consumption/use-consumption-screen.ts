import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { getHomeConsumptionSummary } from './consumption.api';
import type {
  ConsumptionLoadStatus,
  ConsumptionPeriodKey,
  HomeConsumptionSummaryResponse,
} from './consumption.types';

type ConsumptionState = {
  data: HomeConsumptionSummaryResponse | null;
  error: unknown;
  status: ConsumptionLoadStatus;
};

export function useConsumptionScreen(homeId: string | null | undefined) {
  const { authenticatedRequest, status: authStatus } = useAuth();
  const [period, setPeriod] = useState<ConsumptionPeriodKey>('week');
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<ConsumptionState>({
    data: null,
    error: null,
    status: 'idle',
  });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !homeId) {
      setState({ data: null, error: null, status: 'idle' });
      return;
    }

    const activeHomeId = homeId;
    const controller = new AbortController();

    setState((current) => ({
      data: current.data?.home.id === activeHomeId ? current.data : null,
      error: null,
      status: current.data?.home.id === activeHomeId ? 'refreshing' : 'loading',
    }));

    async function load() {
      try {
        const data = await getHomeConsumptionSummary(authenticatedRequest, {
          homeId: activeHomeId,
          period,
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setState({ data, error: null, status: 'success' });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState((current) => ({
            data: current.data,
            error,
            status: 'error',
          }));
        }
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [authStatus, authenticatedRequest, homeId, period, reloadKey]);

  return {
    ...state,
    period,
    reload: () => {
      setReloadKey((current) => current + 1);
    },
    setPeriod,
  };
}
