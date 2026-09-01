import { getKleenestSupabaseClient, getMobileLocation, listMobileFavoriteLocations, listMobileLocationReviews } from '@kleenest/mobile-core';
import { listLocationAmenityInventory } from './amenities';
import { getLocationTrustQuality, getLocationTrustSummary } from './locationTrust';

export type ConsumerAiTask='evidence_interpretation'|'route_plan'|'visit_review';
export type AiAssistResult={task:string;answer:string;provider:string;model:string|null;review_required:boolean;trace_id:string;provider_status?:number|null;provider_error_code?:string|null;provider_error_type?:string|null};

export async function invokeConsumerAi(task:ConsumerAiTask,context:Record<string,unknown>,instruction:string){
  const client=getKleenestSupabaseClient();
  const {data:{user},error:userError}=await client.auth.getUser();
  if(userError)throw userError;
  if(!user)throw new Error('Sign in to use Kleenest AI.');
  const {data,error}=await client.functions.invoke('ai-assist',{body:{task,context,instruction:instruction.trim()}});
  if(error)throw error;
  if(!data?.answer)throw new Error(data?.error||'Kleenest AI returned no answer.');
  return data as AiAssistResult;
}

export async function buildLocationAiContext(locationId:string){
  const [location,trust,trustSummary,reviews,amenities]=await Promise.all([
    getMobileLocation(locationId),
    getLocationTrustQuality(locationId).catch(()=>null),
    getLocationTrustSummary(locationId).catch(()=>null),
    listMobileLocationReviews(locationId,12).catch(()=>[]),
    listLocationAmenityInventory(locationId).catch(()=>[]),
  ]);
  if(!location)throw new Error('That restroom is no longer available.');
  return{
    location,
    trust:{...trust,...trustSummary},
    bathroom:{amenities:amenities.slice(0,30)},
    reviews:reviews.slice(0,12).map((review:any)=>({stars:review.stars,cleanliness_pct:review.cleanliness_pct,comment:review.comment,verified:Boolean(review.check_in_id),created_at:review.created_at})),
  };
}

export async function buildSavedRouteAiContext(){
  const saved=await listMobileFavoriteLocations();
  return{stops:saved.slice(0,12).map((row:any)=>({id:row.id||row.location_id,name:row.name,address:row.address,city:row.city,state:row.state,latitude:row.latitude,longitude:row.longitude,rating:row.rating,cleanliness_pct:row.cleanliness_pct,verification_status:row.verification_status}))};
}
