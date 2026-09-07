import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;if(data==null)throw new Error('Enterprise service returned no data.');return data;}
const asRows=(value:unknown):Record<string,any>[]=>Array.isArray(value)?value as Record<string,any>[]:[];
const range=(days:number)=>{const end=new Date(),start=new Date(end.getTime()-days*86400000);return{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)}};

export async function enterpriseAuthorized(businessId:string){return Boolean(await rpc('business_enterprise_authorized',{p_business_id:businessId}));}
export async function getEnterpriseControlPlaneSnapshot(businessId:string,windowDays=30){return rpc('enterprise_control_plane_snapshot',{p_business_id:businessId,p_window_days:windowDays}) as Promise<Record<string,unknown>>;}
export async function listOwnedEnterpriseNetworks(businessId:string){return asRows(await rpc('enterprise_list_owned_networks',{p_business_id:businessId}));}
export async function listEnterprisePartnerBusinesses(businessId:string){return asRows(await rpc('enterprise_list_partner_businesses',{p_business_id:businessId}));}
export async function listEnterpriseNetworkMembers(networkId:string){return asRows(await rpc('enterprise_list_network_members',{p_network_id:networkId}));}
export async function listEnterpriseNetworkCampaigns(networkId:string){return asRows(await rpc('enterprise_list_network_campaigns',{p_network_id:networkId}));}
export function createEnterpriseNetwork(name:string){return rpc('create_enterprise_partner_network',{p_name:name});}
export function updateEnterpriseNetwork(networkId:string,name:string,enabled:boolean){return rpc('enterprise_update_network',{p_network_id:networkId,p_name:name,p_enabled:enabled});}
export function deleteEnterpriseNetwork(networkId:string){return rpc('enterprise_delete_network',{p_network_id:networkId});}
export function inviteEnterprisePartner(networkId:string,partnerBusinessId:string){return rpc('invite_enterprise_partner',{p_network_id:networkId,p_partner_business_id:partnerBusinessId});}
export function setEnterprisePartnerStatus(membershipId:string,status:string){return rpc('set_enterprise_partner_status',{p_membership_id:membershipId,p_status:status});}
export function createEnterpriseCampaign(networkId:string,name:string,campaignType:string,goal:string){return rpc('create_enterprise_partner_campaign',{p_network_id:networkId,p_name:name,p_campaign_type:campaignType,p_goal:goal});}
export function updateEnterpriseCampaign(campaignId:string,input:{name?:string;campaignType?:string;goal?:string;status?:string}){return rpc('enterprise_update_campaign',{p_campaign_id:campaignId,p_name:input.name??null,p_campaign_type:input.campaignType??null,p_goal:input.goal??null,p_status:input.status??null});}
export function activateEnterpriseCampaign(campaignId:string){return rpc('activate_enterprise_partner_campaign',{p_campaign_id:campaignId});}
export function pauseEnterpriseCampaign(campaignId:string){return rpc('pause_enterprise_partner_campaign',{p_campaign_id:campaignId});}
export function deleteEnterpriseCampaign(campaignId:string){return rpc('enterprise_delete_campaign',{p_campaign_id:campaignId});}
export function recordEnterpriseCampaignOutcome(campaignId:string,partnerBusinessId:string,input:{visits?:number;checkIns?:number;reviews?:number;preferredUses?:number;accessRedemptions?:number;promotionRedemptions?:number;attributedUsers?:number;pointsAwarded?:number}){return rpc('record_enterprise_partner_campaign_outcome',{p_campaign_id:campaignId,p_partner_business_id:partnerBusinessId,p_visits:input.visits??0,p_check_ins:input.checkIns??0,p_reviews:input.reviews??0,p_preferred_uses:input.preferredUses??0,p_access_redemptions:input.accessRedemptions??0,p_promotion_redemptions:input.promotionRedemptions??0,p_attributed_users:input.attributedUsers??0,p_points_awarded:input.pointsAwarded??0});}
export function getPartnerCampaignRoi(campaignId:string,days=30){const r=range(days);return rpc('get_partner_campaign_roi',{p_campaign_id:campaignId,p_start:r.start,p_end:r.end});}
export function getPartnerNetworkBenchmark(networkId:string,days=30){const r=range(days);return rpc('get_partner_network_benchmark',{p_network_id:networkId,p_start:r.start,p_end:r.end});}
export function createPartnerAllocation(networkId:string,partnerBusinessId:string,campaignId:string|null,input:{type:string;quantity:number;budgetCents:number;rationale?:string}){return rpc('create_partner_allocation',{p_network_id:networkId,p_partner_business_id:partnerBusinessId,p_campaign_id:campaignId,p_type:input.type,p_quantity:input.quantity,p_budget_cents:input.budgetCents,p_rationale:input.rationale??null});}
export function activatePartnerAllocation(allocationId:string){return rpc('activate_partner_allocation',{p_allocation_id:allocationId});}
export function getPartnerAllocationRoi(networkId:string,days=30){const r=range(days);return rpc('get_partner_allocation_roi',{p_network_id:networkId,p_start:r.start,p_end:r.end});}
