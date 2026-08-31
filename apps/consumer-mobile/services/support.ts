import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type SupportCategory='general'|'account'|'billing'|'technical'|'safety'|'feedback';
export type SupportRequest={id:string;subject:string;message:string;category:string;status:string;priority:string;created_at:string;updated_at:string};

export async function submitSupportRequest(subject:string,message:string,category:SupportCategory='general'){
  const {data,error}=await getKleenestSupabaseClient().rpc('submit_support_request',{p_subject:subject.trim(),p_message:message.trim(),p_category:category});
  if(error)throw error;
  return data as SupportRequest;
}
export async function listMySupportRequests(limit=25){
  const {data:{user},error:authError}=await getKleenestSupabaseClient().auth.getUser();
  if(authError)throw authError;
  if(!user)throw new Error('Sign in to view support requests.');
  const {data,error}=await getKleenestSupabaseClient().from('support_requests').select('id,subject,message,category,status,priority,created_at,updated_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(Math.min(Math.max(limit,1),50));
  if(error)throw error;
  return (data||[]) as SupportRequest[];
}
