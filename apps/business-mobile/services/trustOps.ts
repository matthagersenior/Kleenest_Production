import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
const client=()=>getKleenestSupabaseClient();async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}
export const getRemediationOperations=(businessId:string)=>rpc('business_restroom_remediation_operations',{p_business_id:businessId});
export function manageRemediation(businessId:string,caseId:string,action:'assign'|'claim'|'start'|'release'|'dismiss'|'reopen'|'resolve',options:{assignedTo?:string|null;notes?:string|null;proofMediaId?:string|null}={}){return rpc('business_manage_restroom_remediation',{p_business_id:businessId,p_case_id:caseId,p_action:action,p_assigned_to:options.assignedTo??null,p_notes:options.notes??null,p_proof_media_id:options.proofMediaId??null});}
export const getRemediationPerformance=(businessId:string,days=90)=>rpc('business_restroom_remediation_performance',{p_business_id:businessId,p_days:days});
export const getReverificationOperations=(businessId:string)=>rpc('business_reverification_operations',{p_business_id:businessId});
export function manageReverification(businessId:string,caseId:string,action:'assign_to_me'|'release'|'dismiss'|'reopen'){return rpc('business_manage_reverification_case',{p_business_id:businessId,p_case_id:caseId,p_action:action});}
export const createReverificationQr=(businessId:string,locationId:string)=>rpc('business_create_reverification_qr',{p_business_id:businessId,p_location_id:locationId});
