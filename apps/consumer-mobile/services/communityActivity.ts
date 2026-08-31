import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export async function listMobileCommunityActivity(limit=30){
  const bounded=Math.min(Math.max(Number(limit)||30,1),100);
  const {data,error}=await getKleenestSupabaseClient().rpc('community_following_review_activity',{p_limit:bounded});
  if(error)throw error;
  return (Array.isArray(data)?data:[]).map((row:any)=>({
    id:`review:${row.review_id}`,
    kind:'review',
    locationId:row.location_id,
    createdAt:row.created_at,
    title:`${row.display_name||row.username||'A contributor'} left a ${row.stars}★ review`,
    detail:row.comment||(row.cleanliness_pct!=null?`${row.cleanliness_pct}% cleanliness`:''),
    verified:Boolean(row.verified_checked_in_at||row.check_in_id),
    verifiedAt:row.verified_checked_in_at||null,
    verificationMethod:row.verified_check_in_method||null,
    verifiedDistanceMeters:row.verified_distance_meters==null?null:Number(row.verified_distance_meters),
    photoEvidenceCount:Number(row.photo_evidence_count||0),
    amenityEvidenceCount:Number(row.amenity_evidence_count||0),
    helpfulCount:Number(row.helpful_count||0),
    reputationLevel:row.reputation_level||'new',
    contributor:{id:row.user_id,display_name:row.display_name,username:row.username,avatar_url:row.avatar_url},
    location:{id:row.location_id,name:row.location_name},
  }));
}
