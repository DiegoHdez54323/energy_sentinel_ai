import { useEffect, useState } from 'react';

import {
  type ActiveHomeSelection,
  readActiveHomeSelection,
} from './active-home.storage';

type ActiveHomeState = {
  home: ActiveHomeSelection | null;
  isLoading: boolean;
};

export function useActiveHome() {
  const [state, setState] = useState<ActiveHomeState>({
    home: null,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const home = await readActiveHomeSelection();

      if (!cancelled) {
        setState({ home, isLoading: false });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
