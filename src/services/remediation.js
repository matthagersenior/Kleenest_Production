import { getSupabase } from '../lib/supabase.js';

function requireId(value,label){if(!value)throw new Error(`${label} is required.`);return value}
async function rpc(name,args){const{data,error}=await getSupabase().rpc(name,args);if(error)throw error;return data}

export function getBusinessRestroomRemediationOperations(businessId){
  return rpc('business_restroom_remediation_operations',{p_business_id:requireId(businessId,'Business id')});
}

export function getBusinessRestroomRemediationPerformance(businessId,days=30){
  const bounded=Math.min(Math.max(Number(days)||30,1),365);
  return rpc('business_restroom_remediation_performance',{p_business_id:requireId(businessId,'Business id'),p_days:bounded});
}

export function getBusinessRestroomReliability(businessId,days=90){
  const bounded=Math.min(Math.max(Number(days)||90,30),365);
  return rpc('business_restroom_reliability',{p_business_id:requireId(businessId,'Business id'),p_days:bounded});
}

export function getBusinessRestroomPreventionRecommendations(businessId,days=90){
  const bounded=Math.min(Math.max(Number(days)||90,30),365);
  return rpc('business_restroom_prevention_recommendations',{p_business_id:requireId(businessId,'Business id'),p_days:bounded});
}

export function manageBusinessRestroomRemediation(businessId,caseId,action,{assignedTo=null,notes=null,proofMediaId=null}={}){
  return rpc('business_manage_restroom_remediation',{
    p_business_id:requireId(businessId,'Business id'),
    p_case_id:requireId(caseId,'Remediation case id'),
    p_action:String(action||'').trim(),
    p_assigned_to:assignedTo,
    p_notes:notes,
    p_proof_media_id:proofMediaId,
  });
}

export const claimBusinessRestroomRemediation=(businessId,caseId)=>manageBusinessRestroomRemediation(businessId,caseId,'claim');
export const startBusinessRestroomRemediation=(businessId,caseId)=>manageBusinessRestroomRemediation(businessId,caseId,'start');
export const releaseBusinessRestroomRemediation=(businessId,caseId)=>manageBusinessRestroomRemediation(businessId,caseId,'release');
export const reopenBusinessRestroomRemediation=(businessId,caseId)=>manageBusinessRestroomRemediation(businessId,caseId,'reopen');
export const assignBusinessRestroomRemediation=(businessId,caseId,assignedTo)=>manageBusinessRestroomRemediation(businessId,caseId,'assign',{assignedTo:requireId(assignedTo,'Assignee')});
export const dismissBusinessRestroomRemediation=(businessId,caseId,notes)=>manageBusinessRestroomRemediation(businessId,caseId,'dismiss',{notes});
export const resolveBusinessRestroomRemediation=(businessId,caseId,notes,proofMediaId=null)=>manageBusinessRestroomRemediation(businessId,caseId,'resolve',{notes:String(notes||'').trim(),proofMediaId});
