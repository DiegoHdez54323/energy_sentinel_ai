import type { AuthenticatedHomesRequest } from '@/features/homes/homes.types';
import type { ConsumptionPeriodKey, HomeConsumptionSummaryResponse } from './consumption.types';

export function getHomeConsumptionSummary(
  authenticatedRequest: AuthenticatedHomesRequest,
  options: {
    homeId: string;
    period: ConsumptionPeriodKey;
    signal?: AbortSignal;
  }
) {
  return authenticatedRequest<HomeConsumptionSummaryResponse>(
    `/homes/${options.homeId}/consumption/summary?period=${encodeURIComponent(options.period)}`,
    { signal: options.signal }
  );
}
