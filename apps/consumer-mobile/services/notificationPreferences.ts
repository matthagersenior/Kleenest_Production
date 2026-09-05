import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type NotificationPreferences={
  intelligence:boolean;rewards:boolean;community:boolean;push:boolean;
  platform_updates:boolean;progression:boolean;offers:boolean;sponsored:boolean;
  location_alerts:boolean;social:boolean;personalized_ads:boolean;location_based_offers:boolean;
  quiet_hours_start:string|null;quiet_hours_end:string|null;
};
export type NotificationSuppressionCounts={community:number;rewards:number;intelligence:number;total:number};
export type NotificationPreferenceStatus={preferences:NotificationPreferences;suppressed30d:NotificationSuppressionCounts};

function normalizePreferences(data:any):NotificationPreferences{
  return {
    intelligence:data?.intelligence!==false,
    rewards:data?.rewards!==false,
    community:data?.community!==false,
    push:data?.push!==false,
    platform_updates:data?.platform_updates!==false,
    progression:data?.progression!==false,
    offers:data?.offers!==false,
    sponsored:data?.sponsored===true,
    location_alerts:data?.location_alerts!==false,
    social:data?.social!==false,
    personalized_ads:data?.personalized_ads===true,
    location_based_offers:data?.location_based_offers===true,
    quiet_hours_start:data?.quiet_hours_start||null,
    quiet_hours_end:data?.quiet_hours_end||null,
  };
}

export async function getNotificationPreferences():Promise<NotificationPreferences>{
  const {data,error}=await getKleenestSupabaseClient().rpc('get_my_notification_preferences_v2');
  if(error)throw error;
  return normalizePreferences(data);
}

export async function getNotificationPreferenceStatus():Promise<NotificationPreferenceStatus>{
  const [{data:prefs,error:prefsError},{data:status,error:statusError}]=await Promise.all([
    getKleenestSupabaseClient().rpc('get_my_notification_preferences_v2'),
    getKleenestSupabaseClient().rpc('my_notification_preference_status'),
  ]);
  if(prefsError)throw prefsError;if(statusError)throw statusError;
  const suppressed=status?.suppressed_30d||{};
  return {preferences:normalizePreferences(prefs),suppressed30d:{community:Number(suppressed.community||0),rewards:Number(suppressed.rewards||0),intelligence:Number(suppressed.intelligence||0),total:Number(suppressed.total||0)}};
}

export async function updateNotificationPreferences(patch:Partial<NotificationPreferences>):Promise<NotificationPreferences>{
  const {data,error}=await getKleenestSupabaseClient().rpc('update_my_notification_preferences_v2',{
    p_intelligence:patch.intelligence??null,p_rewards:patch.rewards??null,p_community:patch.community??null,p_push:patch.push??null,
    p_platform_updates:patch.platform_updates??null,p_progression:patch.progression??null,p_offers:patch.offers??null,p_sponsored:patch.sponsored??null,
    p_location_alerts:patch.location_alerts??null,p_social:patch.social??null,p_personalized_ads:patch.personalized_ads??null,p_location_based_offers:patch.location_based_offers??null,
    p_quiet_hours_start:patch.quiet_hours_start??null,p_quiet_hours_end:patch.quiet_hours_end??null,
  });
  if(error)throw error;
  return normalizePreferences(data);
}

export async function recordNotificationEngagement(notificationId:string,action:'opened'|'acted'|'redeemed',metadata:Record<string,unknown>={}){
  const {data,error}=await getKleenestSupabaseClient().rpc('record_platform_notification_engagement',{p_notification_id:notificationId,p_action:action,p_metadata:metadata});
  if(error&&String(error.message||'').toLowerCase().includes('attribution not found'))return null;
  if(error)throw error;
  return data;
}
