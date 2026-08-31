import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export async function listNotificationInbox(limit=50){
  const bounded=Math.min(Math.max(Number(limit)||50,1),100);
  const {data,error}=await getKleenestSupabaseClient().rpc('user_notifications',{p_limit:bounded});
  if(error)throw error;
  return Array.isArray(data)?data:[];
}

export async function markNotificationRead(notificationId:string){
  const {data,error}=await getKleenestSupabaseClient().rpc('mark_notification_read',{p_notification_id:notificationId});
  if(error)throw error;
  return Boolean(data);
}

export async function markAllNotificationsRead(){
  const {data,error}=await getKleenestSupabaseClient().rpc('mark_all_notifications_read');
  if(error)throw error;
  return Number(data||0);
}
