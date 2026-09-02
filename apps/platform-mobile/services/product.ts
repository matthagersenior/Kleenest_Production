import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
const client=()=>getKleenestSupabaseClient();
async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}
export async function getPlatformDashboard(){const[pending,activity,reports,snapshot,history]=await Promise.all([rpc('admin_list_pending_businesses'),rpc('admin_list_activity_events',{p_limit:100}),rpc('admin_list_review_reports',{p_status:'open'}),rpc('admin_control_plane_snapshot'),rpc('admin_control_plane_history',{p_limit:100})]);return{pending,activity,reports,snapshot,history};}
export async function setBusinessVerification(businessId:string,status:string){return rpc('admin_set_business_verification',{p_business_id:businessId,p_status:status});}
export async function setBusinessTier(businessId:string,tier:string){return rpc('admin_set_business_tier',{p_business_id:businessId,p_tier:tier});}
export async function setUserAccess(userId:string,enabled:boolean,reason=''){return rpc('admin_set_user_access',{p_user_id:userId,p_enabled:enabled,p_reason:reason,p_note:null,p_force_sign_out:!enabled,p_actor_note:reason});}
export const PLATFORM_PARITY=['admin-dashboard','pending-businesses','business-verification','account-capabilities','business-access','business-tier','member-management','review-reports','moderation','platform-activity','control-history','notifications','support','privacy','account-control'];
