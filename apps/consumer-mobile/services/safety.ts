import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type SafetyReportReason = 'unsafe'|'harassment'|'hate'|'sexual'|'privacy'|'spam'|'inaccurate'|'other';

export async function hasCurrentPolicyAcceptance(){
  const {data,error}=await getKleenestSupabaseClient().rpc('has_current_policy_acceptance');
  if(error)throw error;
  return Boolean(data);
}

export async function acceptCurrentPolicies(){
  const {data,error}=await getKleenestSupabaseClient().rpc('accept_current_policies');
  if(error)throw error;
  return data;
}

export async function getCurrentPolicyVersions(){
  const {data,error}=await getKleenestSupabaseClient().rpc('current_policy_versions');
  if(error)throw error;
  return data||{};
}

export async function reportUser(userId:string,reason:SafetyReportReason,details?:string,context='consumer-mobile'){
  const {data,error}=await getKleenestSupabaseClient().rpc('report_user',{
    p_user_id:userId,
    p_reason:reason,
    p_details:details?.trim()||null,
    p_context:context,
  });
  if(error)throw error;
  return data;
}

export async function reportReview(reviewId:string,reason:SafetyReportReason,details?:string){
  const {data,error}=await getKleenestSupabaseClient().rpc('report_review',{
    p_review_id:reviewId,
    p_reason:reason,
    p_details:details?.trim()||null,
  });
  if(error)throw error;
  return data;
}

export async function blockUser(userId:string){
  const {data,error}=await getKleenestSupabaseClient().rpc('block_user',{p_user_id:userId});
  if(error)throw error;
  return data;
}

export async function unblockUser(userId:string){
  const {data,error}=await getKleenestSupabaseClient().rpc('unblock_user',{p_user_id:userId});
  if(error)throw error;
  return data;
}

export async function listBlockedUsers(){
  const {data,error}=await getKleenestSupabaseClient().rpc('list_my_blocked_users');
  if(error)throw error;
  return Array.isArray(data)?data:[];
}

export async function reportAiResponse(input:{traceId:string;reason:SafetyReportReason;details?:string;task?:string;provider?:string;model?:string;answerExcerpt?:string}){
  const {data,error}=await getKleenestSupabaseClient().rpc('report_ai_response',{
    p_trace_id:input.traceId,
    p_reason:input.reason,
    p_details:input.details?.trim()||null,
    p_task:input.task||null,
    p_provider:input.provider||null,
    p_model:input.model||null,
    p_answer_excerpt:input.answerExcerpt?.slice(0,4000)||null,
  });
  if(error)throw error;
  return data;
}

export function isPolicyAcceptanceError(error:unknown){
  return /POLICY_ACCEPTANCE_REQUIRED/i.test(error instanceof Error?error.message:String(error||''));
}
