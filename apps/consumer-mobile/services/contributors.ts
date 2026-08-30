import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export async function searchContributors(query: string, limit = 20) {
  const text = String(query || '').trim();
  if (text.length < 2) return [];
  const { data, error } = await getKleenestSupabaseClient().rpc('community_search_contributors', {
    p_query: text,
    p_limit: Math.min(Math.max(limit, 1), 50),
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getContributorProfile(userId: string) {
  if (!userId) throw new Error('Contributor id is required.');
  const { data, error } = await getKleenestSupabaseClient().rpc('community_contributor_profile', {
    p_user_id: userId,
  });
  if (error) throw error;
  return data || null;
}
