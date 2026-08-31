import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type LocationRecoveryHistoryItem = {
  case_id: string;
  location_id: string;
  amenity_id: string;
  amenity_name: string;
  response_status: 'business_alerted' | 'business_addressing' | 'addressed' | string;
  resolution_method: 'business_remediation' | 'community_confirmation' | 'business_response_active' | string;
  priority_band: 'critical' | 'high' | 'elevated' | 'standard' | string;
  opened_at: string;
  source_observed_at: string | null;
  resolved_at: string | null;
  resolution_observed_at: string | null;
  proof_available: boolean;
  proof_storage_path: string | null;
  proof_created_at: string | null;
  proof_url: string | null;
  sla_met: boolean | null;
};

export type LocationRecoveryConfidence={
  location_id:string;
  issue_count:number;
  resolved_count:number;
  community_confirmed:number;
  failed_fixes:number;
  escalated:number;
  active_count:number;
  affected_amenities:number;
  latest_recovery_at:string|null;
  recovery_confidence_score:number;
  recovery_state:'no_recent_issues'|'recovery_unstable'|'recovery_in_progress'|'community_confirmed'|'business_reported_recovery'|'needs_attention'|string;
  generated_at:string;
};

export type RemediationConfirmationOpportunity = {
  case_id:string;
  business_id:string;
  location_id:string;
  amenity_id:string;
  amenity_name:string;
  priority:number;
  resolved_at:string;
  proof_available:boolean;
  proof_storage_path:string|null;
  proof_url:string|null;
  already_confirmed_by_you:boolean;
  verified_visit_ready:boolean;
  requires_verified_visit:boolean;
};

export type RemediationConfirmationResult={
  case_id:string;
  location_id:string;
  amenity_id:string;
  outcome:'confirmed'|'still_broken';
  observation_id:string;
  check_in_id:string;
  reopened_case_id:string|null;
  progression?:{awarded?:boolean;points?:number;reason?:string}|null;
  confirmed_at:string;
};

function proofUrl(storagePath:string|null){if(!storagePath)return null;return getKleenestSupabaseClient().storage.from('location-photos').getPublicUrl(storagePath).data.publicUrl||null}

export async function getLocationRecoveryHistory(locationId:string):Promise<LocationRecoveryHistoryItem[]> {
  const {data,error}=await getKleenestSupabaseClient().rpc('get_location_recovery_history',{p_location_id:locationId});
  if(error)throw error;
  const rows=Array.isArray(data)?data:[];
  return rows.map((row:any)=>{const storagePath=typeof row?.proof_storage_path==='string'&&row.proof_storage_path?row.proof_storage_path:null;return {...row,proof_storage_path:storagePath,proof_url:proofUrl(storagePath)||null} as LocationRecoveryHistoryItem;});
}

export async function getLocationRecoveryConfidence(locationId:string):Promise<LocationRecoveryConfidence>{
  const {data,error}=await getKleenestSupabaseClient().rpc('get_location_recovery_confidence',{p_location_id:locationId});
  if(error)throw error;
  return (data||{}) as LocationRecoveryConfidence;
}

export async function getRemediationConfirmationOpportunities(locationId:string):Promise<RemediationConfirmationOpportunity[]> {
  const {data,error}=await getKleenestSupabaseClient().rpc('get_location_remediation_confirmation_opportunities',{p_location_id:locationId});
  if(error)throw error;
  const rows=Array.isArray(data)?data:[];
  return rows.map((row:any)=>{const storagePath=typeof row?.proof_storage_path==='string'&&row.proof_storage_path?row.proof_storage_path:null;return {...row,proof_storage_path:storagePath,proof_url:proofUrl(storagePath)||null} as RemediationConfirmationOpportunity;});
}

export async function confirmBusinessRemediation(caseId:string,outcome:'confirmed'|'still_broken',notes:string|null=null):Promise<RemediationConfirmationResult>{
  const {data,error}=await getKleenestSupabaseClient().rpc('confirm_business_remediation',{p_case_id:caseId,p_outcome:outcome,p_notes:notes});
  if(error)throw error;
  return (data||{}) as RemediationConfirmationResult;
}
