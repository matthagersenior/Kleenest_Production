import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { requirePlatformOwner } from './ownerAdmin';
function rows(value:unknown){return Array.isArray(value)?value:[];}
function object(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
export type OwnerProgressionObjective={id:string;kind:'quest'|'mission'|'challenge'|'journey'|'campaign'|'contest';code:string;title:string;description:string;status:string;starts_at:string|null;ends_at:string|null;rules:Record<string,unknown>;rewards:Record<string,unknown>;scope:Record<string,unknown>;created_at:string;participants:number;completed:number};
export async function getOwnerEconomySnapshot(){await requirePlatformOwner();const client=getKleenestSupabaseClient();const[snapshot,catalog]=await Promise.all([client.rpc('owner_progression_platform_snapshot'),client.rpc('owner_progression_xp_action_catalog')]);if(snapshot.error)throw new Error(snapshot.error.message);if(catalog.error)throw new Error(catalog.error.message);const s=object(snapshot.data);return{usersWithXp:Number(s.users_with_xp??0),xpAwarded:Number(s.xp_awarded??0),xpLast24h:Number(s.xp_last_24h??0),xpPrev24h:Number(s.xp_prev_24h??0),discoveries:Number(s.discoveries??0),onSiteDiscoveries:Number(s.on_site_discoveries??0),discoveryPhotos:Number(s.discovery_photos??0),activeObjectives:Number(s.active_objectives??0),awardsByAction:rows(s.awards_by_action),recentDiscoveries:rows(s.recent_discoveries),anomalyCandidates:rows(s.anomaly_candidates),xpActionCatalog:rows(catalog.data)};}
export async function updateOwnerXpAction(input:{action:string;baseXp:number;cooldownSeconds:number;maxPerDay:number|null;enabled:boolean;reason:string}){await requirePlatformOwner();const{data,error}=await getKleenestSupabaseClient().rpc('owner_update_progression_xp_action',{p_action:input.action,p_base_xp:input.baseXp,p_cooldown_seconds:input.cooldownSeconds,p_max_per_day:input.maxPerDay,p_enabled:input.enabled,p_reason:input.reason.trim()});if(error)throw new Error(error.message);return data;}
export async function listOwnerProgressionObjectives():Promise<OwnerProgressionObjective[]>{await requirePlatformOwner();const{data,error}=await getKleenestSupabaseClient().rpc('owner_progression_objective_list');if(error)throw new Error(error.message);return(Array.isArray(data)?data:[]) as OwnerProgressionObjective[];}
export async function saveOwnerProgressionObjective(input:{id?:string|null;kind:OwnerProgressionObjective['kind'];code:string;title:string;description:string;status:string;startsAt:string|null;endsAt:string|null;action:string;target:number;xpReward:number;audience?:string|null;reason:string}){await requirePlatformOwner();const{data,error}=await getKleenestSupabaseClient().rpc('owner_progression_objective_upsert',{p_id:input.id??null,p_kind:input.kind,p_code:input.code.trim(),p_title:input.title.trim(),p_description:input.description.trim(),p_status:input.status,p_starts_at:input.startsAt,p_ends_at:input.endsAt,p_rules:{action:input.action.trim(),target:input.target},p_rewards:{xp:input.xpReward},p_scope:input.audience?.trim()?{audience:input.audience.trim()}:{},p_reason:input.reason.trim()});if(error)throw new Error(error.message);return data as OwnerProgressionObjective;}
export async function setOwnerProgressionObjectiveStatus(id:string,status:string,reason:string){await requirePlatformOwner();const{data,error}=await getKleenestSupabaseClient().rpc('owner_progression_objective_set_status',{p_id:id,p_status:status,p_reason:reason.trim()});if(error)throw new Error(error.message);return data as OwnerProgressionObjective;}
export async function deleteOwnerProgressionObjective(id:string,reason:string){await requirePlatformOwner();const{data,error}=await getKleenestSupabaseClient().rpc('owner_progression_objective_delete',{p_id:id,p_reason:reason.trim()});if(error)throw new Error(error.message);return Boolean(data);}
export async function getOwnerProgressionSupplyStatus(){await requirePlatformOwner();const{data,error}=await getKleenestSupabaseClient().rpc('owner_progression_supply_status');if(error)throw new Error(error.message);return object(data);}
export async function maintainOwnerProgressionSupply(){await requirePlatformOwner();const{data,error}=await getKleenestSupabaseClient().rpc('owner_maintain_progression_supply');if(error)throw new Error(error.message);return data;}

export type OwnerProgressionReward={
  code:string;reward_kind:string;reward_key:string;name:string;description:string|null;active:boolean;
  owner_only:boolean;progression_unlock_enabled:boolean;min_global_level:number;min_trust_score:number;
  min_lifetime_xp:number;min_badges:number;active_grants:number;recent_grants:any[];metadata:Record<string,unknown>;
};
export async function listOwnerProgressionRewards():Promise<OwnerProgressionReward[]>{await requirePlatformOwner();const{data,error}=await getKleenestSupabaseClient().rpc('owner_progression_reward_catalog');if(error)throw new Error(error.message);return(Array.isArray(data)?data:[]) as OwnerProgressionReward[];}
export async function grantOwnerProgressionReward(userId:string,rewardCode:string,reason:string){await requirePlatformOwner();const{data,error}=await getKleenestSupabaseClient().rpc('owner_grant_progression_reward',{p_target_user_id:userId,p_reward_code:rewardCode,p_reason:reason.trim()});if(error)throw new Error(error.message);return data;}
export async function revokeOwnerProgressionReward(userId:string,rewardCode:string,reason:string){await requirePlatformOwner();const{data,error}=await getKleenestSupabaseClient().rpc('owner_revoke_progression_reward',{p_target_user_id:userId,p_reward_code:rewardCode,p_reason:reason.trim()});if(error)throw new Error(error.message);return data;}
export async function updateOwnerProgressionRewardPolicy(input:{rewardCode:string;ownerOnly:boolean;progressionUnlockEnabled:boolean;minGlobalLevel:number;minTrustScore:number;minLifetimeXp:number;minBadges:number;reason:string}){await requirePlatformOwner();const{data,error}=await getKleenestSupabaseClient().rpc('owner_update_progression_reward_policy',{p_reward_code:input.rewardCode,p_owner_only:input.ownerOnly,p_progression_unlock_enabled:input.progressionUnlockEnabled,p_min_global_level:input.minGlobalLevel,p_min_trust_score:input.minTrustScore,p_min_lifetime_xp:input.minLifetimeXp,p_min_badges:input.minBadges,p_reason:input.reason.trim()});if(error)throw new Error(error.message);return data;}


export type OwnerCreatorMissionAttributionSummary={
  days:number;
  missions:Array<{
    mission_code:string;
    title:string;
    status:string;
    creator_name:string;
    creator_handle:string;
    creator_slug:string;
    tracking_slug:string;
    landing_views:number;
    open_app:number;
    install_intents:number;
    unique_sessions:number;
  }>;
};

export async function getOwnerCreatorMissionAttributionSummary(days=90):Promise<OwnerCreatorMissionAttributionSummary>{
  await requirePlatformOwner();
  const {data,error}=await getKleenestSupabaseClient().rpc('owner_creator_mission_attribution_summary',{p_days:Math.min(Math.max(Math.round(days),1),366)});
  if(error)throw new Error(error.message);
  const value=(data&&typeof data==='object'&&!Array.isArray(data)?data:{}) as Record<string,unknown>;
  return {
    days:Number(value.days??days),
    missions:Array.isArray(value.missions)?value.missions as OwnerCreatorMissionAttributionSummary['missions']:[]
  };
}
