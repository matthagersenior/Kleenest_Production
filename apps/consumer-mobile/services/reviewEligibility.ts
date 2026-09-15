import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type EligibleReviewCheckIn = {
  id: string;
  checked_in_at: string;
  verification_method: string | null;
  restroom_facility_id: string | null;
};

export type ActiveLocationVisit = EligibleReviewCheckIn & {
  distance_meters: number | null;
};

export async function findLatestEligibleReviewCheckIn(locationId: string): Promise<EligibleReviewCheckIn | null> {
  const client = getKleenestSupabaseClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  const user = auth?.user;
  if (!user) return null;

  const { data: checkIns, error: checkInError } = await client
    .from('check_ins')
    .select('id,checked_in_at,verification_method,restroom_facility_id,metadata')
    .eq('user_id', user.id)
    .eq('location_id', locationId)
    .order('checked_in_at', { ascending: false })
    .limit(12);
  if (checkInError) throw checkInError;

  const eligible = (checkIns || []).filter((row: any) => row?.metadata?.progression_eligible === true);
  if (!eligible.length) return null;

  const ids = eligible.map((row: any) => String(row.id));
  const { data: reviews, error: reviewError } = await client
    .from('reviews')
    .select('check_in_id')
    .eq('user_id', user.id)
    .eq('location_id', locationId)
    .in('check_in_id', ids);
  if (reviewError) throw reviewError;

  const used = new Set((reviews || []).map((row: any) => String(row.check_in_id || '')).filter(Boolean));
  const next = eligible.find((row: any) => !used.has(String(row.id)));
  if (!next) return null;
  return {
    id: String(next.id),
    checked_in_at: String(next.checked_in_at),
    verification_method: next.verification_method ? String(next.verification_method) : null,
    restroom_facility_id: next.restroom_facility_id ? String(next.restroom_facility_id) : null,
  };
}


export async function findActiveLocationVisit(locationId: string): Promise<ActiveLocationVisit | null> {
  const client = getKleenestSupabaseClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  const user = auth?.user;
  if (!user) return null;

  const { data: latest, error: checkInError } = await client
    .from('check_ins')
    .select('id,checked_in_at,verification_method,restroom_facility_id,distance_meters')
    .eq('user_id', user.id)
    .eq('location_id', locationId)
    .order('checked_in_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (checkInError) throw checkInError;
  if (!latest) return null;

  const { data: departure, error: departureError } = await client
    .from('location_departures')
    .select('id,left_at')
    .eq('user_id', user.id)
    .eq('location_id', locationId)
    .gt('left_at', latest.checked_in_at)
    .order('left_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (departureError) throw departureError;
  if (departure) return null;

  return {
    id: String(latest.id),
    checked_in_at: String(latest.checked_in_at),
    verification_method: latest.verification_method ? String(latest.verification_method) : null,
    restroom_facility_id: latest.restroom_facility_id ? String(latest.restroom_facility_id) : null,
    distance_meters: latest.distance_meters == null ? null : Number(latest.distance_meters),
  };
}
