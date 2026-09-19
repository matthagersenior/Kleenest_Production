import { getKleenestSupabaseClient } from './index';

export const INTELLIGENCE_CONTRACT_VERSION=1 as const;
export const INTELLIGENCE_CACHE_TTL_MS=15_000;
export const INTELLIGENCE_STALE_TTL_MS=60_000;

export type IntelligenceRecord=Record<string,unknown>;
export type FreshnessLabel='very_fresh'|'fresh'|'aging'|'stale'|string;
export type ConfidenceLevel='high'|'medium'|'low'|'unknown'|string;

export interface KleenestNowProjection {
  location_id:string;
  name?:string|null;
  freshness_score:number;
  freshness_label:FreshnessLabel;
  freshness_provenance:string;
  freshness_at?:string|null;
  confidence_score:number;
  confidence_level:ConfidenceLevel;
  independent_confirmations:number;
  recent_conflicts:number;
  bathroom_status:string;
  availability:string;
  latest_service?:{
    event_kind:string;
    reported_at:string;
    provenance:string;
    freshness_score:number;
  }|null;
  explanation?:{freshness?:string;confidence?:string};
  generated_at:string;
}

export interface FacilityPassportProjection {
  location:{
    id:string;
    name?:string|null;
    address?:string|null;
    city?:string|null;
    state?:string|null;
    place_type?:string|null;
    claimed:boolean;
  };
  now:KleenestNowProjection;
  summary:{
    reviews:number;
    observations:number;
    amenities:number;
    service_updates:number;
    resolved_recovery_cases:number;
  };
  milestones:Array<{
    kind:string;
    occurred_at:string|null;
    label:string;
    provenance:string;
    [key:string]:unknown;
  }>;
  generated_at:string;
}

export interface VerifiedAccessProjection {
  allowed:boolean;
  source:string;
  reason:string;
  partner_program_id?:string|null;
  expires_at?:string|null;
  checked_at?:string|null;
}

export interface BathroomFitProjection {
  score:number|null;
  requested:string[];
  matched:string[];
  missing:string[];
  reason:string;
}

export interface LocationIntelligenceExplanation {
  location:{id:string;name?:string|null;address?:string|null;city?:string|null;state?:string|null};
  now:KleenestNowProjection;
  rationale:string[];
  source_counts:Record<string,number>;
  recent_evidence:Array<{
    kind:string;
    provenance:string;
    observed_at:string;
    confidence:number;
    source_type:string;
    [key:string]:unknown;
  }>;
  watched?:boolean;
  evidence?:IntelligenceRecord[];
  policy?:IntelligenceRecord;
  facility_passport?:FacilityPassportProjection;
  generated_at:string;
}

export interface LocationProofCard {
  version:number;
  location_id:string;
  name?:string|null;
  address?:string|null;
  city?:string|null;
  state?:string|null;
  freshness_score:number;
  freshness_label:string;
  confidence_score:number;
  confidence_level:string;
  freshness_provenance:string;
  independent_confirmations:number;
  recent_conflicts:number;
  evidence_age_days:number|null;
  bathroom_status:string;
  availability:string;
  amenities:string[];
  deep_link:string;
  share_text:string;
  generated_at:string;
}

export interface CoverageMissionProjection {
  kind:string;
  location_id:string;
  name?:string;
  title:string;
  detail:string;
  mission_action:string;
  mission_value:number;
  xp_suggestion:number;
}

export interface RouteReliefCoverage {
  route_id?:string;
  confidence_label?:string;
  coverage_pct?:number;
  trusted_stop_count?:number;
  total_stops?:number;
  longest_uncovered_stops?:number;
  longest_uncovered_minutes_estimate?:number;
  rationale?:string;
  coverage_mission?:CoverageMissionProjection|null;
  stops?:IntelligenceRecord[];
  generated_at?:string;
  [key:string]:unknown;
}

export interface OwnerIntelligenceOverview {
  platform_graph:Record<string,number>;
  launch_readiness:IntelligenceRecord[];
  thresholds:IntelligenceRecord;
  generated_at:string;
}
export interface OwnerProductTruth {
  counts:{live_enabled?:number;hidden_disabled?:number;insufficient_data?:number;degraded_failing?:number;[key:string]:unknown};
  latest_audit?:IntelligenceRecord|null;
  changed_24h?:IntelligenceRecord[];
  degraded?:IntelligenceRecord[];
  generated_at:string;
}
export interface IntelligencePolicy {
  service_min_interval_minutes?:number;
  launch?:{
    freshness_min?:number;
    confidence_min?:number;
    fresh_location_pct_target?:number;
    claimed_location_pct_target?:number;
    [key:string]:unknown;
  };
  [key:string]:unknown;
}
export interface OwnerIntelligenceHealth {
  contract_version:number;
  revision_rows:number;
  latest_revision:number;
  latest_change_at?:string|null;
  outbox_backlog:number;
  oldest_outbox_age_seconds:number;
  changes_24h:number;
  device_evidence_24h:number;
  generated_at:string;
}
export interface LocationIntelligenceBundle {
  contract_version:number;
  location_id:string;
  revision:number;
  now?:KleenestNowProjection|null;
  passport?:FacilityPassportProjection|null;
  access?:VerifiedAccessProjection|null;
  fit?:BathroomFitProjection|null;
  proof?:LocationProofCard|null;
  explanation?:LocationIntelligenceExplanation|null;
  generated_at:string;
}
export interface BusinessIntelligenceBundle {
  contract_version:number;
  business_id:string;
  revision:number;
  locations:BusinessIntelligenceLocation[];
  recovery:IntelligenceRecord[];
  fix_first:IntelligenceRecord[];
  benchmarks:IntelligenceRecord[];
  generated_at:string;
}
export interface OwnerIntelligenceBundle {
  contract_version:number;
  overview:OwnerIntelligenceOverview;
  policy:IntelligencePolicy;
  product_truth:OwnerProductTruth;
  health:OwnerIntelligenceHealth;
  locations:Array<{id:string;name?:string;city?:string;state?:string;updated_at?:string;revision?:number}>;
  generated_at:string;
}

export const BATHROOM_FIT_OPTIONS=[
  ['accessible','Accessible'],['changing_table','Changing table'],['family_restroom','Family restroom'],['all_gender','All-gender'],['single_occupancy','Single occupancy'],['hands_free_door','Hands-free door'],['toilet_seat_covers','Toilet seat covers'],['touchless_fixtures','Touchless fixtures'],['quiet_private','Quiet / private']
] as const;
export type BathroomFitKey=(typeof BATHROOM_FIT_OPTIONS)[number][0];
export type BathroomFitPreferences=Record<BathroomFitKey,boolean>;
export type RestroomServiceEvent='cleaned'|'restocked'|'inspected'|'repaired'|'deep_cleaned'|'renovated'|'closed'|'reopened';
export type BusinessIntelligenceLocation={id:string;name?:string;address?:string;city?:string;state?:string;claimed_business_id?:string|null;business_id?:string|null};

function client(){return getKleenestSupabaseClient();}
export async function intelligenceRpc<T=unknown>(name:string,args:Record<string,unknown>={}){
  const{data,error}=await client().rpc(name,args);
  if(error)throw error;
  return data as T;
}

type CacheRecord={value:unknown;freshUntil:number;staleUntil:number};
const intelligenceCache=new Map<string,CacheRecord>();
export const inflightIntelligenceRequests=new Map<string,Promise<unknown>>();

async function cachedIntelligence<T>(key:string,load:()=>Promise<T>):Promise<T>{
  const now=Date.now(),cached=intelligenceCache.get(key);
  if(cached&&cached.freshUntil>now)return cached.value as T;
  const existing=inflightIntelligenceRequests.get(key);
  if(cached&&cached.staleUntil>now){
    if(!existing){
      const refresh=load().then(value=>{
        const time=Date.now();
        intelligenceCache.set(key,{value,freshUntil:time+INTELLIGENCE_CACHE_TTL_MS,staleUntil:time+INTELLIGENCE_STALE_TTL_MS});
        return value;
      }).finally(()=>inflightIntelligenceRequests.delete(key));
      inflightIntelligenceRequests.set(key,refresh as Promise<unknown>);
    }
    return cached.value as T;
  }
  if(existing)return existing as Promise<T>;
  const request=load().then(value=>{
    const time=Date.now();
    intelligenceCache.set(key,{value,freshUntil:time+INTELLIGENCE_CACHE_TTL_MS,staleUntil:time+INTELLIGENCE_STALE_TTL_MS});
    return value;
  }).finally(()=>inflightIntelligenceRequests.delete(key));
  inflightIntelligenceRequests.set(key,request as Promise<unknown>);
  return request;
}

export function invalidateIntelligenceCache(subject?:string){
  if(!subject){intelligenceCache.clear();return;}
  for(const key of [...intelligenceCache.keys()])if(key.includes(subject))intelligenceCache.delete(key);
}

export function getLocationIntelligenceBundle(locationId:string,sections:string[]=['now','passport','access','fit','proof','explanation'],fresh=false){
  const normalized=[...new Set(sections.map(String).map(v=>v.trim()).filter(Boolean))].sort();
  const key=`location:${locationId}:${normalized.join(',')}`;
  const load=()=>intelligenceRpc<LocationIntelligenceBundle>('location_intelligence_bundle',{p_location_id:locationId,p_sections:normalized});
  if(fresh){invalidateIntelligenceCache(locationId);return load();}
  return cachedIntelligence(key,load);
}
export function getLocationIntelligenceBatch(locationIds:string[],sections:string[]=['now','proof']){
  const ids=[...new Set(locationIds.map(String).filter(Boolean))].slice(0,100);
  const normalized=[...new Set(sections.map(String).map(v=>v.trim()).filter(Boolean))].sort();
  const key=`batch:${ids.join('|')}:${normalized.join(',')}`;
  return cachedIntelligence(key,()=>intelligenceRpc<LocationIntelligenceBundle[]>('location_intelligence_batch',{p_location_ids:ids,p_sections:normalized}));
}
export function getBusinessIntelligenceBundle(businessId:string,fresh=false){
  const key=`business:${businessId}:bundle`;
  const load=()=>intelligenceRpc<BusinessIntelligenceBundle>('business_intelligence_bundle',{p_business_id:businessId});
  if(fresh){invalidateIntelligenceCache(businessId);return load();}
  return cachedIntelligence(key,load);
}
export function getOwnerIntelligenceBundle(fresh=false){
  const key='owner:intelligence:bundle';
  const load=()=>intelligenceRpc<OwnerIntelligenceBundle>('owner_intelligence_bundle');
  if(fresh){invalidateIntelligenceCache('owner:');return load();}
  return cachedIntelligence(key,load);
}
export function getOwnerIntelligenceHealth(){return intelligenceRpc<OwnerIntelligenceHealth>('owner_intelligence_health');}

export function getKleenestNow(locationId:string){return intelligenceRpc<KleenestNowProjection>('location_kleenest_now',{p_location_id:locationId});}
export function getFacilityPassport(locationId:string){return intelligenceRpc<FacilityPassportProjection>('location_facility_passport',{p_location_id:locationId});}
export function getVerifiedAccess(locationId:string){return intelligenceRpc<VerifiedAccessProjection>('kleenest_verified_access',{p_location_id:locationId});}
export function getBathroomFit(locationId:string){return intelligenceRpc<BathroomFitProjection>('location_bathroom_fit',{p_location_id:locationId});}
export function getLocationExplanation(locationId:string){return intelligenceRpc<LocationIntelligenceExplanation>('location_intelligence_explanation',{p_location_id:locationId});}
export function getLocationProofCard(locationId:string){return intelligenceRpc<LocationProofCard>('location_proof_card',{p_location_id:locationId});}

export function setLocationTrustWatch(locationId:string,enabled=true){return intelligenceRpc('consumer_location_trust_watch',{p_location_id:locationId,p_enabled:enabled});}
export function getLocationTrustChanges(limit=20){return intelligenceRpc<IntelligenceRecord[]>('consumer_location_trust_changes',{p_limit:limit});}
export function getConsumerRouteConfidence(routeId:string){return intelligenceRpc<RouteReliefCoverage>('consumer_route_confidence',{p_route_id:routeId});}
export async function getBathroomFitPreferences(){return await intelligenceRpc<Partial<BathroomFitPreferences>>('consumer_get_bathroom_fit_preferences')||{};}
export async function updateBathroomFitPreferences(preferences:Partial<BathroomFitPreferences>){
  const result=await intelligenceRpc<BathroomFitPreferences>('consumer_update_bathroom_fit_preferences',{p_preferences:preferences});
  invalidateIntelligenceCache('location:');
  return result;
}
export async function getConsumerIntelligence(locationId:string){
  const[bundle,prefs]=await Promise.allSettled([
    getLocationIntelligenceBundle(locationId,['now','passport','access','fit']),
    getBathroomFitPreferences()
  ]);
  const projected=bundle.status==='fulfilled'?bundle.value:null;
  return{
    now:projected?.now||{} as KleenestNowProjection,
    passport:projected?.passport||{} as FacilityPassportProjection,
    access:projected?.access||{} as VerifiedAccessProjection,
    fit:projected?.fit||{} as BathroomFitProjection,
    preferences:prefs.status==='fulfilled'?prefs.value:{},
    revision:projected?.revision??0,
  };
}

export async function listBusinessIntelligenceLocations(businessId:string){
  const bundle=await getBusinessIntelligenceBundle(businessId);
  return Array.isArray(bundle.locations)?bundle.locations:[];
}
export async function recordRestroomServiceUpdate(businessId:string,locationId:string,eventKind:RestroomServiceEvent,note='',proofUrl:string|null=null,restroomFacilityId:string|null=null){
  const result=await intelligenceRpc('business_record_restroom_service_update',{p_business_id:businessId,p_location_id:locationId,p_event_kind:eventKind,p_note:note.trim()||null,p_proof_url:proofUrl,p_restroom_facility_id:restroomFacilityId});
  invalidateIntelligenceCache(locationId);invalidateIntelligenceCache(businessId);
  return result;
}
export function getBusinessTrustRecovery(businessId:string,limit=40){return intelligenceRpc<IntelligenceRecord[]>('business_trust_recovery',{p_business_id:businessId,p_limit:limit});}
export function getBusinessFixFirstQueue(businessId:string,limit=20){return intelligenceRpc<IntelligenceRecord[]>('business_fix_first_queue',{p_business_id:businessId,p_limit:limit});}
export function getBusinessLocalFreshnessBenchmark(businessId:string){return intelligenceRpc<IntelligenceRecord[]>('business_local_freshness_benchmark',{p_business_id:businessId});}
export async function getBusinessIntelligenceLayer(businessId:string){
  const bundle=await getBusinessIntelligenceBundle(businessId);
  return{locations:bundle.locations||[],recovery:bundle.recovery||[],fixFirst:bundle.fix_first||[],benchmarks:bundle.benchmarks||[],revision:bundle.revision||0};
}

export function getFleetRouteReliefCoverage(businessId:string,routeId:string){return intelligenceRpc<RouteReliefCoverage>('fleet_route_relief_coverage',{p_business_id:businessId,p_route_id:routeId});}

export function getOwnerIntelligenceOverview(){return intelligenceRpc<OwnerIntelligenceOverview>('owner_intelligence_overview');}
export function getOwnerProductTruth(){return intelligenceRpc<OwnerProductTruth>('owner_product_truth');}
export function explainOwnerLocationIntelligence(locationId:string){return intelligenceRpc<LocationIntelligenceExplanation>('owner_explain_location_intelligence',{p_location_id:locationId});}
export function getIntelligencePolicy(){return intelligenceRpc<IntelligencePolicy>('owner_get_intelligence_policy');}
export async function updateIntelligencePolicy(patch:Record<string,unknown>){
  const result=await intelligenceRpc<IntelligencePolicy>('owner_update_intelligence_policy',{p_patch:patch});
  invalidateIntelligenceCache();
  return result;
}
export async function listIntelligenceLocationCandidates(){
  const bundle=await getOwnerIntelligenceBundle();
  return Array.isArray(bundle.locations)?bundle.locations:[];
}
export async function getOwnerIntelligenceWorkspace(){
  const bundle=await getOwnerIntelligenceBundle();
  return{overview:bundle.overview,policy:bundle.policy,locations:bundle.locations,productTruth:bundle.product_truth,health:bundle.health,contractVersion:bundle.contract_version};
}
