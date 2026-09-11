import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}

export async function getFleetOnboardingCatalog(){return await rpc('business_onboarding_catalog') as Record<string,any>;}
export async function getFleetOnboardingState(businessId:string){return await rpc('business_onboarding_state',{p_business_id:businessId}) as Record<string,any>;}
export async function previewFleetOnboarding(businessId:string,businessType:string,goals:string[],scale:Record<string,number>,answers:Record<string,unknown>={}){return await rpc('business_onboarding_save_draft_v2',{p_business_id:businessId,p_business_type:businessType,p_goals:goals,p_scale:scale,p_answers:answers}) as Record<string,any>;}
export async function previewFleetOnboardingReadOnly(businessId:string,businessType:string,goals:string[],scale:Record<string,number>,answers:Record<string,unknown>={}){return await rpc('business_onboarding_preview_v2',{p_business_id:businessId,p_business_type:businessType,p_goals:goals,p_scale:scale,p_answers:answers}) as Record<string,any>;}
export async function applyFleetOnboarding(businessId:string,businessType:string,goals:string[],scale:Record<string,number>,answers:Record<string,unknown>={}){return await rpc('business_onboarding_apply_v2',{p_business_id:businessId,p_business_type:businessType,p_goals:goals,p_scale:scale,p_answers:answers}) as Record<string,any>;}
export async function getFleetOnboardingGate(businessId:string){return await rpc('business_onboarding_gate',{p_business_id:businessId}) as Record<string,any>;}
export async function getFleetRealWorldDemoSnapshot(businessId:string){return await rpc('fleet_real_world_demo_snapshot',{p_business_id:businessId}) as Record<string,any>;}

export async function getFleetRealWorldDemoLoopState(businessId:string){return await rpc('real_world_demo_loop_state',{p_business_id:businessId}) as Record<string,any>;}
export async function startFleetRealWorldDemoLoop(businessId:string){return await rpc('real_world_demo_loop_start',{p_business_id:businessId}) as Record<string,any>;}
export async function advanceFleetRealWorldDemoLoop(businessId:string){return await rpc('real_world_demo_loop_advance',{p_business_id:businessId}) as Record<string,any>;}
export async function resetFleetRealWorldDemoLoop(businessId:string){return await rpc('real_world_demo_loop_reset',{p_business_id:businessId}) as Record<string,any>;}
