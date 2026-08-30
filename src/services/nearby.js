import { getSupabase } from '../lib/supabase.js';

export async function findNearbyRestrooms({ latitude, longitude, radiusMeters = 5000, limit = 100, search = '', category = null, amenityNames = [] }) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('map_network_nearby_v1', {
    p_lat: latitude,
    p_lng: longitude,
    p_radius_m: radiusMeters,
    p_limit: limit,
    p_category: category || null,
    p_search: String(search || '').trim() || null,
    p_amenity_names: Array.isArray(amenityNames) && amenityNames.length ? amenityNames : null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
