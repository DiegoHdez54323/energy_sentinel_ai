import * as SecureStore from 'expo-secure-store';

const ACTIVE_HOME_KEY = 'energy-sentinel.homes.active';

export type ActiveHomeSelection = {
  deviceCountLabel?: string;
  id: string;
  name: string;
};

export async function readActiveHomeSelection() {
  const rawSelection = await SecureStore.getItemAsync(ACTIVE_HOME_KEY);

  if (!rawSelection) {
    return null;
  }

  try {
    return JSON.parse(rawSelection) as ActiveHomeSelection;
  } catch {
    await clearActiveHomeSelection();
    return null;
  }
}

export async function writeActiveHomeSelection(selection: ActiveHomeSelection) {
  await SecureStore.setItemAsync(ACTIVE_HOME_KEY, JSON.stringify(selection));
}

export async function clearActiveHomeSelection() {
  await SecureStore.deleteItemAsync(ACTIVE_HOME_KEY);
}
