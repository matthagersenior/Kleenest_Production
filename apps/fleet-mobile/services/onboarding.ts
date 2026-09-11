import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}

export async function getFleetOnboardingCatalog(){return await rpc('business_onboarding_catalog') as Record<string,any>;}
export async function getFleetOnboardingState(businessId:string){return await rpc('business_onboarding_state',{p_business_id:businessId}) as Record<string,any>;}
export async function previewFleetOnboarding(businessId:string,businessType:string,goals:string[],scale:Record<string,number>){return await rpc('business_onboarding_preview',{p_business_id:businessId,p_business_type:businessType,p_goals:goals,p_scale:scale}) as Record<string,any>;}
export async function applyFleetOnboarding(businessId:string,businessType:string,goals:string[],scale:Record<string,number>){return await rpc('business_onboarding_apply',{p_business_id:businessId,p_business_type:businessType,p_goals:goals,p_scale:scale}) as Record<string,any>;}
export async function getFleetRealWorldDemoSnapshot(businessId:string){return await rpc('fleet_real_world_demo_snapshot',{p_business_id:businessId}) as Record<string,any>;}
