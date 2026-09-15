import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type WeekInReviewVisit={
  visitId:string;
  locationId:string;
  locationName:string;
  visitedAt:string;
  lastSeenAt:string|null;
  departedAt:string|null;
  verificationExpiresAt:string|null;
  checkInId:string|null;
  checkedInAt:string|null;
  verificationMethod:string|null;
  reviewId:string|null;
  reviewedAt:string|null;
  verified:boolean;
  reviewReady:boolean;
  verificationAvailable:boolean;
};

export type WeekInReviewSummary={
  periodDays:number;
  startedAt:string|null;
  visitCount:number;
  placeCount:number;
  verifiedVisitCount:number;
  reviewedCount:number;
  reviewReadyCount:number;
  verificationAvailableCount:number;
  visits:WeekInReviewVisit[];
};

const emptySummary=(days:number):WeekInReviewSummary=>({periodDays:days,startedAt:null,visitCount:0,placeCount:0,verifiedVisitCount:0,reviewedCount:0,reviewReadyCount:0,verificationAvailableCount:0,visits:[]});
const stringOrNull=(value:unknown)=>typeof value==='string'&&value?value:null;

export async function getWeekInReview(days=7):Promise<WeekInReviewSummary>{
  const bounded=Math.min(Math.max(Math.round(Number(days)||7),1),30);
  const{data,error}=await getKleenestSupabaseClient().rpc('my_week_in_review',{p_days:bounded});
  if(error)throw error;
  if(!data||typeof data!=='object'||Array.isArray(data))return emptySummary(bounded);
  const raw:any=data;
  const visits=(Array.isArray(raw.visits)?raw.visits:[]).map((item:any):WeekInReviewVisit=>({
    visitId:String(item.visit_id||''),locationId:String(item.location_id||''),locationName:String(item.location_name||'Restroom'),visitedAt:String(item.visited_at||''),
    lastSeenAt:stringOrNull(item.last_seen_at),departedAt:stringOrNull(item.departed_at),verificationExpiresAt:stringOrNull(item.verification_expires_at),
    checkInId:stringOrNull(item.check_in_id),checkedInAt:stringOrNull(item.checked_in_at),verificationMethod:stringOrNull(item.verification_method),reviewId:stringOrNull(item.review_id),reviewedAt:stringOrNull(item.reviewed_at),
    verified:item.verified===true,reviewReady:item.review_ready===true,verificationAvailable:item.verification_available===true,
  })).filter((item:WeekInReviewVisit)=>item.visitId&&item.locationId);
  return{
    periodDays:Number(raw.period_days||bounded),startedAt:stringOrNull(raw.started_at),visitCount:Number(raw.visit_count||0),placeCount:Number(raw.place_count||0),verifiedVisitCount:Number(raw.verified_visit_count||0),
    reviewedCount:Number(raw.reviewed_count||0),reviewReadyCount:Number(raw.review_ready_count||0),verificationAvailableCount:Number(raw.verification_available_count||0),visits,
  };
}
