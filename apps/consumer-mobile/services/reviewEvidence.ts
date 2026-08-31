import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type ReviewEvidence={
  review_id:string;
  verified_checked_in_at:string|null;
  verified_check_in_method:string|null;
  verified_distance_meters:number|null;
  photo_evidence_count:number;
  amenity_evidence_count:number;
};

export async function getReviewEvidence(reviewId:string):Promise<ReviewEvidence|null>{
  const {data,error}=await getKleenestSupabaseClient().rpc('mobile_review_evidence',{p_review_id:reviewId});
  if(error)throw error;
  if(!data||typeof data!=='object')return null;
  const row=data as any;
  return{
    review_id:String(row.review_id||reviewId),
    verified_checked_in_at:row.verified_checked_in_at||null,
    verified_check_in_method:row.verified_check_in_method||null,
    verified_distance_meters:row.verified_distance_meters==null?null:Number(row.verified_distance_meters),
    photo_evidence_count:Number(row.photo_evidence_count||0),
    amenity_evidence_count:Number(row.amenity_evidence_count||0),
  };
}
