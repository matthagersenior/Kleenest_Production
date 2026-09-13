import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
const rpc=async(name:string,args:Record<string,unknown>)=>{
  const{data,error}=await client().rpc(name,args);
  if(error)throw new Error(error.message);
  return data;
};

export async function listBusinessClaimCases(businessId:string){
  const data=await rpc('business_list_location_claims_v2',{p_business_id:businessId});
  return Array.isArray(data)?data:[];
}

export async function listIncomingBusinessClaimCases(businessId:string){
  const data=await rpc('business_list_incoming_location_claims',{p_business_id:businessId});
  return Array.isArray(data)?data:[];
}

export async function resolveIncomingBusinessClaim(input:{businessId:string;claimId:string;action:'approve_transfer'|'reject'|'escalate';note?:string}){
  return rpc('business_resolve_incoming_location_claim',{
    p_business_id:input.businessId,p_claim_id:input.claimId,p_action:input.action,p_note:input.note?.trim()||null,
  });
}

export async function getClaimVerificationStatus(claimId:string){
  const{data,error}=await client().functions.invoke('business-claim-verification',{body:{action:'status',claimId}});
  if(error)throw error;
  if(data?.error)throw new Error(String(data.error));
  return data;
}

export async function verifyClaimCompanyEmail(claimId:string){
  const{data,error}=await client().functions.invoke('business-claim-verification',{body:{action:'verify_email_domain',claimId}});
  if(error)throw error;
  if(data?.error)throw new Error(String(data.error));
  return data;
}

export async function startClaimDnsVerification(claimId:string){
  const{data,error}=await client().functions.invoke('business-claim-verification',{body:{action:'start_dns_txt',claimId}});
  if(error)throw error;
  if(data?.error)throw new Error(String(data.error));
  return data;
}

export async function verifyClaimDns(claimId:string,challengeId:string){
  const{data,error}=await client().functions.invoke('business-claim-verification',{body:{action:'verify_dns_txt',claimId,challengeId}});
  if(error)throw error;
  if(data?.error)throw new Error(String(data.error));
  return data;
}
