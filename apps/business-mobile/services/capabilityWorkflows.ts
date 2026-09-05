import * as SecureStore from 'expo-secure-store';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}
const WORKSPACE_KEY='kleenest.business.selected_workspace.v1';
export async function listBusinessWorkspaceOptions(){return ((await rpc('business_list_workspaces',{p_include_demo:false}))||[]) as any[];}
async function productAccess(businessId:string){const rows:any[]=(await rpc('get_business_product_access',{p_business_id:businessId}))||[];return rows[0]||null;}
export async function selectBusinessWorkspace(businessId:string){const rows=await listBusinessWorkspaceOptions();if(!rows.some(row=>String(row.business_id)===businessId))throw new Error('That Business workspace is not available to this account.');await SecureStore.setItemAsync(WORKSPACE_KEY,businessId);return businessId;}
export async function currentBusinessId(){
  const rows=await listBusinessWorkspaceOptions();
  if(!rows.length)throw new Error('No managed Business workspace is available for this account.');
  const preferred=await SecureStore.getItemAsync(WORKSPACE_KEY).catch(()=>null);
  const ranked=await Promise.all(rows.map(async row=>{const id=String(row.business_id||'');try{const access=await productAccess(id);const locationCount=Number(access?.location_count||0);const score=locationCount*100+(access?.enterprise_enabled?30:0)+(access?.fleet_enabled?20:0)+(String(access?.plan||'')==='growth'?10:0)+(row?.is_demo_test?0:5);return{row,id,access,score};}catch{return{row,id,access:null,score:row?.is_demo_test?0:5};}}));
  const preferredRank=ranked.find(item=>item.id===preferred);
  const chosen=preferredRank&&Number(preferredRank.access?.location_count||0)>0?preferredRank:[...ranked].sort((a,b)=>b.score-a.score)[0];
  if(!chosen?.id)throw new Error('No managed Business workspace is available for this account.');
  await SecureStore.setItemAsync(WORKSPACE_KEY,chosen.id).catch(()=>{});
  return chosen.id;
}

export async function searchContributors(query:string){return (await rpc('community_search_contributors',{p_query:query,p_limit:20}))||[];}
export async function listBusinessMembers(businessId:string){const{data,error}=await client().from('business_members').select('id,business_id,user_id,role,created_at,updated_at').eq('business_id',businessId).order('created_at',{ascending:true});if(error)throw error;return data||[];}
export function inviteBusinessMember(businessId:string,userId:string,role:string){return rpc('business_invite_member',{p_business_id:businessId,p_user_id:userId,p_role:role});}
export function changeBusinessMemberRole(businessId:string,userId:string,role:string){return rpc('business_change_member_role',{p_business_id:businessId,p_user_id:userId,p_role:role});}
export function removeBusinessMember(businessId:string,userId:string){return rpc('business_remove_member',{p_business_id:businessId,p_user_id:userId});}
export function transferBusinessOwnership(businessId:string,userId:string){return rpc('business_transfer_ownership',{p_business_id:businessId,p_new_owner_id:userId});}

const windowArgs=(businessId:string,days=90)=>{const end=new Date(),start=new Date(end.getTime()-days*86_400_000);return{p_business_id:businessId,p_start:start.toISOString(),p_end:end.toISOString()};};
export function listBusinessReviews(businessId:string){return rpc('business_review_detail',windowArgs(businessId));}
export function replyBusinessReview(businessId:string,reviewId:string,reply:string){return rpc('business_reply_review',{p_business_id:businessId,p_review_id:reviewId,p_reply:reply});}

export function listQrAssets(businessId:string,days=30){const end=new Date(),start=new Date(end.getTime()-days*86_400_000);return rpc('qr_studio_list_assets',{p_business_id:businessId,p_from:start.toISOString(),p_to:end.toISOString()});}
export function listQrTemplates(businessId:string){return rpc('qr_studio_list_templates',{p_business_id:businessId});}
export function listQrVersions(businessId:string,qrId:string){return rpc('qr_studio_versions',{p_business_id:businessId,p_qr_id:qrId});}
export function upsertQrAsset(businessId:string,input:{qrId?:string|null;locationId?:string|null;patch:Record<string,unknown>;summary?:string|null}){return rpc('qr_studio_upsert_asset',{p_business_id:businessId,p_qr_id:input.qrId??null,p_location_id:input.locationId??null,p_patch:input.patch,p_change_summary:input.summary??null});}
export function restoreQrVersion(businessId:string,qrId:string,version:number){return rpc('qr_studio_restore_version',{p_business_id:businessId,p_qr_id:qrId,p_version:version,p_change_summary:`Restored version ${version} from Business mobile`});}
export function saveQrTemplate(businessId:string,input:{templateId?:string|null;name:string;description?:string;design:Record<string,unknown>;defaultAction?:Record<string,unknown>|null}){return rpc('qr_studio_save_template',{p_business_id:businessId,p_template_id:input.templateId??null,p_name:input.name,p_description:input.description??null,p_design:input.design,p_default_action:input.defaultAction??null});}
export function archiveQrTemplate(businessId:string,templateId:string){return rpc('qr_studio_archive_template',{p_business_id:businessId,p_template_id:templateId});}
export function createCustomQr(businessId:string,locationId:string,label:string,customization:Record<string,unknown>={}){return rpc('business_create_custom_qr',{p_business_id:businessId,p_location_id:locationId,p_label:label,p_purpose:'check_in',p_action_type:'location',p_action_payload:{location_id:locationId},p_customization:customization,p_single_use:false,p_max_redemptions:null});}

export function listPartnerPrograms(){return rpc('business_list_partner_programs');}
export function listPartnerships(businessId:string){return rpc('business_list_partnerships',{p_business_id:businessId});}
export function createPartnerProgram(businessId:string,name:string){return rpc('business_create_partner_program',{p_business_id:businessId,p_name:name});}
export function updatePartnerProgram(businessId:string,id:string,name:string,enabled:boolean){return rpc('business_update_partner_program',{p_business_id:businessId,p_partner_program_id:id,p_name:name,p_enabled:enabled});}
export function deletePartnerProgram(businessId:string,id:string){return rpc('business_delete_partner_program',{p_business_id:businessId,p_partner_program_id:id});}
export function createPartnership(businessId:string,name:string){return rpc('business_create_partnership',{p_business_id:businessId,p_name:name,p_enabled:true,p_preferred_access:false,p_match_discount_bonus:0,p_custom_perk:null});}
export function updatePartnership(businessId:string,id:string,name:string,enabled:boolean){return rpc('business_update_partnership',{p_business_id:businessId,p_partnership_id:id,p_name:name,p_enabled:enabled,p_preferred_access:false,p_match_discount_bonus:0,p_custom_perk:null});}
export function deletePartnership(businessId:string,id:string){return rpc('business_delete_partnership',{p_business_id:businessId,p_partnership_id:id});}

export function searchClaimableLocations(businessId:string,query:string){return rpc('business_search_claimable_locations',{p_business_id:businessId,p_query:query,p_limit:50});}
export function listLocationClaims(businessId:string){return rpc('business_list_location_claims',{p_business_id:businessId});}
export function claimLocation(businessId:string,locationId:string){return rpc('claim_location_for_business',{p_location_id:locationId,p_business_id:businessId});}

export function businessLiveNetworkManifest(businessId:string){return rpc('business_live_network_manifest',{p_business_id:businessId});}
export function ensureBusinessGeofences(businessId:string,radiusMeters=125){return rpc('business_ensure_live_network_geofences',{p_business_id:businessId,p_radius_meters:radiusMeters});}
export function sendBusinessNotification(businessId:string,input:{title:string;body:string;audience:string}){return rpc('business_send_custom_notification',{p_business_id:businessId,p_event_type:'business_custom',p_title:input.title,p_body:input.body,p_audience_scope:input.audience,p_payload:{source:'business-mobile'},p_expires_at:null});}

export async function getBusinessIntelligence(businessId:string){const w=windowArgs(businessId,30);const settled=await Promise.allSettled([rpc('get_business_intelligence_authority_bundle',w),rpc('get_business_growth_action_summary',{p_business_id:businessId}),rpc('business_growth_cockpit',{p_business_id:businessId,p_window_days:30}),rpc('business_progression_engagement_snapshot',{p_business_id:businessId})]);return{authority:settled[0].status==='fulfilled'?settled[0].value:null,growthActions:settled[1].status==='fulfilled'?settled[1].value:null,cockpit:settled[2].status==='fulfilled'?settled[2].value:null,progression:settled[3].status==='fulfilled'?settled[3].value:null,partial:settled.some(item=>item.status==='rejected')};}
export async function listBusinessIntelligenceActions(businessId:string){const{data,error}=await client().from('intelligence_action_links').select('*').eq('business_id',businessId).order('created_at',{ascending:false}).limit(100);if(error)throw error;return data||[];}
export function executeIntelligenceAction(actionId:string){return rpc('execute_intelligence_action',{p_action_id:actionId});}
export function completeIntelligenceAction(actionId:string,metadata:Record<string,unknown>={}){return rpc('complete_intelligence_action',{p_action_id:actionId,p_metadata:metadata});}

export async function listBusinessCertifications(businessId:string){const{data,error}=await client().from('business_certifications').select('id,business_id,status,awarded_at,expires_at,notes,certification_tiers(code,name,description,minimum_rating,minimum_reviews,minimum_check_ins,active)').eq('business_id',businessId).order('awarded_at',{ascending:false});if(error)throw error;return data||[];}
