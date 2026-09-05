import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
const client=()=>getKleenestSupabaseClient();async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}
export const getEnterpriseControlPlaneSnapshot=(businessId:string,windowDays=30)=>rpc('enterprise_control_plane_snapshot',{p_business_id:businessId,p_window_days:windowDays});
export const getEnterpriseOperationalPortfolio=(businessId:string)=>rpc('enterprise_operational_portfolio_snapshot',{p_business_id:businessId});
export async function listOwnedEnterpriseNetworks(businessId:string){const data=await rpc('enterprise_list_owned_networks',{p_business_id:businessId});return Array.isArray(data)?data:[];}
export async function listEnterprisePartnerBusinesses(businessId:string){const data=await rpc('enterprise_list_partner_businesses',{p_business_id:businessId});return Array.isArray(data)?data:[];}
export async function listEnterpriseNetworkMembers(networkId:string){const data=await rpc('enterprise_list_network_members',{p_network_id:networkId});return Array.isArray(data)?data:[];}
export async function listEnterpriseNetworkCampaigns(networkId:string){const data=await rpc('enterprise_list_network_campaigns',{p_network_id:networkId});return Array.isArray(data)?data:[];}
export const createEnterpriseNetwork=(name:string)=>rpc('create_enterprise_partner_network',{p_name:name});
export const updateEnterpriseNetwork=(networkId:string,name:string,enabled:boolean)=>rpc('enterprise_update_network',{p_network_id:networkId,p_name:name,p_enabled:enabled});
export const deleteEnterpriseNetwork=(networkId:string)=>rpc('enterprise_delete_network',{p_network_id:networkId});
export const inviteEnterprisePartner=(networkId:string,partnerBusinessId:string)=>rpc('invite_enterprise_partner',{p_network_id:networkId,p_partner_business_id:partnerBusinessId});
export const setEnterprisePartnerStatus=(membershipId:string,status:string)=>rpc('set_enterprise_partner_status',{p_membership_id:membershipId,p_status:status});
export const createEnterpriseCampaign=(networkId:string,input:{name:string;campaignType:string;goal:string})=>rpc('create_enterprise_partner_campaign',{p_network_id:networkId,p_name:input.name,p_campaign_type:input.campaignType,p_goal:input.goal});
export const updateEnterpriseCampaign=(campaignId:string,input:{name:string;campaignType:string;goal:string;status:string})=>rpc('enterprise_update_campaign',{p_campaign_id:campaignId,p_name:input.name,p_campaign_type:input.campaignType,p_goal:input.goal,p_status:input.status});
export const activateEnterpriseCampaign=(campaignId:string)=>rpc('activate_enterprise_partner_campaign',{p_campaign_id:campaignId});
export const pauseEnterpriseCampaign=(campaignId:string)=>rpc('pause_enterprise_partner_campaign',{p_campaign_id:campaignId});
export const deleteEnterpriseCampaign=(campaignId:string)=>rpc('enterprise_delete_campaign',{p_campaign_id:campaignId});
export async function getPartnerNetworkBenchmark(networkId:string,days=30){const end=new Date(),start=new Date(end.getTime()-days*86400000);return rpc('get_partner_network_benchmark',{p_network_id:networkId,p_start:start.toISOString().slice(0,10),p_end:end.toISOString().slice(0,10)});}
export async function getPartnerCampaignRoi(campaignId:string,days=30){const end=new Date(),start=new Date(end.getTime()-days*86400000);return rpc('get_partner_campaign_roi',{p_campaign_id:campaignId,p_start:start.toISOString().slice(0,10),p_end:end.toISOString().slice(0,10)});}
export async function getPartnerAllocationRoi(networkId:string,days=30){const end=new Date(),start=new Date(end.getTime()-days*86400000);return rpc('get_partner_allocation_roi',{p_network_id:networkId,p_start:start.toISOString().slice(0,10),p_end:end.toISOString().slice(0,10)});}
export const createPartnerAllocation=(networkId:string,partnerBusinessId:string,campaignId:string|null,input:{type:string;quantity:number;budgetCents:number;rationale?:string})=>rpc('create_partner_allocation',{p_network_id:networkId,p_partner_business_id:partnerBusinessId,p_campaign_id:campaignId,p_type:input.type,p_quantity:input.quantity,p_budget_cents:input.budgetCents,p_rationale:input.rationale??null});
