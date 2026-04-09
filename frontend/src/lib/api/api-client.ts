import { AppConfig } from '@/config/app-config';

type ApiRequestOptions = {
  accessToken?: string;
  body?: unknown;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  signal?: AbortSignal;
};

type ApiErrorBody = {
  details?: unknown;
  error?: string;
};

export class ApiError extends Error {
  details?: unknown;
  code?: string;
  status: number;

  constructor({
    code,
    details,
    message,
    status,
  }: {
    code?: string;
    details?: unknown;
    message: string;
    status: number;
  }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}) {
  const headers = new Headers(options.headers);

  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.accessToken) {
    headers.set('Authorization', `Bearer ${options.accessToken}`);
  }

  const response = await fetch(`${AppConfig.apiBaseUrl}${path}`, {
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    headers,
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    signal: options.signal,
  });

  const text = await response.text();
  const data = parseResponseBody(text);

  if (!response.ok) {
    const errorBody = isApiErrorBody(data) ? data : undefined;

    throw new ApiError({
      code: errorBody?.error,
      details: errorBody?.details,
      message: errorBody?.error ?? `HTTP_${response.status}`,
      status: response.status,
    });
  }

  return data as T;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isAuthApiError(error: unknown) {
  return isApiError(error) && (error.status === 401 || error.status === 403);
}

function parseResponseBody(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return Boolean(value) && typeof value === 'object';
}
