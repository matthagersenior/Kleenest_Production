import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export async function toggleHelpfulReview(reviewId: string) {
  if (!reviewId) throw new Error('Review id is required.');
  const { data, error } = await getKleenestSupabaseClient().rpc('toggle_review_like', {
    p_review_id: reviewId,
  });
  if (error) throw error;
  return Boolean(data);
}
