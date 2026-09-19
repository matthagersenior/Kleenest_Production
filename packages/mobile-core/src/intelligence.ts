import { getKleenestSupabaseClient } from './index';

export type IntelligenceRecord=Record<string,any>;
export type KleenestNowProjection=IntelligenceRecord;
export type FacilityPassportProjection=IntelligenceRecord;
export type VerifiedAccessProjection=IntelligenceRecord;
export type LocationIntelligenceExplanation=IntelligenceRecord;
export type LocationProofCard=IntelligenceRecord;
export type RouteReliefCoverage=IntelligenceRecord;
export type OwnerIntelligenceOverview=IntelligenceRecord;
export type OwnerProductTruth=IntelligenceRecord;
export type IntelligencePolicy=IntelligenceRecord;

export const BATHROOM_FIT_OPTIONS=[
  ['accessible','Accessible'],['changing_table','Changing table'],['family_restroom','Family restroom'],['all_gender','All-gender'],['single_occupancy','Single occupancy'],['hands_free_door','Hands-free door'],['toilet_seat_covers','Toilet seat covers'],['touchless_fixtures','Touchless fixtures'],['quiet_private','Quiet / private']
] as const;
export type BathroomFitKey=(typeof BATHROOM_FIT_OPTIONS)[number][0];
export type BathroomFitPreferences=Record<BathroomFitKey,boolean>;
export type RestroomServiceEvent='cleaned'|'restocked'|'inspected'|'repaired'|'deep_cleaned'|'renovated'|'closed'|'reopened';
export type BusinessIntelligenceLocation={id:string;name?:string;address?:string;city?:string;state?:string;claimed_business_id?:string|null;business_id?:string|null};

function client(){return getKleenestSupabaseClient();}
export async function intelligenceRpc<T=any>(name:string,args:Record<string,unknown>={}){
  const{data,error}=await client().rpc(name,args);
  if(error)throw error;
  return data as T;
}

export function getKleenestNow(locationId:string){return intelligenceRpc<KleenestNowProjection>('location_kleenest_now',{p_location_id:locationId});}
export function getFacilityPassport(locationId:string){return intelligenceRpc<FacilityPassportProjection>('location_facility_passport',{p_location_id:locationId});}
export function getVerifiedAccess(locationId:string){return intelligenceRpc<VerifiedAccessProjection>('kleenest_verified_access',{p_location_id:locationId});}
export function getBathroomFit(locationId:string){return intelligenceRpc<IntelligenceRecord>('location_bathroom_fit',{p_location_id:locationId});}
export function getLocationExplanation(locationId:string){return intelligenceRpc<LocationIntelligenceExplanation>('location_intelligence_explanation',{p_location_id:locationId});}
export function getLocationProofCard(locationId:string){return intelligenceRpc<LocationProofCard>('location_proof_card',{p_location_id:locationId});}

export function setLocationTrustWatch(locationId:string,enabled=true){return intelligenceRpc('consumer_location_trust_watch',{p_location_id:locationId,p_enabled:enabled});}
export function getLocationTrustChanges(limit=20){return intelligenceRpc<IntelligenceRecord[]>('consumer_location_trust_changes',{p_limit:limit});}
export function getConsumerRouteConfidence(routeId:string){return intelligenceRpc<IntelligenceRecord>('consumer_route_confidence',{p_route_id:routeId});}
export async function getBathroomFitPreferences(){return await intelligenceRpc<Partial<BathroomFitPreferences>>('consumer_get_bathroom_fit_preferences')||{};}
export function updateBathroomFitPreferences(preferences:Partial<BathroomFitPreferences>){return intelligenceRpc<BathroomFitPreferences>('consumer_update_bathroom_fit_preferences',{p_preferences:preferences});}
export async function getConsumerIntelligence(locationId:string){
  const[now,passport,access,fit,prefs]=await Promise.allSettled([
    getKleenestNow(locationId),getFacilityPassport(locationId),getVerifiedAccess(locationId),getBathroomFit(locationId),getBathroomFitPreferences()
  ]);
  const value=<T>(result:PromiseSettledResult<T>,fallback:T)=>result.status==='fulfilled'?result.value:fallback;
  return{
    now:value(now,{} as KleenestNowProjection),
    passport:value(passport,{} as FacilityPassportProjection),
    access:value(access,{} as VerifiedAccessProjection),
    fit:value(fit,{} as IntelligenceRecord),
    preferences:value(prefs,{} as Partial<BathroomFitPreferences>),
  };
}

export async function listBusinessIntelligenceLocations(businessId:string){
  const data:any=await intelligenceRpc('business_list_locations',{p_business_id:businessId});
  const rows=Array.isArray(data)?data:Array.isArray(data?.locations)?data.locations:[];
  return rows as BusinessIntelligenceLocation[];
}
export function recordRestroomServiceUpdate(businessId:string,locationId:string,eventKind:RestroomServiceEvent,note='',proofUrl:string|null=null,restroomFacilityId:string|null=null){
  return intelligenceRpc('business_record_restroom_service_update',{p_business_id:businessId,p_location_id:locationId,p_event_kind:eventKind,p_note:note.trim()||null,p_proof_url:proofUrl,p_restroom_facility_id:restroomFacilityId});
}
export function getBusinessTrustRecovery(businessId:string,limit=40){return intelligenceRpc<IntelligenceRecord[]>('business_trust_recovery',{p_business_id:businessId,p_limit:limit});}
export function getBusinessFixFirstQueue(businessId:string,limit=20){return intelligenceRpc<IntelligenceRecord[]>('business_fix_first_queue',{p_business_id:businessId,p_limit:limit});}
export function getBusinessLocalFreshnessBenchmark(businessId:string){return intelligenceRpc<IntelligenceRecord[]>('business_local_freshness_benchmark',{p_business_id:businessId});}
export async function getBusinessIntelligenceLayer(businessId:string){
  const[locations,recovery,fixFirst,benchmarks]=await Promise.all([
    listBusinessIntelligenceLocations(businessId),getBusinessTrustRecovery(businessId),getBusinessFixFirstQueue(businessId),getBusinessLocalFreshnessBenchmark(businessId)
  ]);
  return{locations,recovery:Array.isArray(recovery)?recovery:[],fixFirst:Array.isArray(fixFirst)?fixFirst:[],benchmarks:Array.isArray(benchmarks)?benchmarks:[]};
}

export function getFleetRouteReliefCoverage(businessId:string,routeId:string){return intelligenceRpc<RouteReliefCoverage>('fleet_route_relief_coverage',{p_business_id:businessId,p_route_id:routeId});}

export function getOwnerIntelligenceOverview(){return intelligenceRpc<OwnerIntelligenceOverview>('owner_intelligence_overview');}
export function getOwnerProductTruth(){return intelligenceRpc<OwnerProductTruth>('owner_product_truth');}
export function explainOwnerLocationIntelligence(locationId:string){return intelligenceRpc<LocationIntelligenceExplanation>('owner_explain_location_intelligence',{p_location_id:locationId});}
export function getIntelligencePolicy(){return intelligenceRpc<IntelligencePolicy>('owner_get_intelligence_policy');}
export function updateIntelligencePolicy(patch:Record<string,unknown>){return intelligenceRpc<IntelligencePolicy>('owner_update_intelligence_policy',{p_patch:patch});}
export async function listIntelligenceLocationCandidates(){
  const{data,error}=await client().from('locations').select('id,name,city,state,updated_at').order('updated_at',{ascending:false}).limit(30);
  if(error)throw error;
  return data||[];
}
export async function getOwnerIntelligenceWorkspace(){
  const[overview,policy,locations,productTruth]=await Promise.all([
    getOwnerIntelligenceOverview(),getIntelligencePolicy(),listIntelligenceLocationCandidates(),getOwnerProductTruth()
  ]);
  return{overview,policy,locations,productTruth};
}
