import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();
async function rpc<T=any>(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data as T;}

export type NotificationRule={
  id:string;code:string;name:string;description?:string|null;enabled:boolean;dry_run:boolean;
  event_pattern:string;match_mode:'exact'|'prefix';notification_class:'platform'|'progression'|'incentive'|'sponsored'|'operational'|'intelligence'|'social'|'location';
  audience_scope:'actor'|'all_users'|'nearby'|'business_members'|'fleet_members'|'enterprise_members'|'followers';
  app_targets:string[];channels:string[];priority:'low'|'normal'|'high'|'urgent';radius_meters:number;
  frequency_cap_count:number;frequency_cap_window_minutes:number;starts_at?:string|null;ends_at?:string|null;
  title_template:string;body_template:string;deep_link?:string|null;image_url?:string|null;targeting?:Record<string,unknown>;incentive?:Record<string,unknown>;attribution?:Record<string,unknown>;
  sponsored_message:boolean;personalized:boolean;location_targeted:boolean;updated_at?:string;
};

export type NotificationControlSnapshot={rules:NotificationRule[];recent_runs:any[];outcomes:{delivered:number;opened:number;acted:number;redeemed:number};delivery_health:any;generated_at:string};
export type IngestionControlSnapshot={status:any;sources:any[];markets:any[];storage_guard:any;history:any[];generated_at:string};

export const getNotificationControlSnapshot=(limit=100)=>rpc<NotificationControlSnapshot>('owner_notification_control_snapshot',{p_limit:limit});
export const saveNotificationRule=(rule:Partial<NotificationRule>&Record<string,unknown>,reason='KleenestOS notification studio update')=>rpc<NotificationRule>('owner_upsert_platform_notification_rule',{p_rule:rule,p_reason:reason});
export const deleteNotificationRule=(ruleId:string,reason='KleenestOS notification studio delete')=>rpc<boolean>('owner_delete_platform_notification_rule',{p_rule_id:ruleId,p_reason:reason});
export const publishNotificationRule=(ruleId:string,locationId:string|null=null,payload:Record<string,unknown>={},forceDryRun:boolean|null=null)=>rpc('owner_publish_platform_notification_rule',{p_rule_id:ruleId,p_location_id:locationId,p_payload:payload,p_force_dry_run:forceDryRun});

export const getIngestionControlSnapshot=(limit=100)=>rpc<IngestionControlSnapshot>('owner_ingestion_control_snapshot',{p_limit:limit});
export const updateIngestionSourcePolicy=(sourceKey:string,patch:Record<string,unknown>,reason='KleenestOS ingestion source update')=>rpc('owner_update_ingestion_source_policy',{p_source_key:sourceKey,p_patch:patch,p_reason:reason});
export const updateIngestionStorageGuard=(patch:Record<string,unknown>,reason='KleenestOS ingestion storage guard update')=>rpc('owner_update_ingestion_storage_guard',{p_patch:patch,p_reason:reason});
export const updateIngestionMarket=(marketId:string,priority:number|null,enabled:boolean|null,reason='KleenestOS ingestion market update')=>rpc('owner_update_ingestion_market',{p_market_id:marketId,p_priority:priority,p_enabled:enabled,p_reason:reason});
export const runIngestionCycle=(reason='KleenestOS manual ingestion cycle')=>rpc('owner_run_ingestion_cycle',{p_reason:reason});
export const repairIngestionCells=(reason='KleenestOS stalled-cell repair')=>rpc('owner_repair_ingestion_cells',{p_reason:reason});
export const authorizeIngestionResume=(authorized:boolean)=>rpc('admin_set_national_ingestion_resume_authorization',{p_authorized:authorized});
