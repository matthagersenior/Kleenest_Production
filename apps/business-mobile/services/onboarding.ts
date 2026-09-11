import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}

export type OnboardingCatalog={business_types:Array<{id:string;label:string;detail:string}>;goals:Array<{id:string;label:string;detail:string;product:string}>;scale_questions:Array<{id:string;label:string}>};
export type OnboardingPreview={business_id:string;business_type:string;goals:string[];scale:Record<string,unknown>;current_plan:string;recommended_products:string[];upgrade_required:boolean;needs:Record<string,boolean>;available:Record<string,boolean>;capabilities:Array<{id:string;label:string;route:string;product:string;available:boolean}>;next_steps:Array<{id:string;label:string;route:string;available:boolean}>};

export async function getBusinessOnboardingCatalog(){return await rpc('business_onboarding_catalog') as OnboardingCatalog;}
export async function getBusinessOnboardingState(businessId:string){return await rpc('business_onboarding_state',{p_business_id:businessId}) as Record<string,any>;}
export async function previewBusinessOnboarding(businessId:string,businessType:string,goals:string[],scale:Record<string,number>){return await rpc('business_onboarding_preview',{p_business_id:businessId,p_business_type:businessType,p_goals:goals,p_scale:scale}) as OnboardingPreview;}
export async function applyBusinessOnboarding(businessId:string,businessType:string,goals:string[],scale:Record<string,number>){return await rpc('business_onboarding_apply',{p_business_id:businessId,p_business_type:businessType,p_goals:goals,p_scale:scale}) as Record<string,any>;}
export async function getBusinessRealWorldDemoSnapshot(businessId:string){return await rpc('business_real_world_demo_snapshot',{p_business_id:businessId}) as Record<string,any>;}
