import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { listReviewPhotosForReviews } from './reviewPhotos';

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

export async function getContributorRelationship(userId:string){
  if(!userId)throw new Error('Contributor id is required.');
  const{data,error}=await getKleenestSupabaseClient().rpc('community_relationship_status',{p_user_id:userId});
  if(error)throw error;
  return data||{is_self:false,is_following:false,follows_you:false,mutual:false};
}

export async function getContributorProfile(userId: string) {
  if (!userId) throw new Error('Contributor id is required.');
  const client=getKleenestSupabaseClient();
  const [{data,error},{data:relationship,error:relationshipError}] = await Promise.all([
    client.rpc('community_contributor_profile',{p_user_id:userId}),
    client.rpc('community_relationship_status',{p_user_id:userId}),
  ]);
  if (error) throw error;
  if (relationshipError) throw relationshipError;
  if(!data)return null;
  const reviews=Array.isArray((data as any)?.reviews)?(data as any).reviews:[];
  const photosByReview=await listReviewPhotosForReviews(reviews.map((review:any)=>String(review.id)));
  return {...(data as any),relationship:relationship||null,reviews:reviews.map((review:any)=>({...review,photos:photosByReview[String(review.id)]||[]}))};
}
