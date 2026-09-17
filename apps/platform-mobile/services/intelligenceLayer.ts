import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc<T=any>(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data as T;}

export function getOwnerIntelligenceOverview(){return rpc('owner_intelligence_overview');}
export function explainLocationIntelligence(locationId:string){return rpc('owner_explain_location_intelligence',{p_location_id:locationId});}
export function getIntelligencePolicy(){return rpc('owner_get_intelligence_policy');}
export function updateIntelligencePolicy(patch:Record<string,unknown>){return rpc('owner_update_intelligence_policy',{p_patch:patch});}
export async function getOwnerIntelligenceWorkspace(){
  const[overview,policy]=await Promise.all([getOwnerIntelligenceOverview(),getIntelligencePolicy()]);
  return{overview,policy};
}
