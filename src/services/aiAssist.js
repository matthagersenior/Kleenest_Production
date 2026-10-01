import { getSupabase } from '../lib/supabase.js';

const cache=new Map();
const text=value=>String(value??'').trim();
const fallbackResult=(task,answer)=>({task,answer,provider:'grounded_fallback',model:null,review_required:false,trace_id:'web-grounded-fallback'});

export async function invokeOrganicAi(task,context,instruction,fallback){
  const key=`${task}:${JSON.stringify(context)}`;
  if(cache.has(key))return cache.get(key);
  try{
    const client=getSupabase();
    const {data:{session}}=await client.auth.getSession();
    if(!session?.user){const result=fallbackResult(task,fallback);cache.set(key,result);return result;}
    const {data,error}=await client.functions.invoke('ai-assist',{body:{task,context,instruction:instruction.trim()}});
    if(error||!data?.answer)throw error||new Error(data?.error||'No answer');
    const result={...data,answer:text(data.answer).slice(0,360)};
    cache.set(key,result);
    return result;
  }catch{
    const result=fallbackResult(task,fallback);
    cache.set(key,result);
    return result;
  }
}

const distanceLabel=place=>{
  const meters=Number(place?.distance_meters);
  if(!Number.isFinite(meters))return '';
  const miles=meters/1609.344;
  return `${miles.toFixed(miles<10?1:0)} mi away`;
};
const verificationLabel=place=>place?.network?.network_verified||place?.network_verified?'Kleenest verified':place?.is_verified||place?.verification_status==='verified'?'verified location':place?.business_claimed||place?.network?.business_claimed?'claimed business':'';
const freshnessLabel=place=>text(place?.intelligence?.freshness_label||place?.freshness_label||place?.network?.freshness_label||place?.trust?.staleness_status).replaceAll('_',' ');

export async function organicExploreReason(place){
  const context={place:{
    distance_label:distanceLabel(place),
    verification_label:verificationLabel(place),
    freshness_label:freshnessLabel(place),
    rating:Number.isFinite(Number(place?.rating))?Number(place.rating):null,
    cleanliness_pct:Number.isFinite(Number(place?.cleanliness_pct))?Number(place.cleanliness_pct):null,
  }};
  const facts=[context.place.verification_label,context.place.freshness_label,context.place.cleanliness_pct!=null?`${Math.round(context.place.cleanliness_pct)}% clean`:null,context.place.distance_label].filter(Boolean).slice(0,3).join(' · ');
  return (await invokeOrganicAi('explore_reason',context,'Explain in one short sentence why this discovered option may fit right now.',facts?`Why it may fit: ${facts}.`:'Kleenest surfaced this from the current discovery ranking.')).answer;
}

export async function organicPlaceSummary(place,reviews=[]){
  const context={place:{
    verification_label:verificationLabel(place),
    freshness_label:freshnessLabel(place),
    rating:Number.isFinite(Number(place?.rating))?Number(place.rating):null,
    cleanliness_pct:Number.isFinite(Number(place?.cleanliness_pct))?Number(place.cleanliness_pct):null,
    accessible:place?.accessible===true?true:place?.accessible===false?false:null,
    review_count:Number(place?.review_count||reviews.length||0),
    recent_verified_reviews:reviews.slice(0,4).filter(review=>Boolean(review?.check_in_id)).map(review=>({stars:review.stars,cleanliness_pct:review.cleanliness_pct,created_at:review.created_at})),
  }};
  const facts=[context.place.verification_label,context.place.freshness_label,context.place.cleanliness_pct!=null?`${Math.round(context.place.cleanliness_pct)}% cleanliness`:null,context.place.rating!=null?`${context.place.rating}/5 rating`:null].filter(Boolean).slice(0,3).join(' · ');
  return (await invokeOrganicAi('place_summary',context,'Give a concise visitor briefing from these current Kleenest facts.',facts?`At a glance: ${facts}.`:'Current Kleenest evidence for this location is still limited.')).answer;
}

export async function organicRouteSummary(route,stops=[]){
  const context={
    route:{distance_miles:route?.distanceMiles??null,duration_minutes:route?.durationMinutes??null,provider:text(route?.provider)},
    stops:stops.slice(0,12).map((stop,index)=>({order:index+1,name:text(stop?.name),verification_label:verificationLabel(stop),freshness_label:freshnessLabel(stop)})),
  };
  const core=[route?.distanceMiles!=null?`${route.distanceMiles} mi`:null,route?.durationMinutes!=null?`${route.durationMinutes} min`:null,`${stops.length} stop${stops.length===1?'':'s'}`].filter(Boolean).join(' · ');
  return (await invokeOrganicAi('route_summary',context,'Summarize this built route without changing the chosen order.',`Route brief: ${core}. Your stop order stays under your control.`)).answer;
}


export async function organicWeeklyRecap(summary){
  const context={week:{
    period_days:Number(summary?.periodDays||7),
    visits:Number(summary?.visitCount||0),
    places:Number(summary?.placeCount||0),
    verified_contributions:Number(summary?.verifiedVisitCount||0),
    reviews:Number(summary?.reviewedCount||0),
    review_ready:Number(summary?.reviewReadyCount||0),
    verification_available:Number(summary?.verificationAvailableCount||0),
  }};
  const w=context.week;
  return (await invokeOrganicAi('weekly_recap',context,'Summarize this account-scoped Kleenest week in one or two useful sentences. Mention unfinished contributions only when supported by the counts.',`Your last ${w.period_days} days: ${w.visits} visit${w.visits===1?'':'s'} across ${w.places} place${w.places===1?'':'s'}, with ${w.verified_contributions} verified visit${w.verified_contributions===1?'':'s'} and ${w.reviews} review${w.reviews===1?'':'s'}.`)).answer;
}

export async function organicBusinessInsight(signals=[],context={}){
  const clean=signals.map(value=>String(value||'').trim()).filter(Boolean).slice(0,6);
  const fallback=clean.length?`Current business signals: ${clean.slice(0,3).join(' · ')}.`:'No strong operational exception is visible in the current Kleenest metrics.';
  return (await invokeOrganicAi('business_insight',{signals:clean,...context},'Summarize the most actionable current business signal in one or two sentences. Use only supplied Kleenest metrics and do not invent causality.',fallback)).answer;
}
