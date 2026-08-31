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

export function attachLocationTrust<T extends Record<string,any>>(rows:T[],summaries:LocationTrustSummary[]){
  const byId=new Map(summaries.map(summary=>[String(summary.location_id),summary]));
  return rows.map(row=>({...row,trust:byId.get(String(row.location_id||row.place_id||row.id))||null}));
}
