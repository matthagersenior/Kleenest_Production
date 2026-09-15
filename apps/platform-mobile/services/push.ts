import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const PUSH_INTENT_KEY='kleenestos:push-enabled:v1';
const nativePushConfigured=Constants.expoConfig?.extra?.nativePushConfigured===true;
export type RolePushStatus='registered'|'disabled'|'available'|'needs_permission'|'blocked'|'unsupported'|'unconfigured'|'needs_repair';
export type RolePushState={status:RolePushStatus;message:string;token?:string};

async function readPushIntent(){
  if(Platform.OS==='web')return false;
  return (await SecureStore.getItemAsync(PUSH_INTENT_KEY).catch(()=>null))==='true';
}
async function writePushIntent(enabled:boolean){
  if(Platform.OS==='web')return;
  await SecureStore.setItemAsync(PUSH_INTENT_KEY,enabled?'true':'false');
}
async function expoToken(Notifications:any){
  const projectId=Constants.expoConfig?.extra?.eas?.projectId||Constants.easConfig?.projectId;
  if(!projectId)throw new Error('Expo project identity is unavailable.');
  return (await Notifications.getExpoPushTokenAsync({projectId})).data as string;
}
async function registerToken(token:string):Promise<RolePushState>{
  const{error}=await getKleenestSupabaseClient().rpc('register_notification_native_push_token',{p_token:token,p_platform:Platform.OS,p_app_id:'kleenestos'});
  if(error)throw error;
  return{status:'registered',token,message:'KleenestOS device notifications enabled and registered.'};
}

export async function getRolePushStatus():Promise<RolePushState>{
  if(Platform.OS==='web')return{status:'unsupported',message:'Push requires the installed KleenestOS app on a physical device.'};
  if(Platform.OS==='android'&&!nativePushConfigured)return{status:'unconfigured',message:'KleenestOS push is not configured in this build yet.'};
  const Notifications=await import('expo-notifications');
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('kleenestos-operations',{name:'KleenestOS Operations',importance:Notifications.AndroidImportance.DEFAULT});
  const intent=await readPushIntent();
  const permission=await Notifications.getPermissionsAsync();
  if(permission.status!=='granted'){
    if(!intent)return{status:'disabled',message:'Device push has not been enabled in KleenestOS.'};
    return permission.canAskAgain
      ?{status:'needs_permission',message:'KleenestOS remembers that push is enabled, but Android notification permission needs to be granted again.'}
      :{status:'blocked',message:'KleenestOS remembers that push is enabled, but notifications are blocked in system settings.'};
  }
  if(!intent)return{status:'available',message:'Android allows notifications. Tap Enable this device to keep KleenestOS registered for push.'};
  const token=await expoToken(Notifications);
  const{data,error}=await getKleenestSupabaseClient().from('notification_native_push_tokens').select('id,active').eq('token',token).eq('app_id','kleenestos').maybeSingle();
  if(error)throw error;
  return data?.active
    ?{status:'registered',token,message:'Push is enabled, persisted, and registered for this device.'}
    :{status:'needs_repair',token,message:'Push permission is enabled, but the server registration needs repair.'};
}

export async function registerRolePush():Promise<RolePushState>{
  if(Platform.OS==='web')return{status:'unsupported',message:'Push requires a physical device.'};
  if(Platform.OS==='android'&&!nativePushConfigured)return{status:'unconfigured',message:'KleenestOS push is not configured in this build yet. The app stayed open safely; add the Owner Firebase credential and install the next verified build to enable device notifications.'};

  const Notifications=await import('expo-notifications');
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('kleenestos-operations',{name:'KleenestOS Operations',importance:Notifications.AndroidImportance.DEFAULT});

  let permission=await Notifications.getPermissionsAsync();
  if(permission.status!=='granted'&&permission.canAskAgain)permission=await Notifications.requestPermissionsAsync();
  if(permission.status!=='granted'){
    await writePushIntent(true);
    return{status:permission.canAskAgain?'needs_permission':'blocked',message:permission.canAskAgain?'Notification permission was not granted. KleenestOS will remember that you want push enabled.':'Notification permission is blocked in system settings. KleenestOS will remember that you want push enabled.'};
  }

  const token=await expoToken(Notifications);
  const result=await registerToken(token);
  await writePushIntent(true);
  return result;
}

export async function syncRolePushRegistration():Promise<RolePushState>{
  if(Platform.OS==='web')return{status:'unsupported',message:'Push requires a physical device.'};
  if(Platform.OS==='android'&&!nativePushConfigured)return{status:'unconfigured',message:'KleenestOS push is not configured in this build yet.'};
  const intent=await readPushIntent();
  if(!intent)return{status:'disabled',message:'Device push has not been enabled in KleenestOS.'};

  const Notifications=await import('expo-notifications');
  const permission=await Notifications.getPermissionsAsync();
  if(permission.status!=='granted')return permission.canAskAgain
    ?{status:'needs_permission',message:'Push remains enabled in KleenestOS, but notification permission needs to be granted again.'}
    :{status:'blocked',message:'Push remains enabled in KleenestOS, but notifications are blocked in system settings.'};

  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('kleenestos-operations',{name:'KleenestOS Operations',importance:Notifications.AndroidImportance.DEFAULT});
  return registerToken(await expoToken(Notifications));
}
