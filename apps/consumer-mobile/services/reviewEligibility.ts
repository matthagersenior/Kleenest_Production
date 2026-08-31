import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type EligibleReviewCheckIn = {
  id: string;
  checked_in_at: string;
  verification_method: string | null;
};

export async function findLatestEligibleReviewCheckIn(locationId: string): Promise<EligibleReviewCheckIn | null> {
  const client = getKleenestSupabaseClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  const user = auth?.user;
  if (!user) return null;

  const { data: checkIns, error: checkInError } = await client
    .from('check_ins')
    .select('id,checked_in_at,verification_method,metadata')
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
  };
}
