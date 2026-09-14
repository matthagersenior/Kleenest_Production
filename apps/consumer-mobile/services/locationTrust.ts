import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type LocationTrustSummary={
  location_id:string;
  verified_visit_count:number;
  verified_review_count:number;
  photo_evidence_count:number;
  amenity_evidence_count:number;
  latest_verified_at:string|null;
  latest_amenity_observed_at:string|null;
};

export type LocationTrustQuality={
  location_id:string;
  latest_evidence_at:string|null;
  freshness:'fresh'|'recent'|'aging'|'stale'|'unknown';
  stale:boolean;
  total_observations:number;
  contributor_count:number;
  recent_amenities:number;
  contradiction_count:number;
  needs_reverification:boolean;
  quality_score:number;
  generated_at:string|null;
};

const normalize=(row:any):LocationTrustSummary=>({
  location_id:String(row.location_id),
  verified_visit_count:Number(row.verified_visit_count||0),
  verified_review_count:Number(row.verified_review_count||0),
  photo_evidence_count:Number(row.photo_evidence_count||0),
  amenity_evidence_count:Number(row.amenity_evidence_count||0),
  latest_verified_at:row.latest_verified_at||null,
  latest_amenity_observed_at:row.latest_amenity_observed_at||null,
});

export async function listLocationTrustSummaries(locationIds:string[]){
  const ids=[...new Set(locationIds.filter(Boolean).map(String))].slice(0,100);
  if(!ids.length)return[];
  const{data,error}=await getKleenestSupabaseClient().rpc('mobile_location_trust_summaries',{p_location_ids:ids});
  if(error)throw error;
  return(Array.isArray(data)?data:[]).map(normalize);
}

export async function getLocationTrustSummary(locationId:string){
  const rows=await listLocationTrustSummaries([locationId]);
  return rows[0]||null;
}

export async function getLocationTrustQuality(locationId:string):Promise<LocationTrustQuality|null>{
  const{data,error}=await getKleenestSupabaseClient().rpc('get_location_trust_quality',{p_location_id:locationId});
  if(error)throw error;
  if(!data||typeof data!=='object')return null;
  const row=data as any;
  return{
    location_id:String(row.location_id||locationId),latest_evidence_at:row.latest_evidence_at||null,
    freshness:row.freshness||'unknown',stale:Boolean(row.stale),total_observations:Number(row.total_observations||0),
    contributor_count:Number(row.contributor_count||0),recent_amenities:Number(row.recent_amenities||0),
    contradiction_count:Number(row.contradiction_count||0),needs_reverification:Boolean(row.needs_reverification),
    quality_score:Number(row.quality_score||0),generated_at:row.generated_at||null,
  };
}

export function attachLocationTrust<T extends Record<string,any>>(rows:T[],summaries:LocationTrustSummary[]){
  const byId=new Map(summaries.map(summary=>[String(summary.location_id),summary]));
  return rows.map(row=>({...row,trust:byId.get(String(row.location_id||row.place_id||row.id))||null}));
}


export type LocationNetworkStatus={
  location_id:string;
  network_state:'unknown'|'building'|'network_verified'|'claimed';
  network_verified:boolean;
  business_claimed:boolean;
  evidence_score:number;
  evidence_type_count:number;
  verified_visits:number;
  verified_contributors:number;
  verified_reviews:number;
  review_contributors:number;
  photo_evidence_count:number;
  amenity_observation_count:number;
  amenity_evidence_count:number;
  restroom_observation_count:number;
  open_conflict_count:number;
  latest_evidence_at:string|null;
  verification_policy:string;
};

const normalizeNetwork=(row:any):LocationNetworkStatus=>({
  location_id:String(row.location_id),
  network_state:(['building','network_verified','claimed'].includes(String(row.network_state))?String(row.network_state):'unknown') as LocationNetworkStatus['network_state'],
  network_verified:Boolean(row.network_verified),
  business_claimed:Boolean(row.business_claimed),
  evidence_score:Number(row.evidence_score||0),
  evidence_type_count:Number(row.evidence_type_count||0),
  verified_visits:Number(row.verified_visits||0),
  verified_contributors:Number(row.verified_contributors||0),
  verified_reviews:Number(row.verified_reviews||0),
  review_contributors:Number(row.review_contributors||0),
  photo_evidence_count:Number(row.photo_evidence_count||0),
  amenity_observation_count:Number(row.amenity_observation_count||0),
  amenity_evidence_count:Number(row.amenity_evidence_count||0),
  restroom_observation_count:Number(row.restroom_observation_count||0),
  open_conflict_count:Number(row.open_conflict_count||0),
  latest_evidence_at:row.latest_evidence_at||null,
  verification_policy:String(row.verification_policy||'community_evidence_v1'),
});

export async function listLocationNetworkStatuses(locationIds:string[]){
  const ids=[...new Set(locationIds.filter(Boolean).map(String))].slice(0,200);
  if(!ids.length)return[];
  const{data,error}=await getKleenestSupabaseClient().rpc('mobile_location_network_statuses',{p_location_ids:ids});
  if(error)throw error;
  return(Array.isArray(data)?data:[]).map(normalizeNetwork);
}

export async function getLocationNetworkStatus(locationId:string){
  const rows=await listLocationNetworkStatuses([locationId]);
  return rows[0]||null;
}

export function attachLocationNetwork<T extends Record<string,any>>(rows:T[],statuses:LocationNetworkStatus[]){
  const byId=new Map(statuses.map(status=>[String(status.location_id),status]));
  return rows.map(row=>{
    const network=byId.get(String(row.location_id||row.place_id||row.id))||null;
    return network?{...row,network,network_verified:network.network_verified,business_claimed:network.business_claimed,network_state:network.network_state}:row;
  });
}

export function networkEvidenceSummary(network:LocationNetworkStatus|null|undefined){
  if(!network)return'Community evidence is still building';
  const parts=[
    network.verified_contributors?(network.verified_contributors+' verified contributor'+(network.verified_contributors===1?'':'s')):null,
    network.verified_visits?(network.verified_visits+' verified visit'+(network.verified_visits===1?'':'s')):null,
    network.verified_reviews?(network.verified_reviews+' review'+(network.verified_reviews===1?'':'s')):null,
    network.photo_evidence_count?(network.photo_evidence_count+' photo'+(network.photo_evidence_count===1?'':'s')):null,
    network.amenity_evidence_count?(network.amenity_evidence_count+' amenit'+(network.amenity_evidence_count===1?'y':'ies')):null,
  ].filter(Boolean);
  return parts.length?parts.join(' · '):'Community evidence is still building';
}
