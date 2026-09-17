import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc<T=any>(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data as T;}

export function getOwnerIntelligenceOverview(){return rpc('owner_intelligence_overview');}
export function getOwnerProductTruth(){return rpc('owner_product_truth');}
export function explainLocationIntelligence(locationId:string){return rpc('owner_explain_location_intelligence',{p_location_id:locationId});}
export function getIntelligencePolicy(){return rpc('owner_get_intelligence_policy');}
export function updateIntelligencePolicy(patch:Record<string,unknown>){return rpc('owner_update_intelligence_policy',{p_patch:patch});}
export async function listIntelligenceLocationCandidates(){const{data,error}=await client().from('locations').select('id,name,city,state,updated_at').order('updated_at',{ascending:false}).limit(30);if(error)throw error;return data||[];}
export async function getOwnerIntelligenceWorkspace(){
  const[overview,policy,locations,productTruth]=await Promise.all([getOwnerIntelligenceOverview(),getIntelligencePolicy(),listIntelligenceLocationCandidates(),getOwnerProductTruth()]);
  return{overview,policy,locations,productTruth};
}
