import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const APP_TARGET='consumer';
const PUSH_TOKEN_KEY='kleenest.native.push.token.v1';

export type NativePushRegistration={status:'registered'|'unsupported'|'denied';token?:string;rotated?:boolean;message:string};
export type NativePushStatus={permission:string;canAskAgain:boolean;registeredToken:string|null};

async function getServerToken(){
  try{
    const {data}=await getKleenestSupabaseClient().rpc('my_notification_push_delivery_status',{p_limit:50});
    const rows=Array.isArray(data)?data:[];
    const active=rows.find((row:any)=>row?.active!==false&&(row?.app_id===APP_TARGET||row?.app_id==='com.kleenest.app'));
    return active?.token?String(active.token):null;
  }catch{return null;}
}

async function removeServerToken(token:string){
  try{await getKleenestSupabaseClient().rpc('remove_notification_native_push_token',{p_token:token});}catch{}
}

export async function getNativePushStatus():Promise<NativePushStatus>{
  const permission=await Notifications.getPermissionsAsync();
  const localToken=await SecureStore.getItemAsync(PUSH_TOKEN_KEY).catch(()=>null);
  const serverToken=await getServerToken();
  const registeredToken=serverToken||localToken;
  if(serverToken&&serverToken!==localToken)await SecureStore.setItemAsync(PUSH_TOKEN_KEY,serverToken).catch(()=>{});
  if(!serverToken&&localToken)await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY).catch(()=>{});
  return {permission:permission.status,canAskAgain:permission.canAskAgain,registeredToken};
}

export async function registerNativePush():Promise<NativePushRegistration>{
  if(!Device.isDevice)return {status:'unsupported',message:'Native push requires a physical device.'};
  let permission=await Notifications.getPermissionsAsync();
  if(permission.status!=='granted'&&permission.canAskAgain)permission=await Notifications.requestPermissionsAsync();
  if(permission.status!=='granted'){
    const blocked=permission.canAskAgain===false;
    const error:any=new Error(blocked?'Notification permission is blocked. Enable it in Android settings to receive Kleenest alerts.':'Notification permission was not granted.');
    error.code=blocked?'permission-blocked':'permission-denied';
    throw error;
  }
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('default',{name:'Kleenest',importance:Notifications.AndroidImportance.DEFAULT});
  const projectId=Constants.expoConfig?.extra?.eas?.projectId||Constants.easConfig?.projectId;
  if(!projectId)throw new Error('Expo project identity is unavailable for native push registration.');
  const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
  const previousLocal=await SecureStore.getItemAsync(PUSH_TOKEN_KEY).catch(()=>null);
  const previousServer=await getServerToken();
  const oldToken=previousServer||previousLocal;
  const {error}=await getKleenestSupabaseClient().rpc('register_notification_native_push_token',{p_token:token,p_platform:Platform.OS,p_app_id:APP_TARGET});
  if(error)throw error;
  if(oldToken&&oldToken!==token)await removeServerToken(oldToken);
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY,token);
  return {status:'registered',token,rotated:Boolean(oldToken&&oldToken!==token),message:'This Consumer device is registered for Kleenest notifications.'};
}

export async function unregisterNativePush(){
  const localToken=await SecureStore.getItemAsync(PUSH_TOKEN_KEY).catch(()=>null);
  const serverToken=await getServerToken();
  const token=serverToken||localToken;
  if(!token){await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY).catch(()=>{});return false;}
  const {data,error}=await getKleenestSupabaseClient().rpc('remove_notification_native_push_token',{p_token:token});
  if(error)throw error;
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY).catch(()=>{});
  return Boolean(data);
}

export function attachNativeNotificationResponseListener(handler:(response:Notifications.NotificationResponse)=>void){return Notifications.addNotificationResponseReceivedListener(handler)}
