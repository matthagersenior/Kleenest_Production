import { getKleenestSupabaseClient } from './index';

export async function listMobileNotifications(limit=50){
  const bounded=Math.min(Math.max(Number(limit)||50,1),100);
  const {data,error}=await getKleenestSupabaseClient().rpc('user_notifications',{p_limit:bounded});
  if(error)throw error;
  return Array.isArray(data)?data:[];
}

export async function markMobileNotificationRead(id:string){
  const {error}=await getKleenestSupabaseClient().rpc('mark_notification_read',{p_notification_id:id});
  if(error)throw error;
}

export async function markAllMobileNotificationsRead(){
  const {error}=await getKleenestSupabaseClient().rpc('mark_all_notifications_read');
  if(error)throw error;
}
