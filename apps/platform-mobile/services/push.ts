import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export async function registerRolePush(){
  if(!Device.isDevice)return{status:'unsupported',message:'Push requires a physical device.'};
  const nativePushConfigured=Constants.expoConfig?.extra?.nativePushConfigured===true;
  if(Platform.OS==='android'&&!nativePushConfigured)return{status:'unconfigured',message:'KleenestOS push is not configured in this build yet. The app stayed open safely; add the Owner Firebase credential and install the next verified build to enable device notifications.'};

  const Notifications=await import('expo-notifications');
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('kleenestos-operations',{name:'KleenestOS Operations',importance:Notifications.AndroidImportance.DEFAULT});

  let p=await Notifications.getPermissionsAsync();
  if(p.status!=='granted'&&p.canAskAgain)p=await Notifications.requestPermissionsAsync();
  if(p.status!=='granted')return{status:'denied',message:p.canAskAgain?'Notification permission was not granted.':'Notification permission is blocked in system settings.'};

  const projectId=Constants.expoConfig?.extra?.eas?.projectId||Constants.easConfig?.projectId;
  if(!projectId)throw new Error('Expo project identity is unavailable.');
  const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
  const{error}=await getKleenestSupabaseClient().rpc('register_notification_native_push_token',{p_token:token,p_platform:Platform.OS,p_app_id:'kleenestos'});
  if(error)throw error;
  return{status:'registered',token,message:'KleenestOS device notifications enabled.'};
}
