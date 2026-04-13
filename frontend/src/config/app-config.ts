const FALLBACK_API_BASE_URL = 'http://localhost:3000';

function normalizeApiBaseUrl(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return FALLBACK_API_BASE_URL;
  }

  return trimmed.replace(/\/+$/, '');
}

export const AppConfig = {
  apiBaseUrl: normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL),
} as const;
