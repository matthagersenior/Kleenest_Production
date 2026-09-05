import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const APP_TARGET='consumer';

export type NativePushRegistration={status:'registered'|'unsupported'|'denied';token?:string;rotated?:boolean;message:string};
export type NativePushStatus={permission:string;canAskAgain:boolean;registeredToken:string|null};

export async function getNativePushStatus():Promise<NativePushStatus>{
  const permissions=await Notifications.getPermissionsAsync();
  let registeredToken:string|null=null;
  try{
    const {data}=await getKleenestSupabaseClient().rpc('my_notification_push_delivery_status',{p_limit:20});
    const rows=Array.isArray(data)?data:[];
    const active=rows.find((row:any)=>row?.active!==false&&(row?.app_id===APP_TARGET||row?.app_id==='com.kleenest.app'));
    registeredToken=active?.token||null;
  }catch{}
  return {permission:permissions.status,canAskAgain:permissions.canAskAgain,registeredToken};
}

export async function registerNativePush():Promise<NativePushRegistration>{
  if(!Device.isDevice)return {status:'unsupported',message:'Native push requires a physical device.'};
  let permission=await Notifications.getPermissionsAsync();
  if(permission.status!=='granted'&&permission.canAskAgain)permission=await Notifications.requestPermissionsAsync();
  if(permission.status!=='granted'){
    const error:any=new Error(permission.canAskAgain?'Notification permission was not granted.':'Notification permission is blocked. Enable it in Android settings to receive Kleenest alerts.');
    error.code=permission.canAskAgain?'permission-denied':'permission-blocked';
    throw error;
  }
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('default',{name:'Kleenest',importance:Notifications.AndroidImportance.DEFAULT});
  const projectId=Constants.expoConfig?.extra?.eas?.projectId||Constants.easConfig?.projectId;
  if(!projectId)throw new Error('Expo project identity is unavailable for native push registration.');
  const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
  const {data:existing}=await getKleenestSupabaseClient().rpc('my_notification_push_delivery_status',{p_limit:50});
  const old=Array.isArray(existing)?existing.find((row:any)=>row?.active!==false&&(row?.app_id===APP_TARGET||row?.app_id==='com.kleenest.app')):null;
  const {error}=await getKleenestSupabaseClient().rpc('register_notification_native_push_token',{p_token:token,p_platform:Platform.OS,p_app_id:APP_TARGET});
  if(error)throw error;
  if(old?.token&&old.token!==token)await getKleenestSupabaseClient().rpc('remove_notification_native_push_token',{p_token:old.token}).catch(()=>{});
  return {status:'registered',token,rotated:Boolean(old?.token&&old.token!==token),message:'This Consumer device is registered for Kleenest notifications.'};
}

export async function unregisterNativePush(){
  const status=await getNativePushStatus();
  if(!status.registeredToken)return false;
  const {data,error}=await getKleenestSupabaseClient().rpc('remove_notification_native_push_token',{p_token:status.registeredToken});
  if(error)throw error;
  return Boolean(data);
}

export function attachNativeNotificationResponseListener(handler:(response:Notifications.NotificationResponse)=>void){return Notifications.addNotificationResponseReceivedListener(handler)}
