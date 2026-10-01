import { getKleenestSupabaseClient, getMobileLocation, listMobileFavoriteLocations, listMobileLocationReviews } from '@kleenest/mobile-core';
import { listLocationAmenityInventory } from './amenities';
import { getLocationTrustQuality, getLocationTrustSummary } from './locationTrust';

export type ConsumerAiTask='evidence_interpretation'|'route_plan'|'visit_review'|'explore_reason'|'place_summary'|'route_summary'|'mission_suggestion'|'weekly_recap'|'business_insight';
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


type OrganicConsumerAiTask=Extract<ConsumerAiTask,'explore_reason'|'place_summary'|'route_summary'|'mission_suggestion'|'weekly_recap'|'business_insight'>;
const organicCache=new Map<string,AiAssistResult>();
const text=(value:unknown)=>String(value??'').trim();
const cacheKey=(task:OrganicConsumerAiTask,context:Record<string,unknown>)=>`${task}:${JSON.stringify(context)}`;
const fallbackResult=(task:OrganicConsumerAiTask,answer:string):AiAssistResult=>({task,answer,provider:'grounded_fallback',model:null,review_required:false,trace_id:'local-grounded-fallback'});

export async function invokeOrganicConsumerAi(task:OrganicConsumerAiTask,context:Record<string,unknown>,instruction:string,fallback:string){
  const key=cacheKey(task,context);
  const cached=organicCache.get(key);
  if(cached)return cached;
  try{
    const result=await invokeConsumerAi(task,context,instruction);
    const concise={...result,answer:text(result.answer).slice(0,360)};
    organicCache.set(key,concise);
    return concise;
  }catch{
    const result=fallbackResult(task,fallback);
    organicCache.set(key,result);
    return result;
  }
}

function freshnessLabel(row:any){
  return text(row?.intelligence?.freshness_label||row?.freshness_label||row?.network?.freshness_label||row?.trust?.staleness_status).replaceAll('_',' ');
}
function verificationLabel(row:any){
  if(row?.network?.network_verified||row?.network_verified)return 'Kleenest verified';
  if(row?.is_verified||row?.verification_status==='verified')return 'verified location';
  if(row?.business_claimed||row?.network?.business_claimed)return 'claimed business';
  return '';
}
function distanceText(row:any){
  const meters=Number(row?.distance_meters);
  if(!Number.isFinite(meters))return '';
  const miles=meters/1609.344;
  return `${miles.toFixed(miles<10?1:0)} mi away`;
}
function matchedAmenityText(row:any,requested:string[]){
  if(!requested.length)return '';
  const haystack=JSON.stringify([row?.amenities,row?.amenity_names,row?.matched_amenities,row?.bathroom_amenities]).toLowerCase();
  const matched=requested.filter(name=>haystack.includes(String(name).toLowerCase())).slice(0,3);
  return matched.length?`matches ${matched.join(', ')}`:'';
}

export async function organicExploreReason(row:any,requestedAmenities:string[]=[],route:any=null){
  const fraction=Math.max(0,Math.min(1,Number(row?.route_fraction||0)));
  const routePosition=route&&Number.isFinite(Number(route?.distanceMiles))?`about ${(Number(route.distanceMiles)*fraction).toFixed(1)} mi ahead`:'';
  const context={place:{
    id:String(row?.id||row?.location_id||''),
    name:text(row?.name||row?.business_name),
    distance_label:distanceText(row),
    route_position:routePosition,
    freshness_label:freshnessLabel(row),
    verification_label:verificationLabel(row),
    matched_amenities:matchedAmenityText(row,requestedAmenities),
    rating:Number.isFinite(Number(row?.rating))?Number(row.rating):null,
    cleanliness_pct:Number.isFinite(Number(row?.cleanliness_pct))?Number(row.cleanliness_pct):null,
  }};
  const fallback=[context.place.matched_amenities,context.place.freshness_label,context.place.verification_label,context.place.distance_label||context.place.route_position].filter(Boolean).slice(0,3).join(' · ');
  return (await invokeOrganicConsumerAi('explore_reason',context,'Explain in one short sentence why this option may fit the current discovery intent.',fallback?`Why it may fit: ${fallback}.`:'Kleenest surfaced this from the current discovery ranking.')).answer;
}

export async function organicPlaceSummary(place:any,reviews:any[]=[]){
  const context={place:{
    id:String(place?.id||place?.location_id||''),
    name:text(place?.name),
    rating:Number.isFinite(Number(place?.rating))?Number(place.rating):null,
    cleanliness_pct:Number.isFinite(Number(place?.cleanliness_pct))?Number(place.cleanliness_pct):null,
    freshness_label:freshnessLabel(place),
    verification_label:verificationLabel(place),
    accessible:place?.accessible===true?true:place?.accessible===false?false:null,
    review_count:Number(place?.review_count||reviews.length||0),
    recent_verified_reviews:reviews.slice(0,4).filter((review:any)=>Boolean(review?.check_in_id)).map((review:any)=>({stars:review.stars,cleanliness_pct:review.cleanliness_pct,created_at:review.created_at})),
  }};
  const facts=[context.place.verification_label,context.place.freshness_label,context.place.cleanliness_pct!=null?`${Math.round(context.place.cleanliness_pct)}% cleanliness`:null,context.place.rating!=null?`${context.place.rating}/5 rating`:null].filter(Boolean).slice(0,3).join(' · ');
  return (await invokeOrganicConsumerAi('place_summary',context,'Give a concise visitor briefing from these current Kleenest facts.',facts?`At a glance: ${facts}.`:'Kleenest has this location in discovery; current evidence may still be limited.')).answer;
}

export async function organicRouteSummary(route:any,stops:any[],bestStop:any=null){
  const context={
    route:{distance_miles:route?.distanceMiles??null,duration_minutes:route?.durationMinutes??null,provider:text(route?.provider)},
    stops:stops.slice(0,12).map((row:any,index:number)=>({order:index+1,id:String(row?.id||''),name:text(row?.name),freshness_label:freshnessLabel(row),verification_label:verificationLabel(row)})),
    best_stop:bestStop?{id:String(bestStop?.id||''),name:text(bestStop?.name)}:null,
  };
  const core=[route?.distanceMiles!=null?`${route.distanceMiles} mi`:null,route?.durationMinutes!=null?`about ${route.durationMinutes} min`:null,`${stops.length} stop${stops.length===1?'':'s'}`].filter(Boolean).join(' · ');
  return (await invokeOrganicConsumerAi('route_summary',context,'Summarize this built route in one or two short sentences without changing the stop order.',`Route brief: ${core}. Your stop order stays under your control.`)).answer;
}


export async function organicMissionSuggestion(candidate:any,progression:any={}){
  const mission={
    id:String(candidate?.id||candidate?.objective_id||candidate?.location_id||''),
    title:text(candidate?.title||candidate?.name||candidate?.location_name||candidate?.kind||'Useful Kleenest work nearby'),
    kind:text(candidate?.kind),
    location_name:text(candidate?.location_name||candidate?.name),
    reason:text(candidate?.reason||candidate?.description||candidate?.rationale),
  };
  const context={mission,progression:{
    lifetime_xp:Number(progression?.lifetime_xp||0),
    level:Number(progression?.level||progression?.global_level?.level||1),
    trust_rank:text(progression?.trust_rank||progression?.contributor_trust?.rank),
  }};
  const fallback=`A useful next move: ${mission.title}.${mission.reason?` ${mission.reason}`:''}`;
  return (await invokeOrganicConsumerAi('mission_suggestion',context,'Explain this already-selected Kleenest opportunity as one concise next move. Do not invent rewards or eligibility.',fallback)).answer;
}

export async function organicWeeklyRecap(summary:any){
  const context={week:{
    period_days:Number(summary?.periodDays||7),
    visits:Number(summary?.visitCount||0),
    places:Number(summary?.placeCount||0),
    verified_contributions:Number(summary?.verifiedVisitCount||0),
    reviews:Number(summary?.reviewedCount||0),
    review_ready:Number(summary?.reviewReadyCount||0),
    verification_available:Number(summary?.verificationAvailableCount||0),
    photo_ready:Number(summary?.photoOpenCount||0),
  }};
  const week=context.week;
  const fallback=`Your last ${week.period_days} days: ${week.visits} visit${week.visits===1?'':'s'} across ${week.places} place${week.places===1?'':'s'}, with ${week.verified_contributions} verified visit${week.verified_contributions===1?'':'s'} and ${week.reviews} review${week.reviews===1?'':'s'}.`;
  return (await invokeOrganicConsumerAi('weekly_recap',context,'Summarize this account-scoped Kleenest week in one or two useful sentences. Mention an unfinished contribution only if the supplied counts show one.',fallback)).answer;
}
