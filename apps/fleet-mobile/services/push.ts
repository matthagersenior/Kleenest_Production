import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const APP_ID='fleet';

function base64UrlToUint8Array(value:string){
  const padding='='.repeat((4-value.length%4)%4);
  const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=globalThis.atob(base64);
  return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));
}

async function registerWebPush(){
  if(typeof window==='undefined'||typeof navigator==='undefined'||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
    return{status:'web-push-unsupported' as const,message:'This browser does not support Kleenest web push notifications.'};
  }
  let permission=window.Notification.permission;
  if(permission==='default')permission=await window.Notification.requestPermission();
  if(permission!=='granted')return{status:'permission-denied' as const,message:'Notification permission is not granted in this browser.'};

  await navigator.serviceWorker.register('/Kleenest_Production/sw.js',{scope:'/Kleenest_Production/'});
  const registration=await navigator.serviceWorker.ready;
  const client:any=getKleenestSupabaseClient();
  const supabaseUrl=String(client.supabaseUrl||process.env.EXPO_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'');
  if(!supabaseUrl)return{status:'push-config-missing' as const,message:'Kleenest web push configuration is unavailable.'};
  const configResponse=await fetch(`${supabaseUrl}/functions/v1/deliver-push-notification`,{method:'GET',headers:{accept:'application/json'}});
  if(!configResponse.ok)throw new Error('Kleenest web push public configuration could not be loaded.');
  const config=await configResponse.json();
  const publicKey=String(config?.vapid_public_key||'').trim();
  if(!publicKey)throw new Error('Kleenest web push public key is unavailable.');

  let subscription=await registration.pushManager.getSubscription();
  if(!subscription){
    subscription=await registration.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:base64UrlToUint8Array(publicKey),
    });
  }
  const{error}=await client.rpc('register_notification_push_subscription',{
    p_endpoint:subscription.endpoint,
    p_subscription:subscription.toJSON(),
  });
  if(error)throw error;
  return{status:'registered-web' as const,endpoint:subscription.endpoint};
}

export async function registerRolePush(){
  if(Platform.OS==='web')return registerWebPush();
  const projectId=(Constants.expoConfig?.extra as any)?.eas?.projectId||(Constants as any).easConfig?.projectId;
  if(!projectId)return{status:'project-id-missing' as const,message:'Link Kleenest Fleet to its own Expo/EAS project before native push registration.'};
  let permission=await Notifications.getPermissionsAsync();
  if(permission.status!=='granted'&&permission.canAskAgain)permission=await Notifications.requestPermissionsAsync();
  if(permission.status!=='granted')return{status:'permission-denied' as const,message:'Notification permission is not granted.'};
  const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
  const{error}=await getKleenestSupabaseClient().rpc('register_notification_native_push_token',{p_token:token,p_platform:'android',p_app_id:APP_ID});
  if(error)throw error;
  return{status:'registered' as const,token};
}
