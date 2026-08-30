import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const storage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

let singleton: SupabaseClient | null = null;

export function getKleenestSupabaseClient(): SupabaseClient {
  if (singleton) return singleton;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  singleton = createClient(url, key, { auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } });
  return singleton;
}

export async function listNearbyRestrooms(latitude: number, longitude: number, radiusMeters = 8047, search = '') {
  const { data, error } = await getKleenestSupabaseClient().rpc('map_network_nearby_v1', {
    p_lat: latitude,
    p_lng: longitude,
    p_radius_m: radiusMeters,
    p_limit: 100,
    p_category: null,
    p_search: search.trim() || null,
    p_amenity_names: null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getMobileAccountSummary() {
  const { data, error } = await getKleenestSupabaseClient().rpc('user_subscription_summary');
  if (error) throw error;
  return data || {};
}

export const KLEENEST_APP_VERSION = '0.1.0';
