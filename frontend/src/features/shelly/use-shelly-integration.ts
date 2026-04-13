import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import {
  deleteShellyIntegration,
  getShellyIntegration,
  refreshShellyIntegration,
  startShellyOAuth,
} from './shelly.api';
import type { ShellyIntegration } from './shelly.types';

type ShellyStatus = 'error' | 'loading' | 'refreshing' | 'success';

type ShellyState = {
  error: unknown;
  integration: ShellyIntegration | null;
  status: ShellyStatus;
};

export function useShellyIntegration() {
  const { authenticatedRequest, status: authStatus } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<ShellyState>({
    error: null,
    integration: null,
    status: 'loading',
  });

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      return;
    }

    const controller = new AbortController();

    setState((current) => ({
      error: null,
      integration: current.integration,
      status: current.integration ? 'refreshing' : 'loading',
    }));

    async function load() {
      try {
        const { integration } = await getShellyIntegration(
          authenticatedRequest,
          controller.signal
        );

        if (!controller.signal.aborted) {
          setState({ error: null, integration, status: 'success' });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState((current) => ({
            error,
            integration: current.integration,
            status: 'error',
          }));
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
    disconnect: async () => {
      await deleteShellyIntegration(authenticatedRequest);
      setState({ error: null, integration: null, status: 'success' });
    },
    refreshAccess: async () => {
      await refreshShellyIntegration(authenticatedRequest);
      setReloadKey((current) => current + 1);
    },
    reload: () => {
      setReloadKey((current) => current + 1);
    },
    startOAuth: async () => {
      const { authUrl } = await startShellyOAuth(authenticatedRequest);
      return authUrl;
    },
  };
}
