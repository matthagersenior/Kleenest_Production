import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}

export type DeveloperBundle={
  bundle_key:string;label:string;description:string;plan:'developer'|'growth'|'fleet'|'enterprise';
  scopes:string[];api_products:string[];integration_surfaces:string[];
  default_quota_per_minute:number;default_quota_per_month:number;active:boolean;sort_order:number;
};
export type DeveloperPartner={
  id:string;slug:string;name:string;status:'active'|'suspended'|'closed';plan:string;
  quota_per_minute:number;quota_per_month:number;bundle_key:string|null;bundle_label:string|null;
  api_products:string[];pilot_session_id:string|null;owner_notes:string|null;member_count:number;
  active_key_count:number;active_webhook_count:number;month_requests:number;updated_at:string;
};
export type DeveloperCredential={
  id:string;label:string;key_prefix:string;scopes:string[];credential_type:'secret'|'publishable';
  allowed_origins:string[];credential_quota_per_minute:number|null;expires_at:string|null;revoked_at:string|null;
  last_used_at:string|null;created_at:string;
};
export type DeveloperMember={user_id:string;email:string|null;role:'owner'|'admin'|'developer';joined_at:string};
export type DeveloperWebhook={id:string;label:string;url:string;event_types:string[];active:boolean;consecutive_failures:number;last_success_at:string|null;last_failure_at:string|null;created_at:string};
export type DeveloperAudit={id:string;action:string;changed_by:string|null;reason:string|null;previous_state:unknown;next_state:unknown;created_at:string};
export type DeveloperPilot={id:string;name:string;offer_key:string;organization_name:string|null;status:string};
export type DeveloperPartnerDetail={
  partner:{id:string;slug:string;name:string;status:'active'|'suspended'|'closed';plan:string;quota_per_minute:number;quota_per_month:number;created_at:string;updated_at:string};
  product_access:{bundle_key:string|null;bundle_label:string|null;api_products:string[];integration_surfaces:string[];scopes:string[];pilot_session_id:string|null;owner_notes:string|null;updated_at:string}|null;
  billing:{provider:string;status:string;plan_code:string|null;external_customer_id:string|null;external_subscription_id:string|null;current_period_end:string|null;updated_at:string}|null;
  api_keys:DeveloperCredential[];webhooks:DeveloperWebhook[];members:DeveloperMember[];control_log:DeveloperAudit[];
  bundles:DeveloperBundle[];available_pilots:DeveloperPilot[];month_usage:{month_start:string;request_count:number};daily_usage:Array<{usage_date:string;route:string;request_count:number;success_count:number;client_error_count:number;server_error_count:number;units?:number}>;
};

export async function getDeveloperPartners():Promise<DeveloperPartner[]>{const v=await rpc('owner_platform_partner_directory');return Array.isArray(v)?v as DeveloperPartner[]:[];}
export async function getDeveloperBundles():Promise<DeveloperBundle[]>{const v=await rpc('owner_platform_product_bundles');return Array.isArray(v)?v as DeveloperBundle[]:[];}
export async function getDeveloperPartnerDetail(partnerId:string):Promise<DeveloperPartnerDetail>{return await rpc('owner_platform_partner_detail',{p_partner_id:partnerId}) as DeveloperPartnerDetail;}

export async function createDeveloperPartner(input:{slug:string;name:string;bundleKey:string;pilotSessionId?:string|null}){
  return rpc('owner_create_platform_partner',{p_slug:input.slug,p_name:input.name,p_bundle_key:input.bundleKey,p_pilot_session_id:input.pilotSessionId??null});
}
export async function updateDeveloperPartner(partnerId:string,patch:Record<string,unknown>,reason='KleenestOS developer partner update'){
  return rpc('owner_update_platform_partner',{p_partner_id:partnerId,p_patch:patch,p_reason:reason});
}
export async function applyDeveloperBundle(partnerId:string,bundleKey:string,reason='KleenestOS developer product bundle applied'){
  return rpc('owner_apply_platform_product_bundle',{p_partner_id:partnerId,p_bundle_key:bundleKey,p_reason:reason});
}
export async function inviteDeveloperMember(partnerId:string,email:string,role:'owner'|'admin'|'developer'='developer',expiresAt?:string){
  return rpc('owner_platform_partner_invite',{p_partner_id:partnerId,p_email:email,p_role:role,p_expires_at:expiresAt??new Date(Date.now()+7*86400000).toISOString()});
}
export async function updateDeveloperMember(partnerId:string,userId:string,role:'owner'|'admin'|'developer'|null,reason='KleenestOS developer team access update'){
  return rpc('owner_update_platform_partner_member',{p_partner_id:partnerId,p_user_id:userId,p_role:role,p_reason:reason});
}
export async function issueDeveloperApiKey(partnerId:string,label:string,scopes?:string[],expiresAt?:string|null){
  return rpc('owner_issue_platform_api_key',{p_partner_id:partnerId,p_label:label,p_scopes:scopes??null,p_expires_at:expiresAt??null});
}
export async function issueDeveloperBrowserToken(partnerId:string,label:string,allowedOrigins:string[],expiresAt:string,quotaPerMinute:number){
  return rpc('owner_issue_platform_publishable_token',{p_partner_id:partnerId,p_label:label,p_allowed_origins:allowedOrigins,p_expires_at:expiresAt,p_quota_per_minute:quotaPerMinute});
}
export async function revokeDeveloperCredential(partnerId:string,apiKeyId:string){return rpc('owner_revoke_platform_api_key',{p_partner_id:partnerId,p_api_key_id:apiKeyId});}
export async function createDeveloperWebhook(partnerId:string,url:string,label:string,eventTypes:string[]){
  return rpc('owner_create_platform_webhook',{p_partner_id:partnerId,p_url:url,p_label:label,p_event_types:eventTypes});
}
export async function disableDeveloperWebhook(partnerId:string,endpointId:string){return rpc('owner_disable_platform_webhook',{p_partner_id:partnerId,p_endpoint_id:endpointId});}
export async function setDeveloperPartnerBilling(partnerId:string,input:{provider:string;status:string;planCode?:string|null;externalCustomerId?:string|null;externalSubscriptionId?:string|null;currentPeriodEnd?:string|null}){
  return rpc('owner_set_platform_partner_billing',{
    p_partner_id:partnerId,p_provider:input.provider,p_status:input.status,p_plan_code:input.planCode??null,
    p_external_customer_id:input.externalCustomerId??null,p_external_subscription_id:input.externalSubscriptionId??null,
    p_current_period_end:input.currentPeriodEnd??null
  });
}
