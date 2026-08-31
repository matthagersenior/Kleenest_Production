import { getSupabase } from '../lib/supabase.js';
import { getAccountSummary } from './account.js';

export async function getWorkspaceContext(){
  const client=getSupabase();
  const [summaryResult,entitlementsResult,businessResult]=await Promise.allSettled([
    getAccountSummary(),
    client.rpc('get_current_user_product_entitlements'),
    client.rpc('business_list_workspaces',{p_include_demo:false}),
  ]);
  if(summaryResult.status==='rejected')throw summaryResult.reason;
  const summary=summaryResult.value||{};
  const profile=summary.profile||{};
  const entitlements=entitlementsResult.status==='fulfilled'&&!entitlementsResult.value.error?(entitlementsResult.value.data||[]):[];
  const businesses=businessResult.status==='fulfilled'&&!businessResult.value.error?(businessResult.value.data||[]):[];
  const serviceTiers=new Set(entitlements.map(row=>String(row.service_tier||'').toLowerCase()));
  const tier=String(profile.subscription_tier||'free').toLowerCase();
  const role=String(profile.role||'customer').toLowerCase();
  const fleetEnabled=entitlements.some(row=>Boolean(row.fleet_enabled))||serviceTiers.has('fleet')||tier==='fleet';
  const enterpriseEnabled=entitlements.some(row=>Boolean(row.enterprise_fleet_enabled))||serviceTiers.has('business_enterprise')||serviceTiers.has('enterprise')||tier==='enterprise';
  const platformEnabled=Boolean(profile.is_platform_owner||profile.is_admin||role==='admin');
  const businessEnabled=Boolean(profile.is_business_user||role==='business'||businesses.length||[...serviceTiers].some(value=>value.startsWith('business_')));
  return {profile,subscriptions:Array.isArray(summary.subscriptions)?summary.subscriptions:[],entitlements,businesses,access:{consumer:true,business:businessEnabled,fleet:fleetEnabled,enterprise:enterpriseEnabled,platform:platformEnabled}};
}

export async function getBusinessWorkspaceOverview(businessId){
  if(!businessId)throw new Error('Business workspace id is required.');
  const client=getSupabase();const now=new Date();const start=new Date(now.getTime()-30*86400000);
  const [access,summary,locations,management,profile,restroomHealth]=await Promise.all([
    client.rpc('get_business_product_access',{p_business_id:businessId}),
    client.rpc('business_dashboard_secure_summary',{p_business_id:businessId,p_start:start.toISOString(),p_end:now.toISOString()}),
    client.rpc('business_list_locations',{p_business_id:businessId}),
    client.rpc('business_management_context',{p_business_id:businessId}),
    client.rpc('business_get_profile',{p_business_id:businessId}),
    client.rpc('business_restroom_health_score',{p_business_id:businessId,p_location_id:null}),
  ]);
  for(const result of [access,summary,locations,management,profile,restroomHealth])if(result.error)throw result.error;
  return {access:access.data?.[0]||null,summary:summary.data||{},locations:locations.data||[],management:management.data||{},profile:profile.data||{},restroomHealth:restroomHealth.data||{}};
}

export async function getBusinessAnalyticsOverview(businessId,{days=30}={}){
  if(!businessId)throw new Error('Business workspace id is required.');
  const client=getSupabase();const end=new Date();const start=new Date(end.getTime()-Math.max(1,Number(days)||30)*86400000);
  const args={p_business_id:businessId,p_start:start.toISOString(),p_end:end.toISOString()};
  const calls={
    campaigns:client.rpc('business_campaign_analytics',args),
    engagement:client.rpc('business_engagement_analytics',args),
    locations:client.rpc('business_location_analytics',args),
    locationDetail:client.rpc('business_location_detail',args),
    locationIntelligence:client.rpc('business_location_intelligence',args),
    qr:client.rpc('business_qr_detail',args),
    reviews:client.rpc('business_review_detail',args),
    benchmark:client.rpc('business_benchmark_analytics',args),
    campaignDetail:client.rpc('business_campaign_detail',args),
    events:client.rpc('business_event_detail',args),
    media:client.rpc('business_media_detail',args),
    occupancy:client.rpc('business_occupancy_analytics',args),
    partner:client.rpc('business_partner_analytics',args),
    partnerDetail:client.rpc('business_partner_detail',args),
    roi:client.rpc('business_roi_analytics',args),
    visitors:client.rpc('business_visitors_analytics',args),
    promotions:client.rpc('business_promotion_detail',args),
    promotionSummary:client.rpc('business_promotion_analytics',args),
  };
  const entries=Object.entries(calls);const settled=await Promise.allSettled(entries.map(([,promise])=>promise));const data={};const unavailable={};
  settled.forEach((result,index)=>{const key=entries[index][0];if(result.status==='fulfilled'&&!result.value.error)data[key]=result.value.data??null;else unavailable[key]=result.status==='rejected'?(result.reason?.message||'Unavailable'):(result.value.error?.message||'Unavailable');});
  if(Object.keys(data).length===0)throw new Error(Object.values(unavailable)[0]||'Business analytics are unavailable.');
  return {window:{start:start.toISOString(),end:end.toISOString(),days:Math.max(1,Number(days)||30)},...data,unavailable};
}

export async function getFleetWorkspaceOverview(businessId){
  if(!businessId)throw new Error('A Fleet-enabled business workspace is required.');
  const client=getSupabase();
  const [authorized,dispatch,summary,signals,exceptions]=await Promise.all([
    client.rpc('business_fleet_authorized',{p_business_id:businessId}),
    client.rpc('fleet_current_user_dispatch',{p_business_id:businessId}),
    client.rpc('fleet_dashboard_summary_v2',{p_business_id:businessId}),
    client.rpc('fleet_operational_signal_summary',{p_business_id:businessId,p_window_hours:24}),
    client.rpc('fleet_operations_exception_intelligence',{p_business_id:businessId,p_window_hours:24}),
  ]);
  for(const result of [authorized,dispatch,summary,signals,exceptions])if(result.error)throw result.error;
  if(!authorized.data)throw new Error('Fleet access is not enabled for this business.');
  return {dispatch:dispatch.data||{},summary:summary.data||{},signals:signals.data||{},exceptions:exceptions.data||{}};
}

export async function getEnterpriseWorkspaceOverview(businessId){
  if(!businessId)throw new Error('An Enterprise-enabled business workspace is required.');
  const client=getSupabase();
  const [authorized,snapshot,networks,partners]=await Promise.all([
    client.rpc('business_enterprise_authorized',{p_business_id:businessId}),
    client.rpc('enterprise_control_plane_snapshot',{p_business_id:businessId,p_window_days:30}),
    client.rpc('enterprise_list_owned_networks',{p_business_id:businessId}),
    client.rpc('enterprise_list_partner_businesses',{p_business_id:businessId}),
  ]);
  for(const result of [authorized,snapshot,networks,partners])if(result.error)throw result.error;
  if(!authorized.data)throw new Error('Enterprise access is not enabled for this business.');
  return {snapshot:snapshot.data||{},networks:networks.data||[],partners:partners.data||[]};
}

export async function getPlatformWorkspaceOverview(){
  const context=await getWorkspaceContext();
  if(!context.access.platform)throw new Error('Platform workspace access is restricted to platform owners and administrators.');
  const client=getSupabase();
  const [pending,activity,reports]=await Promise.all([
    client.rpc('admin_list_pending_businesses'),
    client.rpc('admin_list_activity_events',{p_limit:50}),
    client.rpc('admin_list_review_reports',{p_status:'open'}),
  ]);
  for(const result of [pending,activity,reports])if(result.error)throw result.error;
  return {pendingBusinesses:pending.data||[],activity:activity.data||[],reviewReports:reports.data||[]};
}