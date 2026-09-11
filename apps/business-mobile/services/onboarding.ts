import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}

export type OnboardingCatalog={business_types:Array<{id:string;label:string;detail:string}>;goals:Array<{id:string;label:string;detail:string;product:string}>;scale_questions:Array<{id:string;label:string}>};
export type OnboardingTierOption={id:'standard'|'growth'|'enterprise';label:string;price_cents:number|null;interval:string|null;price_note:string|null;max_locations:number|null;fleet_included:boolean;recommended:boolean;summary:string};
export type OnboardingPreview={business_id:string;business_type:string;goals:string[];scale:Record<string,unknown>;current_plan:string;raw_business_tier?:string;minimum_tier?:'standard'|'growth'|'enterprise';recommended_tier?:'standard'|'growth'|'enterprise';tier_reason?:string;tier_options?:OnboardingTierOption[];fleet_included?:boolean;recommended_products:string[];upgrade_required:boolean;needs:Record<string,boolean>;available:Record<string,boolean>;capabilities:Array<{id:string;label:string;route:string;product:string;tier?:string;available:boolean}>;next_steps:Array<{id:string;label:string;route:string;available:boolean}>;answers?:Record<string,unknown>;experience?:Record<string,any>;targeted_routes?:string[];onboarding_version?:number};
export type OnboardingGate={business_id:string;mandatory:boolean;required:boolean;completed:boolean;can_complete:boolean;required_after:string|null;onboarding_version:number;completed_version:number;completed_at:string|null;recommended:boolean};

export async function getBusinessOnboardingCatalog(){return await rpc('business_onboarding_catalog') as OnboardingCatalog;}
export async function getBusinessOnboardingState(businessId:string){return await rpc('business_onboarding_state',{p_business_id:businessId}) as Record<string,any>;}
export async function previewBusinessOnboarding(businessId:string,businessType:string,goals:string[],scale:Record<string,number>,answers:Record<string,unknown>={}){return await rpc('business_onboarding_preview_v2',{p_business_id:businessId,p_business_type:businessType,p_goals:goals,p_scale:scale,p_answers:answers}) as OnboardingPreview;}
export async function applyBusinessOnboarding(businessId:string,businessType:string,goals:string[],scale:Record<string,number>,answers:Record<string,unknown>={}){return await rpc('business_onboarding_apply_v2',{p_business_id:businessId,p_business_type:businessType,p_goals:goals,p_scale:scale,p_answers:answers}) as Record<string,any>;}
export async function getBusinessOnboardingGate(businessId:string){return await rpc('business_onboarding_gate',{p_business_id:businessId}) as OnboardingGate;}
export async function getBusinessRealWorldDemoSnapshot(businessId:string){return await rpc('business_real_world_demo_snapshot',{p_business_id:businessId}) as Record<string,any>;}
