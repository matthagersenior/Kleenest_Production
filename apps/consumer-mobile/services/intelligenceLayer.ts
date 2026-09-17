import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc<T=any>(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data as T;}

export const BATHROOM_FIT_OPTIONS=[
  ['accessible','Accessible'],['changing_table','Changing table'],['family_restroom','Family restroom'],['all_gender','All-gender'],['single_occupancy','Single occupancy'],['hands_free_door','Hands-free door'],['toilet_seat_covers','Toilet seat covers'],['touchless_fixtures','Touchless fixtures'],['quiet_private','Quiet / private']
] as const;
export type BathroomFitKey=(typeof BATHROOM_FIT_OPTIONS)[number][0];
export type BathroomFitPreferences=Record<BathroomFitKey,boolean>;

export function getKleenestNow(locationId:string){return rpc('location_kleenest_now',{p_location_id:locationId});}
export function getFacilityPassport(locationId:string){return rpc('location_facility_passport',{p_location_id:locationId});}
export function getVerifiedAccess(locationId:string){return rpc('kleenest_verified_access',{p_location_id:locationId});}
export function getBathroomFit(locationId:string){return rpc('location_bathroom_fit',{p_location_id:locationId});}
export function getLocationExplanation(locationId:string){return rpc('location_intelligence_explanation',{p_location_id:locationId});}
export function getLocationProofCard(locationId:string){return rpc('location_proof_card',{p_location_id:locationId});}
export function setLocationTrustWatch(locationId:string,enabled=true){return rpc('consumer_location_trust_watch',{p_location_id:locationId,p_enabled:enabled});}
export function getLocationTrustChanges(limit=20){return rpc<any[]>('consumer_location_trust_changes',{p_limit:limit});}
export function getConsumerRouteConfidence(routeId:string){return rpc('consumer_route_confidence',{p_route_id:routeId});}
export async function getBathroomFitPreferences(){return await rpc<Partial<BathroomFitPreferences>>('consumer_get_bathroom_fit_preferences')||{};}
export function updateBathroomFitPreferences(preferences:Partial<BathroomFitPreferences>){return rpc<BathroomFitPreferences>('consumer_update_bathroom_fit_preferences',{p_preferences:preferences});}
export async function getConsumerIntelligence(locationId:string){
  const[now,passport,access,fit,prefs]=await Promise.allSettled([getKleenestNow(locationId),getFacilityPassport(locationId),getVerifiedAccess(locationId),getBathroomFit(locationId),getBathroomFitPreferences()]);
  const value=(x:PromiseSettledResult<any>,fallback:any)=>x.status==='fulfilled'?x.value:fallback;
  return{now:value(now,{}),passport:value(passport,{}),access:value(access,{}),fit:value(fit,{}),preferences:value(prefs,{})};
}
