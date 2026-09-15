import { getKleenestSupabaseClient, listMobileFavoriteLocations } from '@kleenest/mobile-core';
import { listActiveObjectivesV2 } from './discoveryProgression';
import { readNearbyCache } from './nearbyCache';
import { readTrustMission } from './trustMissions';
import { getWeekInReview } from './weekInReview';

export type OrganicHeroKind=
  |'review_ready'|'active_mission'|'fresh_kleenest'|'saved_choice'|'top_ranked'
  |'next_objective'|'find_bathroom'|'share_knowledge'|'scan_qr';

export type OrganicHeroItem={
  id:string;
  kind:OrganicHeroKind;
  eyebrow:string;
  title:string;
  body:string;
  cta:string;
  route:string;
  meta?:string;
  score:number;
  locationId?:string|null;
};

export type OrganicHeroPolicy={
  surface_code:string;
  active:boolean;
  max_cards:number;
  allowed_kinds:string[];
  weights:Record<string,number>;
  swipe_enabled:boolean;
  dot_indicators:boolean;
  autoplay:boolean;
};

const DEFAULT_POLICY:OrganicHeroPolicy={
  surface_code:'consumer_home',
  active:true,
  max_cards:5,
  allowed_kinds:['review_ready','active_mission','fresh_kleenest','saved_choice','top_ranked','next_objective','find_bathroom','share_knowledge','scan_qr'],
  weights:{review_ready:100,active_mission:95,fresh_kleenest:88,saved_choice:80,top_ranked:75,next_objective:70,find_bathroom:60,share_knowledge:45,scan_qr:40},
  swipe_enabled:true,
  dot_indicators:true,
  autoplay:false,
};

const client=()=>getKleenestSupabaseClient();
const number=(value:any,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const idOf=(row:any)=>String(row?.location_id||row?.id||'');
const nameOf=(row:any)=>String(row?.name||row?.location_name||'Restroom');
const miles=(meters:any)=>Number.isFinite(Number(meters))?Number(meters)/1609.344:null;
const distanceLabel=(meters:any)=>{const value=miles(meters);return value==null?'':`${value.toFixed(value<10?1:0)} mi`;};
const rating=(row:any)=>number(row?.rating??row?.average_rating??row?.star_rating,0);
const latestEvidence=(row:any)=>{
  const values=[row?.network?.latest_evidence_at,row?.trust?.latest_verified_at,row?.trust?.latest_amenity_observed_at,row?.consumer_photo_created_at,row?.updated_at]
    .map((value:any)=>value?new Date(value).getTime():NaN).filter((value:number)=>Number.isFinite(value));
  return values.length?Math.max(...values):null;
};
const isFresh=(row:any,days=30)=>{const time=latestEvidence(row);return time!=null&&Date.now()-time<=days*86400000;};
const isKleenest=(row:any)=>Boolean(row?.kleenest_business||row?.business_tier||row?.network?.network_verified);
const locationMeta=(row:any)=>{
  const parts=[distanceLabel(row?.distance_meters),rating(row)>0?`${rating(row).toFixed(1)}★`:null,isFresh(row)?'fresh':null,isKleenest(row)?'Kleenest':null].filter(Boolean);
  return parts.join(' · ');
};

export async function getOrganicHeroPolicy(surfaceCode='consumer_home'):Promise<OrganicHeroPolicy>{
  try{
    const{data,error}=await client().rpc('consumer_hero_policy',{p_surface_code:surfaceCode});
    if(error)throw error;
    const raw:any=data||{};
    if(!raw?.surface_code)return DEFAULT_POLICY;
    return{
      surface_code:String(raw.surface_code),
      active:raw.active!==false,
      max_cards:Math.min(8,Math.max(1,number(raw.max_cards,5))),
      allowed_kinds:Array.isArray(raw.allowed_kinds)?raw.allowed_kinds.map(String):DEFAULT_POLICY.allowed_kinds,
      weights:raw.weights&&typeof raw.weights==='object'?raw.weights:DEFAULT_POLICY.weights,
      swipe_enabled:raw.swipe_enabled!==false,
      dot_indicators:raw.dot_indicators!==false,
      autoplay:raw.autoplay===true,
    };
  }catch{return DEFAULT_POLICY}
}

export async function buildConsumerHomeHeroes(signedIn:boolean){
  const policy=await getOrganicHeroPolicy('consumer_home');
  if(!policy.active)return{policy,items:[] as OrganicHeroItem[]};

  const [cache,week,mission,favorites,objectives]=await Promise.all([
    readNearbyCache().catch(()=>null),
    signedIn?getWeekInReview(7).catch(()=>null):Promise.resolve(null),
    signedIn?readTrustMission().catch(()=>null):Promise.resolve(null),
    signedIn?listMobileFavoriteLocations().catch(()=>[]):Promise.resolve([]),
    signedIn?listActiveObjectivesV2().catch(()=>[]):Promise.resolve([]),
  ]);

  const rows=Array.isArray(cache?.rows)?cache!.rows:[];
  const candidates:OrganicHeroItem[]=[];
  const weight=(kind:OrganicHeroKind)=>number(policy.weights?.[kind],DEFAULT_POLICY.weights[kind]||0);

  const reviewReady=week?.visits?.find((visit:any)=>visit.reviewReady&&!visit.reviewId);
  if(reviewReady)candidates.push({
    id:`review:${reviewReady.visitId}`,kind:'review_ready',eyebrow:'FINISH A FRESH VISIT',
    title:`Review ${reviewReady.locationName}`,
    body:'You already did the hard part. Add the quick cleanliness signal while the visit is still fresh.',
    cta:'Review now',route:`/location/${reviewReady.locationId}?review=1`,meta:'Verified visit ready',score:weight('review_ready'),locationId:reviewReady.locationId,
  });

  if(mission?.status==='active')candidates.push({
    id:`mission:${mission.locationId}`,kind:'active_mission',eyebrow:'YOUR NEXT MISSION',
    title:mission.locationName,
    body:mission.title||'Strengthen this restroom with useful real-world evidence.',
    cta:'Resume mission',route:`/location/${mission.locationId}?mission=1`,
    meta:[mission.priority?String(mission.priority).toUpperCase()+' priority':null,mission.rewardPoints?`+${mission.rewardPoints} bonus pts`:null].filter(Boolean).join(' · '),
    score:weight('active_mission'),locationId:mission.locationId,
  });

  const freshKleenest=rows.find((row:any)=>isKleenest(row)&&isFresh(row));
  if(freshKleenest){
    const id=idOf(freshKleenest);
    if(id)candidates.push({
      id:`fresh:${id}`,kind:'fresh_kleenest',eyebrow:'FRESH + KLEENEST',
      title:nameOf(freshKleenest),body:'Recent evidence and Kleenest network context make this a strong nearby option right now.',
      cta:'See why',route:`/location/${id}`,meta:locationMeta(freshKleenest),score:weight('fresh_kleenest'),locationId:id,
    });
  }

  const favorite=(Array.isArray(favorites)?favorites:[])[0] as any;
  if(favorite){
    const id=idOf(favorite);
    if(id)candidates.push({
      id:`saved:${id}`,kind:'saved_choice',eyebrow:'ONE OF YOUR CHOICES',
      title:nameOf(favorite),body:'You saved this place. Kleenest keeps your own choices visible instead of replacing them with an algorithm.',
      cta:'Open saved place',route:`/location/${id}`,meta:locationMeta(favorite),score:weight('saved_choice'),locationId:id,
    });
  }

  const ranked=[...rows].sort((a:any,b:any)=>number(a?.discovery_rank,999)-number(b?.discovery_rank,999)||rating(b)-rating(a))[0];
  if(ranked){
    const id=idOf(ranked);
    if(id)candidates.push({
      id:`ranked:${id}`,kind:'top_ranked',eyebrow:'TOP NEARBY FIT',
      title:nameOf(ranked),body:'This is currently the strongest nearby result from the same organic discovery signals used on Explore.',
      cta:'Open top result',route:`/location/${id}`,meta:locationMeta(ranked),score:weight('top_ranked'),locationId:id,
    });
  }

  const objective=(Array.isArray(objectives)?objectives:[])[0] as any;
  if(objective)candidates.push({
    id:`objective:${String(objective.id||objective.code||'next')}`,kind:'next_objective',eyebrow:'NEXT OBJECTIVE',
    title:String(objective.title||objective.name||objective.label||'Keep your Kleenest streak moving'),
    body:String(objective.description||objective.body||objective.prompt||'Your next progression opportunity is ready.'),
    cta:'Open progression',route:'/progress',meta:String(objective.kind||objective.objective_type||'').replaceAll('_',' '),score:weight('next_objective'),
  });

  candidates.push(
    {id:'find',kind:'find_bathroom',eyebrow:'FIND THE BEST BATHROOM',title:'What is useful near you right now?',body:'Search nearby or around any address, then compare freshness, Kleenest status, amenities, trust and distance.',cta:'Search the map',route:'/explore',meta:'Organic discovery',score:weight('find_bathroom')},
    {id:'knowledge',kind:'share_knowledge',eyebrow:'YOU ALREADY KNOW SOMETHING',title:'Add useful bathroom knowledge without pretending you are there.',body:'Contribute what you already know separately from verified visit evidence, so the network gets smarter without tainting trust.',cta:'Share what you know',route:'/discover',meta:'Knowledge ≠ verified visit',score:weight('share_knowledge')},
    {id:'qr',kind:'scan_qr',eyebrow:'KLEENEST QR',title:'A code can unlock the next useful action.',body:'Scan a Kleenest QR for location proof, access, a business action, a mission or another configured network workflow.',cta:'Scan QR',route:'/qr',meta:'Context-aware action',score:weight('scan_qr')},
  );

  const allowed=new Set(policy.allowed_kinds);
  const sorted=candidates.filter(item=>allowed.has(item.kind)).sort((a,b)=>b.score-a.score);
  const deduped:OrganicHeroItem[]=[];
  const seenLocations=new Set<string>();
  for(const item of sorted){
    if(item.locationId&&seenLocations.has(item.locationId))continue;
    deduped.push(item);
    if(item.locationId)seenLocations.add(item.locationId);
    if(deduped.length>=policy.max_cards)break;
  }
  return{policy,items:deduped};
}
