import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type NotificationPreferences={intelligence:boolean;rewards:boolean;community:boolean;push:boolean};

export async function getNotificationPreferences():Promise<NotificationPreferences>{
  const {data,error}=await getKleenestSupabaseClient().rpc('get_my_notification_preferences');
  if(error)throw error;
  return {
    intelligence:data?.intelligence!==false,
    rewards:data?.rewards!==false,
    community:data?.community!==false,
    push:data?.push!==false,
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
  return {
    intelligence:data?.intelligence!==false,
    rewards:data?.rewards!==false,
    community:data?.community!==false,
    push:data?.push!==false,
  };
}
