import { getSupabase } from '../lib/supabase.js';

export async function listFavoriteLocations() {
  const { data, error } = await getSupabase().rpc('my_favorite_locations');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function toggleFavorite(locationId) {
  if (!locationId) throw new Error('Location id is required.');
  const { data, error } = await getSupabase().rpc('kleenest_toggle_favorite', { p_location_id: locationId });
  if (error) throw error;
  return data;
}
