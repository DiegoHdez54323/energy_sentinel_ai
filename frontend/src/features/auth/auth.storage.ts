import * as SecureStore from 'expo-secure-store';

import type { StoredAuthSession } from './auth.types';

const AUTH_SESSION_KEY = 'energy-sentinel.auth.session';

export async function readStoredAuthSession() {
  const rawSession = await SecureStore.getItemAsync(AUTH_SESSION_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as StoredAuthSession;
  } catch {
    await SecureStore.deleteItemAsync(AUTH_SESSION_KEY);
    return null;
  }
}

export async function writeStoredAuthSession(session: StoredAuthSession) {
  await SecureStore.setItemAsync(AUTH_SESSION_KEY, JSON.stringify(session));
}

export async function clearStoredAuthSession() {
  await SecureStore.deleteItemAsync(AUTH_SESSION_KEY);
}
