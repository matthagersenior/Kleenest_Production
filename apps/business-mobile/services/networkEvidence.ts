import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type BusinessNetworkEvidence={
  location_id:string;
  network_state:string;
  network_verified:boolean;
  business_claimed:boolean;
  evidence_score:number;
  verified_visits:number;
  verified_contributors:number;
  verified_reviews:number;
  photo_evidence_count:number;
  amenity_evidence_count:number;
  restroom_observation_count:number;
  latest_evidence_at:string|null;
};

export async function listBusinessNetworkEvidence(locationIds:string[]):Promise<BusinessNetworkEvidence[]>{
  const ids=[...new Set(locationIds.map(String).filter(Boolean))].slice(0,200);
  if(!ids.length)return[];
  const{data,error}=await getKleenestSupabaseClient().rpc('mobile_location_network_statuses',{p_location_ids:ids});
  if(error)throw error;
  return(Array.isArray(data)?data:[]).map((row:any)=>({
    location_id:String(row.location_id),
    network_state:String(row.network_state||'unknown'),
    network_verified:Boolean(row.network_verified),
    business_claimed:Boolean(row.business_claimed),
    evidence_score:Number(row.evidence_score||0),
    verified_visits:Number(row.verified_visits||0),
    verified_contributors:Number(row.verified_contributors||0),
    verified_reviews:Number(row.verified_reviews||0),
    photo_evidence_count:Number(row.photo_evidence_count||0),
    amenity_evidence_count:Number(row.amenity_evidence_count||0),
    restroom_observation_count:Number(row.restroom_observation_count||0),
    latest_evidence_at:row.latest_evidence_at||null,
  }));
}

export function businessNetworkEvidenceLine(evidence:BusinessNetworkEvidence|null|undefined){
  if(!evidence)return'No Kleenest community evidence yet';
  const parts=[
    evidence.verified_contributors?evidence.verified_contributors+' verified contributor'+(evidence.verified_contributors===1?'':'s'):null,
    evidence.verified_visits?evidence.verified_visits+' verified visit'+(evidence.verified_visits===1?'':'s'):null,
    evidence.verified_reviews?evidence.verified_reviews+' review'+(evidence.verified_reviews===1?'':'s'):null,
    evidence.photo_evidence_count?evidence.photo_evidence_count+' photo'+(evidence.photo_evidence_count===1?'':'s'):null,
    evidence.amenity_evidence_count?evidence.amenity_evidence_count+' amenit'+(evidence.amenity_evidence_count===1?'y':'ies'):null,
  ].filter(Boolean);
  return parts.length?parts.join(' · '):'No Kleenest community evidence yet';
}
