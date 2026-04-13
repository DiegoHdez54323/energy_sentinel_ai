import { apiRequest } from '@/lib/api/api-client';

import type { AuthResponse, AuthTokens, AuthUser, LoginPayload, MeResponse, RefreshPayload, RegisterPayload } from './auth.types';

export async function registerRequest(payload: RegisterPayload) {
  const response = await apiRequest<AuthResponse>('/auth/register', {
    body: payload,
    method: 'POST',
  });

  return toAuthenticatedSession(response);
}

export async function loginRequest(payload: LoginPayload) {
  const response = await apiRequest<AuthResponse>('/auth/login', {
    body: payload,
    method: 'POST',
  });

  return toAuthenticatedSession(response);
}

export async function refreshRequest(payload: RefreshPayload) {
  return apiRequest<AuthTokens>('/auth/refresh', {
    body: payload,
    method: 'POST',
  });
}

export async function logoutRequest(payload: RefreshPayload) {
  await apiRequest<null>('/auth/logout', {
    body: payload,
    method: 'POST',
  });
}

export async function meRequest(accessToken: string) {
  const response = await apiRequest<MeResponse>('/auth/me', {
    accessToken,
    method: 'GET',
  });

  return {
    email: response.user.email,
    id: response.user.sub,
  } satisfies AuthUser;
}

export function mergeAuthUsers(previous: AuthUser | null, next: AuthUser) {
  if (!previous) {
    return next;
  }

  return {
    ...previous,
    ...next,
    createdAt: previous.createdAt ?? next.createdAt,
    name: next.name ?? previous.name,
  } satisfies AuthUser;
}

function toAuthenticatedSession(response: AuthResponse) {
  return {
    tokens: {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    },
    user: {
      createdAt: response.user.createdAt,
      email: response.user.email,
      id: response.user.id,
      name: response.user.name ?? null,
    } satisfies AuthUser,
  };
}
