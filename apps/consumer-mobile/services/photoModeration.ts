import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type ReviewPhotoVote='helpful'|'not_helpful';
export type ReviewPhotoReportReason='privacy'|'explicit'|'relevance'|'other';

export async function voteReviewPhoto(reviewPhotoId:string,vote:ReviewPhotoVote,businessId:string|null=null){
  const{data,error}=await getKleenestSupabaseClient().rpc('vote_review_photo',{
    p_review_photo_id:reviewPhotoId,
    p_vote:vote,
    p_business_id:businessId,
  });
  if(error)throw error;
  return(data||{}) as {review_photo_id?:string;vote?:ReviewPhotoVote;helpful_votes?:number;not_helpful_votes?:number};
}

export async function reportReviewPhoto(reviewPhotoId:string,reason:ReviewPhotoReportReason,details:string|null=null,businessId:string|null=null){
  const{data,error}=await getKleenestSupabaseClient().rpc('report_review_photo',{
    p_review_photo_id:reviewPhotoId,
    p_reason:reason,
    p_details:details,
    p_business_id:businessId,
  });
  if(error)throw error;
  return data;
}
