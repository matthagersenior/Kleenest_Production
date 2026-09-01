import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client = () => getKleenestSupabaseClient();

export async function getBlockState(userId: string) {
  const { data: { user }, error: userError } = await client().auth.getUser();
  if (userError) throw userError;
  if (!user) return { signedIn: false, blocked: false };
  const { data, error } = await client().from('user_blocks').select('blocked_id').eq('blocker_id', user.id).eq('blocked_id', userId).maybeSingle();
  if (error) throw error;
  return { signedIn: true, blocked: Boolean(data) };
}

export async function blockUser(userId: string) {
  const { data, error } = await client().rpc('block_user', { p_user_id: userId });
  if (error) throw error;
  return data;
}

export async function unblockUser(userId: string) {
  const { data, error } = await client().rpc('unblock_user', { p_user_id: userId });
  if (error) throw error;
  return Boolean(data);
}

export async function reportUser(userId: string, reason: string, details = '', context = 'profile') {
  const { data, error } = await client().rpc('report_user', {
    p_user_id: userId,
    p_reason: reason,
    p_details: details.trim() || null,
    p_context: context,
  });
  if (error) throw error;
  return data;
}

export async function reportReview(reviewId: string, reason: string, details = '') {
  const { data, error } = await client().rpc('report_review', {
    p_review_id: reviewId,
    p_reason: reason,
    p_details: details.trim() || null,
  });
  if (error) throw error;
  return data;
}
