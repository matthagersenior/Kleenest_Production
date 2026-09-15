import { getSupabase } from '../lib/supabase.js';
import { listRestroomFacilitySummaries } from './restroomFacilities.js';

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
  const rows = Array.isArray(data) ? data : [];
  const locationIds = [...new Set(rows.map((row) => String(row.location_id || row.place_id || '')).filter(Boolean))].slice(0, 100);
  if (!locationIds.length) return rows;

  const [trustResult, networkResult, facilitySummaries] = await Promise.all([
    supabase.rpc('mobile_location_trust_summaries', { p_location_ids: locationIds }),
    supabase.rpc('mobile_location_network_statuses', { p_location_ids: locationIds }),
    listRestroomFacilitySummaries(locationIds).catch(()=>[]),
  ]);
  const trustById = new Map((Array.isArray(trustResult?.data) ? trustResult.data : []).map((row) => [String(row.location_id), row]));
  const networkById = new Map((Array.isArray(networkResult?.data) ? networkResult.data : []).map((row) => [String(row.location_id), row]));
  const facilityById = new Map((Array.isArray(facilitySummaries) ? facilitySummaries : []).map((row) => [String(row.location_id), row]));

  return rows.map((row) => {
    const id = String(row.location_id || row.place_id || '');
    const trust = trustById.get(id) || null;
    const network = networkById.get(id) || null;
    return {
      ...row,
      trust,
      network,
      network_verified: Boolean(network?.network_verified ?? row.network_verified),
      business_claimed: Boolean(network?.business_claimed ?? row.business_claimed),
      network_state: network?.network_state || row.network_state || 'unknown',
      restroom_facility_summary: facilityById.get(id) || null,
    };
  });
}
