import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc<T=any>(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data as T;}

export type RestroomServiceEvent='cleaned'|'restocked'|'inspected'|'repaired'|'deep_cleaned'|'renovated'|'closed'|'reopened';
export type BusinessIntelligenceLocation={id:string;name?:string;address?:string;city?:string;state?:string;claimed_business_id?:string|null;business_id?:string|null};

export async function listServiceFreshnessLocations(businessId:string){
  const data:any=await rpc('business_list_locations',{p_business_id:businessId});
  const rows=Array.isArray(data)?data:Array.isArray(data?.locations)?data.locations:[];
  return rows as BusinessIntelligenceLocation[];
}
export function recordRestroomServiceUpdate(businessId:string,locationId:string,eventKind:RestroomServiceEvent,note='',proofUrl:string|null=null,restroomFacilityId:string|null=null){
  return rpc('business_record_restroom_service_update',{p_business_id:businessId,p_location_id:locationId,p_event_kind:eventKind,p_note:note.trim()||null,p_proof_url:proofUrl,p_restroom_facility_id:restroomFacilityId});
}
export function getLocationKleenestNow(locationId:string){return rpc('location_kleenest_now',{p_location_id:locationId});}
export function getLocationIntelligenceExplanation(locationId:string){return rpc('location_intelligence_explanation',{p_location_id:locationId});}
export function getBusinessTrustRecovery(businessId:string,limit=40){return rpc<any[]>('business_trust_recovery',{p_business_id:businessId,p_limit:limit});}
export function getBusinessFixFirstQueue(businessId:string,limit=20){return rpc<any[]>('business_fix_first_queue',{p_business_id:businessId,p_limit:limit});}
export function getBusinessLocalFreshnessBenchmark(businessId:string){return rpc<any[]>('business_local_freshness_benchmark',{p_business_id:businessId});}
export async function getBusinessIntelligenceLayer(businessId:string){
  const[locations,recovery,fixFirst,benchmarks]=await Promise.all([
    listServiceFreshnessLocations(businessId),getBusinessTrustRecovery(businessId),getBusinessFixFirstQueue(businessId),getBusinessLocalFreshnessBenchmark(businessId)
  ]);
  return{locations,recovery:Array.isArray(recovery)?recovery:[],fixFirst:Array.isArray(fixFirst)?fixFirst:[],benchmarks:Array.isArray(benchmarks)?benchmarks:[]};
}
