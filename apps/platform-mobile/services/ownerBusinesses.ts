import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { requirePlatformOwner } from './ownerAdmin';

const client=()=>getKleenestSupabaseClient();
function object(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function rows(value:unknown){return Array.isArray(value)?value:[];}
function asRows(value:unknown):any[]{if(Array.isArray(value))return value;if(value&&typeof value==='object'){const record=value as Record<string,unknown>;for(const key of['items','rows','results','businesses'])if(Array.isArray(record[key]))return record[key] as any[];}return[];}

export async function searchOwnerBusinesses(query:string){const q=query.trim();if(!q)return[];const{data,error}=await client().rpc('admin_business_search',{p_query:q});if(error)throw new Error(error.message);return asRows(data);}
export async function getOwnerBusinessDetail(businessId:string){await requirePlatformOwner();const{data,error}=await client().rpc('admin_business_detail',{p_business_id:businessId});if(error)throw new Error(error.message);const value=object(data);return{business:object(value.business),access:object(value.access),members:rows(value.members),locations:rows(value.locations),claims:rows(value.claims)};}
export async function setOwnerBusinessAccess(input:{businessId:string;tier:string;fleetEnabled:boolean;enterpriseEnabled:boolean;reason:string}){await requirePlatformOwner();const{data,error}=await client().rpc('admin_set_business_access',{p_business_id:input.businessId,p_tier:input.tier,p_fleet_enabled:input.fleetEnabled,p_enterprise_enabled:input.enterpriseEnabled,p_reason:input.reason.trim()||'KleenestOS business access update'});if(error)throw new Error(error.message);return data;}
export async function setOwnerBusinessVerification(businessId:string,status:string){await requirePlatformOwner();const{data,error}=await client().rpc('admin_set_business_verification',{p_business_id:businessId,p_status:status});if(error)throw new Error(error.message);return data;}
export async function resolveOwnerLocationClaim(claimId:string,status:'approved'|'rejected'){await requirePlatformOwner();const{data,error}=await client().rpc('admin_resolve_location_claim',{p_claim_id:claimId,p_status:status});if(error)throw new Error(error.message);return data;}
export async function assignOwnerBusinessMember(businessId:string,userId:string,role:string){await requirePlatformOwner();const{data,error}=await client().rpc('admin_assign_business_member',{p_business_id:businessId,p_user_id:userId,p_role:role});if(error)throw new Error(error.message);return data;}
export async function removeOwnerBusinessMember(businessId:string,userId:string){await requirePlatformOwner();const{data,error}=await client().rpc('admin_remove_business_member',{p_business_id:businessId,p_user_id:userId});if(error)throw new Error(error.message);return data;}
