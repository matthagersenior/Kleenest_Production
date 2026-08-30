import { getSupabase } from '../lib/supabase.js';

async function currentUser(){const {data,error}=await getSupabase().auth.getUser();if(error)throw error;if(!data?.user)throw new Error('Sign in to use notifications.');return data.user;}

export async function listNotifications(limit=50){const user=await currentUser();const {data,error}=await getSupabase().from('notifications').select('id,user_id,type,title,body,data,read_at,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(limit);if(error)throw error;return data||[];}
export async function markNotificationRead(id){const user=await currentUser();const {error}=await getSupabase().from('notifications').update({read_at:new Date().toISOString()}).eq('id',id).eq('user_id',user.id);if(error)throw error;}
export async function markAllNotificationsRead(){const user=await currentUser();const {error}=await getSupabase().from('notifications').update({read_at:new Date().toISOString()}).eq('user_id',user.id).is('read_at',null);if(error)throw error;}
export async function getNotificationPreferences(){const user=await currentUser();const {data,error}=await getSupabase().from('notification_preferences').select('user_id,intelligence,rewards,community,push,updated_at').eq('user_id',user.id).maybeSingle();if(error)throw error;return data||{user_id:user.id,intelligence:true,rewards:true,community:true,push:false};}
export async function saveNotificationPreferences(preferences){const user=await currentUser();const row={user_id:user.id,intelligence:Boolean(preferences.intelligence),rewards:Boolean(preferences.rewards),community:Boolean(preferences.community),push:Boolean(preferences.push),updated_at:new Date().toISOString()};const {data,error}=await getSupabase().from('notification_preferences').upsert(row,{onConflict:'user_id'}).select().single();if(error)throw error;return data;}

function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4);const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');const raw=window.atob(base64);return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));}
export async function enablePushNotifications(){
  const user=await currentUser();
  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw new Error('Push notifications are not supported on this device.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Notification permission was not granted.');
  const publicKey=String(import.meta.env.VITE_VAPID_PUBLIC_KEY||'').trim();if(!publicKey)throw new Error('Kleenest push is missing its public VAPID configuration.');
  const registration=await navigator.serviceWorker.ready;
  let subscription=await registration.pushManager.getSubscription();
  if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(publicKey)});
  const json=subscription.toJSON();
  const {error}=await getSupabase().from('notification_push_subscriptions').upsert({user_id:user.id,endpoint:subscription.endpoint,subscription:json,updated_at:new Date().toISOString()},{onConflict:'user_id,endpoint'});
  if(error)throw error;
  await saveNotificationPreferences({...await getNotificationPreferences(),push:true});
  return subscription;
}
