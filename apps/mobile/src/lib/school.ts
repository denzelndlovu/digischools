import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { PublicTenantConfig } from '@digischools/config-schema';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';
const CODE_KEY = 'school-code';
const CONFIG_KEY = 'school-config';

export const normalizeCode = (input: string) => input.trim().toLowerCase();

export async function getSavedSchoolCode(): Promise<string | null> {
  return SecureStore.getItemAsync(CODE_KEY);
}

export async function forgetSchool(): Promise<void> {
  await SecureStore.deleteItemAsync(CODE_KEY);
  await AsyncStorage.removeItem(CONFIG_KEY);
}

export async function fetchSchoolConfig(code: string): Promise<PublicTenantConfig | null> {
  const res = await fetch(`${API_URL}/v1/public/tenants/${encodeURIComponent(code)}/config`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load school (${res.status})`);
  return (await res.json()) as PublicTenantConfig;
}

export async function saveSchool(code: string, config: PublicTenantConfig): Promise<void> {
  await SecureStore.setItemAsync(CODE_KEY, code);
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/** Network first, falling back to the cached copy so the app opens offline. */
export async function loadSchool(code: string): Promise<PublicTenantConfig | null> {
  try {
    const fresh = await fetchSchoolConfig(code);
    if (fresh) await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    const cached = await AsyncStorage.getItem(CONFIG_KEY);
    return cached ? (JSON.parse(cached) as PublicTenantConfig) : null;
  }
}
