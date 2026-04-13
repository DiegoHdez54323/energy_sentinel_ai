import type { AuthenticatedDashboardRequest, HomeDashboardResponse } from './dashboard.types';

export function getHomeDashboard(
  authenticatedRequest: AuthenticatedDashboardRequest,
  homeId: string,
  signal?: AbortSignal
) {
  return authenticatedRequest<HomeDashboardResponse>(`/homes/${homeId}/dashboard`, { signal });
}
