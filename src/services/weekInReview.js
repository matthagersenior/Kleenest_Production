import { getSupabase } from '../lib/supabase.js';

export async function getWeekInReview(days=7){
  const bounded=Math.min(Math.max(Math.round(Number(days)||7),1),30);
  const{data,error}=await getSupabase().rpc('my_week_in_review',{p_days:bounded});
  if(error)throw error;
  const raw=data&&typeof data==='object'&&!Array.isArray(data)?data:{};
  return{
    periodDays:Number(raw.period_days||bounded),visitCount:Number(raw.visit_count||0),placeCount:Number(raw.place_count||0),verifiedVisitCount:Number(raw.verified_visit_count||0),reviewedCount:Number(raw.reviewed_count||0),reviewReadyCount:Number(raw.review_ready_count||0),verificationAvailableCount:Number(raw.verification_available_count||0),
    visits:(Array.isArray(raw.visits)?raw.visits:[]).map(item=>({visitId:String(item.visit_id||''),locationId:String(item.location_id||''),locationName:String(item.location_name||'Restroom'),visitedAt:item.visited_at,reviewId:item.review_id||null,verified:item.verified===true,reviewReady:item.review_ready===true,verificationAvailable:item.verification_available===true}))
  };
}
