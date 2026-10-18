import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { requirePlatformOwner } from './ownerAdmin';

export type DuplicateStatus = 'pending' | 'confirmed' | 'different_businesses' | 'co_located' | 'needs_geocoding' | 'resolved';

export type DuplicateLocation = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  source_dataset: string | null;
  source_external_id: string | null;
  is_active: boolean | null;
};

export type DuplicateCase = {
  id: number;
  first_location_id: string;
  second_location_id: string;
  rule: string;
  confidence: number;
  status: DuplicateStatus;
  distance_m: number | null;
  review_notes: string | null;
  created_at: string;
  first?: DuplicateLocation;
  second?: DuplicateLocation;
};

const client = () => getKleenestSupabaseClient();

// Database RLS independently requires platform-owner authorization.
export async function listOwnerLocationDuplicates(status: DuplicateStatus, limit = 80): Promise<DuplicateCase[]> {
  await requirePlatformOwner();
  const { data, error } = await client()
    .from('location_duplicate_cases')
    .select('id,first_location_id,second_location_id,rule,confidence,status,distance_m,review_notes,created_at')
    .eq('status', status)
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(Math.min(Math.max(1, limit), 200));
  if (error) throw error;
  const cases = (data ?? []) as DuplicateCase[];
  if (!cases.length) return [];
  const ids = [...new Set(cases.flatMap(item => [item.first_location_id, item.second_location_id]))];
  const { data: locations, error: locationError } = await client()
    .from('locations')
    .select('id,name,address,city,state,latitude,longitude,source_dataset,source_external_id,is_active')
    .in('id', ids);
  if (locationError) throw locationError;
  const byId = new Map(((locations ?? []) as DuplicateLocation[]).map(location => [location.id, location]));
  return cases.map(item => ({
    ...item,
    first: byId.get(item.first_location_id),
    second: byId.get(item.second_location_id),
  }));
}

export async function getOwnerDuplicateCounts(): Promise<Record<DuplicateStatus, number>> {
  await requirePlatformOwner();
  const statuses: DuplicateStatus[] = ['pending', 'needs_geocoding', 'confirmed', 'co_located', 'different_businesses', 'resolved'];
  const results = await Promise.all(statuses.map(async status => {
    const { count, error } = await client()
      .from('location_duplicate_cases').select('id', { count: 'exact', head: true }).eq('status', status);
    if (error) throw error;
    return [status, count ?? 0] as const;
  }));
  return Object.fromEntries(results) as Record<DuplicateStatus, number>;
}

// Review is intentionally non-destructive. Consolidation is a separate audited server workflow.
export async function classifyOwnerLocationDuplicate(
  id: number,
  status: DuplicateStatus,
  review_notes: string
): Promise<void> {
  await requirePlatformOwner();
  const { data, error } = await client().from('location_duplicate_cases')
    .update({ status, review_notes: review_notes.trim() || null, reviewed_at: new Date().toISOString() })
    .eq('id', id).select('id').single();
  if (error) throw error;
  if (!data) throw new Error('Duplicate review could not be saved.');
}
