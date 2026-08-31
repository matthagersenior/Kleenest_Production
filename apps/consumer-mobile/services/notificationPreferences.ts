import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type NotificationPreferences={intelligence:boolean;rewards:boolean;community:boolean;push:boolean};
export type NotificationSuppressionCounts={community:number;rewards:number;intelligence:number;total:number};
export type NotificationPreferenceStatus={preferences:NotificationPreferences;suppressed30d:NotificationSuppressionCounts};

function normalizePreferences(data:any):NotificationPreferences{
  return {
    intelligence:data?.intelligence!==false,
    rewards:data?.rewards!==false,
    community:data?.community!==false,
    push:data?.push!==false,
  };
}

export async function getNotificationPreferences():Promise<NotificationPreferences>{
  const {data,error}=await getKleenestSupabaseClient().rpc('get_my_notification_preferences');
  if(error)throw error;
  return normalizePreferences(data);
}

export async function getNotificationPreferenceStatus():Promise<NotificationPreferenceStatus>{
  const {data,error}=await getKleenestSupabaseClient().rpc('my_notification_preference_status');
  if(error)throw error;
  const suppressed=data?.suppressed_30d||{};
  return {
    preferences:normalizePreferences(data?.preferences),
    suppressed30d:{
      community:Number(suppressed.community||0),
      rewards:Number(suppressed.rewards||0),
      intelligence:Number(suppressed.intelligence||0),
      total:Number(suppressed.total||0),
    },
  };
}

export async function updateNotificationPreferences(patch:Partial<NotificationPreferences>):Promise<NotificationPreferences>{
  const {data,error}=await getKleenestSupabaseClient().rpc('update_my_notification_preferences',{
    p_intelligence:patch.intelligence??null,
    p_rewards:patch.rewards??null,
    p_community:patch.community??null,
    p_push:patch.push??null,
  });
  if(error)throw error;
  return normalizePreferences(data);
}
