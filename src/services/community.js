import { supabase } from '../lib/supabase.js';

export async function listLocationReviews(locationId, limit = 30) {
  const { data, error } = await supabase.from('reviews').select('id,location_id,user_id,check_in_id,stars,cleanliness_pct,comment,status,business_reply,business_replied_at,created_at').eq('location_id', locationId).eq('status', 'published').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function checkInAtLocation(locationId, latitude, longitude) {
  const { data, error } = await supabase.rpc('kleenest_map_check_in', { p_location_id: locationId, p_lat: latitude, p_lng: longitude });
  if (error) throw error;
  return data;
}

export async function createLocationReview({ locationId, checkInId = null, stars, cleanlinessPct = null, comment = '' }) {
  const { data, error } = await supabase.rpc('create_review', { p_location_id: locationId, p_check_in_id: checkInId, p_stars: Number(stars), p_cleanliness_pct: cleanlinessPct == null ? null : Number(cleanlinessPct), p_comment: comment.trim() || null });
  if (error) throw error;
  return data;
}

export async function toggleReviewLike(reviewId) {
  const { data, error } = await supabase.rpc('toggle_review_like', { p_review_id: reviewId });
  if (error) throw error;
  return data;
}
