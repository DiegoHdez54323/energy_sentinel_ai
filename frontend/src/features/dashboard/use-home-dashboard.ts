import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { clearActiveHomeSelection } from '@/features/homes/active-home.storage';
import { getHomeDashboard } from './dashboard.api';
import { isDashboardHomeNotFound } from './dashboard.errors';
import type { HomeDashboardResponse } from './dashboard.types';

type DashboardStatus = 'error' | 'idle' | 'loading' | 'refreshing' | 'success';

type DashboardState = {
  dashboard: HomeDashboardResponse | null;
  error: unknown;
  status: DashboardStatus;
};

export function useHomeDashboard(homeId: string | null | undefined) {
  const { authenticatedRequest, status: authStatus } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<DashboardState>({
    dashboard: null,
    error: null,
    status: 'idle',
  });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !homeId) {
      setState({ dashboard: null, error: null, status: 'idle' });
      return;
    }

    const dashboardHomeId = homeId;
    const controller = new AbortController();

    setState((current) => ({
      dashboard: current.dashboard,
      error: null,
      status: current.dashboard ? 'refreshing' : 'loading',
    }));

    async function load() {
      try {
        const dashboard = await getHomeDashboard(authenticatedRequest, dashboardHomeId, controller.signal);

        if (!controller.signal.aborted) {
          setState({ dashboard, error: null, status: 'success' });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        if (isDashboardHomeNotFound(error)) {
          await clearActiveHomeSelection();
        }

        setState((current) => ({ dashboard: current.dashboard, error, status: 'error' }));
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [authStatus, authenticatedRequest, homeId, reloadKey]);

  return {
    ...state,
    reload: () => {
      setReloadKey((current) => current + 1);
    },
  };
}
