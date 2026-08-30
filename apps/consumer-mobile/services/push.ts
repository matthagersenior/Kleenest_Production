import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export const NATIVE_PUSH_CHANNEL='kleenest-updates';

export async function registerNativePush(){
  if(Platform.OS!=='ios'&&Platform.OS!=='android')throw new Error('Native push is available on iOS and Android.');
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync(NATIVE_PUSH_CHANNEL,{name:'Kleenest updates',importance:Notifications.AndroidImportance.DEFAULT});
  let permission=await Notifications.getPermissionsAsync();
  if(permission.status!=='granted')permission=await Notifications.requestPermissionsAsync();
  if(permission.status!=='granted')throw new Error('Notification permission was not granted.');
  const projectId=Constants.easConfig?.projectId??Constants.expoConfig?.extra?.eas?.projectId??process.env.EAS_PROJECT_ID;
  if(!projectId)throw new Error('EAS project ID is required for native push registration.');
  const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
  const {data,error}=await getKleenestSupabaseClient().rpc('register_notification_native_push_token',{p_token:token,p_platform:Platform.OS,p_app_id:'com.kleenest.app'});
  if(error)throw error;
  return {token,registration:data};
}

export async function unregisterNativePush(token:string){
  if(!token)return false;
  const {data,error}=await getKleenestSupabaseClient().rpc('remove_notification_native_push_token',{p_token:token});
  if(error)throw error;
  return Boolean(data);
}
