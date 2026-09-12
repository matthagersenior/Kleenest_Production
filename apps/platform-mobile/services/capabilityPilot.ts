import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}

export type OfferReadiness={
  offer_key:string;
  label:string;
  audience:string;
  description:string;
  active:boolean;
  sample_enabled:boolean;
  pilot_enabled:boolean;
  pilot_mode:'off'|'sample'|'sandbox'|'limited-live'|'live';
  commercial_state:'sample'|'pilot'|'offered'|'production'|'gated'|'retired';
  sample_profile:Record<string,unknown>;
  owner_notes:string|null;
  required_domains:string[];
  missing_domains:string[];
  inactive_domains:string[];
  missing_rpcs:string[];
  release_blockers:string[];
  production_gates:string[];
  surface_gaps:string[];
  sample_disabled_domains:string[];
  pilot_disabled_domains:string[];
  sample_ready:boolean;
  pilot_ready:boolean;
  production_ready:boolean;
};

export type PilotCapabilityDomain={
  id:string;
  domain:string;
  canonical_capability:string;
  canonical_rpc:string;
  owner_surface:string;
  owner_workspace:string|null;
  owner_route:string|null;
  active:boolean;
  exposure_state:string;
  release_state:string;
  requires_surface:boolean;
  source_repos:string[];
  notes:string|null;
  sample_enabled:boolean;
  pilot_enabled:boolean;
  pilot_mode:'off'|'sample'|'sandbox'|'limited-live'|'live';
  promise_state:'internal'|'sample'|'pilot'|'offered'|'production'|'gated'|'unavailable';
  rpc_exists:boolean;
  authenticated_execute:boolean;
  anon_execute:boolean;
  updated_at:string;
};

export async function getOfferReadiness():Promise<OfferReadiness[]>{
  const value=await rpc('owner_offer_capability_readiness');
  return Array.isArray(value)?value as OfferReadiness[]:[];
}

export async function getPilotCapabilityDomains():Promise<PilotCapabilityDomain[]>{
  const value=await rpc('owner_capability_domain_contracts');
  return Array.isArray(value)?value as PilotCapabilityDomain[]:[];
}

export async function updateOfferGovernance(offerKey:string,patch:Record<string,unknown>,reason='KleenestOS offer/pilot governance update'){
  return rpc('owner_update_capability_offer',{p_offer_key:offerKey,p_patch:patch,p_reason:reason});
}

export async function updatePilotCapabilityDomain(domain:string,patch:Record<string,unknown>,reason='KleenestOS pilot capability governance update'){
  return rpc('owner_update_capability_domain_contract',{p_domain:domain,p_patch:patch,p_reason:reason});
}
