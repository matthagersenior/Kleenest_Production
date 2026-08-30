import { getSupabase } from '../lib/supabase.js';

export async function findNearbyRestrooms({ latitude, longitude, radiusMeters = 5000, limit = 50 }) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('map_network_nearby_v1', {
    p_lat: latitude,
    p_lng: longitude,
    p_radius_m: radiusMeters,
    p_limit: limit,
    p_category: null,
    p_search: null,
    p_amenity_names: null,
  });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
