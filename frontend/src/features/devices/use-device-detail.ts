import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { getDeviceAnomalies, getDeviceConsumption, getDeviceState } from './devices.api';
import {
  buildSummaryPeriod,
  getChartRange,
  getSummaryRanges,
} from './devices.format';
import type {
  DeviceChartPeriod,
  DeviceDetailData,
} from './devices.types';

type DeviceDetailLoadStatus = 'error' | 'idle' | 'loading' | 'refreshing' | 'success';

type DeviceDetailState = {
  data: DeviceDetailData | null;
  error: unknown;
  status: DeviceDetailLoadStatus;
};

export function useDeviceDetail(deviceId: string | null | undefined) {
  const { authenticatedRequest, status: authStatus } = useAuth();
  const [period, setPeriod] = useState<DeviceChartPeriod>('24h');
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<DeviceDetailState>({
    data: null,
    error: null,
    status: 'idle',
  });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !deviceId) {
      setState({ data: null, error: null, status: 'idle' });
      return;
    }

    const controller = new AbortController();
    const activeDeviceId = deviceId;

    setState((current) => ({
      data: current.data,
      error: null,
      status: current.data ? 'refreshing' : 'loading',
    }));

    async function load() {
      try {
        const chartRange = getChartRange(period);
        const [deviceState, anomaliesResponse, chart] = await Promise.all([
          getDeviceState(authenticatedRequest, activeDeviceId, controller.signal),
          getDeviceAnomalies(authenticatedRequest, {
            deviceId: activeDeviceId,
            signal: controller.signal,
          }),
          getDeviceConsumption(authenticatedRequest, {
            deviceId: activeDeviceId,
            from: chartRange.from,
            signal: controller.signal,
            to: chartRange.to,
          }),
        ]);

        const summaryRanges = getSummaryRanges(chart.timezone);
        const [today, previousToday, week, previousWeek] = await Promise.all([
          getDeviceConsumption(authenticatedRequest, {
            deviceId: activeDeviceId,
            from: summaryRanges.today.from,
            signal: controller.signal,
            to: summaryRanges.today.to,
          }),
          getDeviceConsumption(authenticatedRequest, {
            deviceId: activeDeviceId,
            from: summaryRanges.previousToday.from,
            signal: controller.signal,
            to: summaryRanges.previousToday.to,
          }),
          getDeviceConsumption(authenticatedRequest, {
            deviceId: activeDeviceId,
            from: summaryRanges.week.from,
            signal: controller.signal,
            to: summaryRanges.week.to,
          }),
          getDeviceConsumption(authenticatedRequest, {
            deviceId: activeDeviceId,
            from: summaryRanges.previousWeek.from,
            signal: controller.signal,
            to: summaryRanges.previousWeek.to,
          }),
        ]);

        if (!controller.signal.aborted) {
          setState({
            data: {
              anomalies: anomaliesResponse.anomalies,
              chart,
              state: deviceState,
              summary: {
                today: buildSummaryPeriod(today.series, previousToday.series),
                week: buildSummaryPeriod(week.series, previousWeek.series),
              },
            },
            error: null,
            status: 'success',
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState((current) => ({ data: current.data, error, status: 'error' }));
        }
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [authStatus, authenticatedRequest, deviceId, period, reloadKey]);

  return {
    ...state,
    period,
    reload: () => {
      setReloadKey((current) => current + 1);
    },
    setPeriod,
  };
}
