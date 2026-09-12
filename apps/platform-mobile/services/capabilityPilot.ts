import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}

export type OfferReadiness={
  offer_key:string;label:string;audience:string;description:string;active:boolean;sample_enabled:boolean;pilot_enabled:boolean;
  pilot_mode:'off'|'sample'|'sandbox'|'limited-live'|'live';commercial_state:'sample'|'pilot'|'offered'|'production'|'gated'|'retired';
  sample_profile:Record<string,unknown>;owner_notes:string|null;required_domains:string[];missing_domains:string[];inactive_domains:string[];missing_rpcs:string[];
  release_blockers:string[];production_gates:string[];surface_gaps:string[];sample_disabled_domains:string[];pilot_disabled_domains:string[];
  sample_ready:boolean;pilot_ready:boolean;production_ready:boolean;
};

export type PilotCapabilityDomain={
  id:string;domain:string;canonical_capability:string;canonical_rpc:string;owner_surface:string;owner_workspace:string|null;owner_route:string|null;
  active:boolean;exposure_state:string;release_state:string;requires_surface:boolean;source_repos:string[];notes:string|null;sample_enabled:boolean;pilot_enabled:boolean;
  pilot_mode:'off'|'sample'|'sandbox'|'limited-live'|'live';promise_state:'internal'|'sample'|'pilot'|'offered'|'production'|'gated'|'unavailable';
  rpc_exists:boolean;authenticated_execute:boolean;anon_execute:boolean;updated_at:string;
};

export type PilotSession={
  id:string;offer_key:string;offer_label:string;audience:string;name:string;organization_name:string|null;contact_name:string|null;contact_email:string|null;
  status:'draft'|'active'|'paused'|'completed'|'cancelled';starts_at:string|null;ends_at:string|null;notes:string|null;
  sample_profile_snapshot:Record<string,unknown>;capability_overrides:Record<string,unknown>;created_at:string;updated_at:string;
};

export type OfferLaunchManifest={
  offer_key:string;label:string;audience:string;description:string;sample_profile:Record<string,unknown>;
  pilot_session:Record<string,unknown>|null;canonical_audit_issue_count:number;
  readiness:{sample_ready:boolean;pilot_ready:boolean;production_ready:boolean;missing_domains:string[];missing_rpcs:string[];production_gates:string[];surface_gaps:string[]};
  capabilities:Array<{domain:string;capability:string;canonical_rpc:string;owner_workspace:string|null;owner_route:string|null;release_state:string;promise_state:string;sample_enabled:boolean;pilot_enabled:boolean;pilot_mode:string;rpc_exists:boolean}>;
  real_world_demo:Record<string,unknown>|null;developer_portal:string|null;launch_steps:string[];generated_at:string;
};

export type OfferLaunchCheck={
  id:string;offer_key:string;offer_label?:string;pilot_session_id:string|null;pilot_name?:string|null;
  check_type:'sample'|'pilot'|'production';status:'passed'|'blocked';passed?:boolean;canonical_audit_issue_count:number;
  readiness:OfferLaunchManifest['readiness'];manifest?:OfferLaunchManifest;launch_manifest?:OfferLaunchManifest;created_at:string;
};

export async function getOfferReadiness():Promise<OfferReadiness[]>{const value=await rpc('owner_offer_capability_readiness');return Array.isArray(value)?value as OfferReadiness[]:[];}
export async function getPilotCapabilityDomains():Promise<PilotCapabilityDomain[]>{const value=await rpc('owner_capability_domain_contracts');return Array.isArray(value)?value as PilotCapabilityDomain[]:[];}
export async function updateOfferGovernance(offerKey:string,patch:Record<string,unknown>,reason='KleenestOS offer/pilot governance update'){return rpc('owner_update_capability_offer',{p_offer_key:offerKey,p_patch:patch,p_reason:reason});}
export async function updatePilotCapabilityDomain(domain:string,patch:Record<string,unknown>,reason='KleenestOS pilot capability governance update'){return rpc('owner_update_capability_domain_contract',{p_domain:domain,p_patch:patch,p_reason:reason});}

export async function getPilotSessions(status?:PilotSession['status']):Promise<PilotSession[]>{
  const value=await rpc('owner_pilot_sessions',{p_status:status??null});
  return Array.isArray(value)?value as PilotSession[]:[];
}

export async function createPilotSession(input:{offerKey:string;name:string;organizationName?:string;contactName?:string;contactEmail?:string;startsAt?:string;endsAt?:string;notes?:string;capabilityOverrides?:Record<string,unknown>;reason?:string}){
  return rpc('owner_create_pilot_session',{
    p_offer_key:input.offerKey,p_name:input.name,p_organization_name:input.organizationName??null,p_contact_name:input.contactName??null,p_contact_email:input.contactEmail??null,
    p_starts_at:input.startsAt??new Date().toISOString(),p_ends_at:input.endsAt??null,p_notes:input.notes??null,p_capability_overrides:input.capabilityOverrides??{},p_reason:input.reason??'KleenestOS pilot created'
  });
}

export async function updatePilotSession(sessionId:string,patch:Record<string,unknown>,reason='KleenestOS pilot session update'){
  return rpc('owner_update_pilot_session',{p_session_id:sessionId,p_patch:patch,p_reason:reason});
}


export async function getOfferLaunchManifest(offerKey:string,pilotSessionId?:string|null):Promise<OfferLaunchManifest>{
  return await rpc('owner_offer_launch_manifest',{p_offer_key:offerKey,p_pilot_session_id:pilotSessionId??null}) as OfferLaunchManifest;
}

export async function runOfferLaunchCheck(offerKey:string,checkType:'sample'|'pilot'|'production',pilotSessionId?:string|null):Promise<OfferLaunchCheck>{
  return await rpc('owner_run_offer_launch_check',{p_offer_key:offerKey,p_pilot_session_id:pilotSessionId??null,p_check_type:checkType}) as OfferLaunchCheck;
}

export async function getOfferLaunchHistory(offerKey?:string,limit=50):Promise<OfferLaunchCheck[]>{
  const value=await rpc('owner_offer_launch_history',{p_offer_key:offerKey??null,p_limit:limit});
  return Array.isArray(value)?value as OfferLaunchCheck[]:[];
}
