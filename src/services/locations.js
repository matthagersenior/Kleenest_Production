import { getSupabase } from '../lib/supabase.js';

const columns = 'id,name,address,city,state,postal_code,latitude,longitude,rating,review_count,cleanliness_pct,accessible,changing_table,bathroom_verification_status,verification_confidence,source,brand';

export async function getLocation(id) {
  if (!id) return null;
  const { data, error } = await getSupabase().from('locations').select(columns).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getLocations(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return [];
  const { data, error } = await getSupabase().from('locations').select(columns).in('id', unique);
  if (error) throw error;
  const byId = new Map((data || []).map((row) => [row.id, row]));
  return unique.map((id) => byId.get(id)).filter(Boolean);
}
