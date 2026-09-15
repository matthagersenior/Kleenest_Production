import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type RestroomFacilityType='men'|'women'|'family'|'all_gender'|'single_occupancy'|'other';
export type RestroomFacility={
  id:string;
  location_id:string;
  facility_type:RestroomFacilityType;
  label:string|null;
  ordinal:number;
  floor_label:string|null;
  area_label:string|null;
  attributes:Record<string,unknown>;
  status:'active'|'temporarily_closed'|'closed';
  source:string;
  business_confirmed:boolean;
  verified_at:string|null;
  review_count:number;
  cleanliness_pct:number|null;
  freshest_observed_at:string|null;
};

export const RESTROOM_FACILITY_TYPES:RestroomFacilityType[]=['men','women','family','all_gender','single_occupancy','other'];

const TYPE_LABELS:Record<RestroomFacilityType,string>={
  men:"Men's",
  women:"Women's",
  family:'Family / companion',
  all_gender:'All-gender',
  single_occupancy:'Single-occupancy',
  other:'Restroom',
};

export function restroomFacilityTypeLabel(type:RestroomFacilityType){return TYPE_LABELS[type]||'Restroom';}

export function restroomFacilityLabel(facility:RestroomFacility){
  const base=facility.label?.trim()||TYPE_LABELS[facility.facility_type]||'Restroom';
  const where=[facility.area_label,facility.floor_label].filter(Boolean).join(' · ');
  return where?`${base} · ${where}`:base;
}

export async function listRestroomFacilities(locationId:string):Promise<RestroomFacility[]>{
  const id=String(locationId||'').trim();
  if(!id)return[];
  const{data,error}=await getKleenestSupabaseClient().rpc('list_location_restroom_facilities',{p_location_id:id});
  if(error)throw error;
  return Array.isArray(data)?data as RestroomFacility[]:[];
}

export type RestroomFacilitySummary={
  location_id:string;
  facility_count:number;
  facility_types:RestroomFacilityType[];
  business_confirmed_count:number;
  freshest_observed_at:string|null;
};

export async function listRestroomFacilitySummaries(locationIds:string[]):Promise<RestroomFacilitySummary[]>{
  const ids=[...new Set((locationIds||[]).map(String).filter(Boolean))].slice(0,200);
  if(!ids.length)return[];
  const{data,error}=await getKleenestSupabaseClient().rpc('list_restroom_facility_summaries',{p_location_ids:ids});
  if(error)throw error;
  return (Array.isArray(data)?data:[]).map((row:any)=>({
    location_id:String(row.location_id),
    facility_count:Number(row.facility_count||0),
    facility_types:Array.isArray(row.facility_types)?row.facility_types.map(String) as RestroomFacilityType[]:[],
    business_confirmed_count:Number(row.business_confirmed_count||0),
    freshest_observed_at:row.freshest_observed_at?String(row.freshest_observed_at):null,
  }));
}

export async function identifyRestroomFacility(locationId:string,facilityType:RestroomFacilityType,label?:string|null):Promise<RestroomFacility>{
  const{data,error}=await getKleenestSupabaseClient().rpc('identify_restroom_facility',{
    p_location_id:locationId,
    p_facility_type:facilityType,
    p_label:label?.trim()||null,
  });
  if(error)throw error;
  return data as RestroomFacility;
}

export async function assignCheckInRestroomFacility(checkInId:string,restroomFacilityId:string){
  const{data,error}=await getKleenestSupabaseClient().rpc('assign_check_in_restroom_facility',{
    p_check_in_id:checkInId,
    p_restroom_facility_id:restroomFacilityId,
  });
  if(error)throw error;
  return data;
}
