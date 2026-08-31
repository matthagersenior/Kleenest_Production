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
