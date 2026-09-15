import { getSupabase } from '../lib/supabase.js';

export const RESTROOM_FACILITY_TYPES=['men','women','family','all_gender','single_occupancy','other'];

const TYPE_LABELS={
  men:"Men's",
  women:"Women's",
  family:'Family / companion',
  all_gender:'All-gender',
  single_occupancy:'Single-occupancy',
  other:'Restroom',
};

export function restroomFacilityTypeLabel(type){return TYPE_LABELS[type]||'Restroom';}

export function restroomFacilityLabel(facility){
  const base=String(facility?.label||'').trim()||TYPE_LABELS[facility?.facility_type]||'Restroom';
  const where=[facility?.area_label,facility?.floor_label].filter(Boolean).join(' · ');
  return where?`${base} · ${where}`:base;
}

export async function listRestroomFacilities(locationId){
  if(!locationId)return[];
  const{data,error}=await getSupabase().rpc('list_location_restroom_facilities',{p_location_id:locationId});
  if(error)throw error;
  return Array.isArray(data)?data:[];
}

export async function listRestroomFacilitySummaries(locationIds){
  const ids=[...new Set((locationIds||[]).map(String).filter(Boolean))].slice(0,200);
  if(!ids.length)return[];
  const{data,error}=await getSupabase().rpc('list_restroom_facility_summaries',{p_location_ids:ids});
  if(error)throw error;
  return Array.isArray(data)?data:[];
}

export async function identifyRestroomFacility(locationId,facilityType,label=null){
  const{data,error}=await getSupabase().rpc('identify_restroom_facility',{
    p_location_id:locationId,
    p_facility_type:facilityType,
    p_label:String(label||'').trim()||null,
  });
  if(error)throw error;
  return data;
}

export async function assignCheckInRestroomFacility(checkInId,restroomFacilityId){
  if(!checkInId||!restroomFacilityId)return null;
  const{data,error}=await getSupabase().rpc('assign_check_in_restroom_facility',{
    p_check_in_id:checkInId,
    p_restroom_facility_id:restroomFacilityId,
  });
  if(error)throw error;
  return data;
}
