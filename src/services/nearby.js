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
  const rows=Array.isArray(data)?data:[];
  const ids=rows.map(row=>String(row.location_id||row.place_id||row.id||'')).filter(Boolean);
  const summaries=await listRestroomFacilitySummaries(ids).catch(()=>[]);
  const byId=new Map(summaries.map(item=>[String(item.location_id),item]));
  return rows.map(row=>({...row,restroom_facility_summary:byId.get(String(row.location_id||row.place_id||row.id||''))||null}));
}
