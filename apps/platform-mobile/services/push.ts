import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const PUSH_INTENT_KEY='kleenestos:push-enabled:v1';
const PUSH_LAUNCH_PROMPTED_KEY='kleenestos:push-launch-prompted:v1';
const nativePushConfigured=Constants.expoConfig?.extra?.nativePushConfigured===true;
export type RolePushStatus='registered'|'disabled'|'available'|'needs_permission'|'blocked'|'unsupported'|'unconfigured'|'needs_repair';
export type RolePushReadiness={
  configuration:'ready'|'missing'|'unsupported'|'unknown';
  permission:'granted'|'not_granted'|'blocked'|'unknown'|'unavailable';
  registration:'registered'|'not_enabled'|'not_registered'|'needs_repair'|'unverified'|'unavailable';
};
export type RolePushState={status:RolePushStatus;message:string;token?:string;readiness:RolePushReadiness};
const baseReadiness=():RolePushReadiness=>({
  configuration:Platform.OS==='android'?(nativePushConfigured?'ready':'missing'):Platform.OS==='web'?'unsupported':'unknown',
  permission:'unknown',
  registration:'unverified',
});

let launchRegistration:Promise<RolePushState>|null=null;

/** Request notification permission once after the first authenticated native launch. */
export async function initializeRolePushAtLaunch():Promise<RolePushState>{
  if(Platform.OS==='web')return{status:'unsupported',message:'Push requires the installed KleenestOS app on a physical device.'};
  if(Platform.OS==='android'&&!nativePushConfigured)return getRolePushStatus();
  if(launchRegistration)return launchRegistration;

  launchRegistration=(async()=>{
    if(await readPushIntent())return syncRolePushRegistration();
    const prompted=await SecureStore.getItemAsync(PUSH_LAUNCH_PROMPTED_KEY).catch(()=>null);
    if(prompted==='true')return getRolePushStatus();
    await SecureStore.setItemAsync(PUSH_LAUNCH_PROMPTED_KEY,'true').catch(()=>undefined);
    return registerRolePush();
  })();
  try{return await launchRegistration;}finally{launchRegistration=null;}
}

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
  return{status:'registered',token,message:'KleenestOS device notifications enabled and registered.',readiness:{...baseReadiness(),permission:'granted',registration:'registered'}};
}

export async function getRolePushStatus():Promise<RolePushState>{
  if(Platform.OS==='web')return{status:'unsupported',message:'Push requires the installed KleenestOS app on a physical device.',readiness:{configuration:'unsupported',permission:'unavailable',registration:'unavailable'}};
  if(Platform.OS==='android'&&!nativePushConfigured)return{status:'unconfigured',message:'KleenestOS push is not configured in this build yet. Install the verified Owner build with Firebase push configured.',readiness:{...baseReadiness(),registration:'not_registered'}};
  const Notifications=await import('expo-notifications');
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('kleenestos-operations',{name:'KleenestOS Operations',importance:Notifications.AndroidImportance.DEFAULT});
  const intent=await readPushIntent();
  const permission=await Notifications.getPermissionsAsync();
  if(permission.status!=='granted'){
    const readiness={...baseReadiness(),permission:permission.canAskAgain?'not_granted' as const:'blocked' as const,registration:intent?'not_registered' as const:'not_enabled' as const};
    if(!intent)return{status:'disabled',message:'Notifications are not enabled on this device yet.',readiness};
    return permission.canAskAgain
      ?{status:'needs_permission',message:'KleenestOS remembers that push is enabled, but Android notification permission needs to be granted again.',readiness}
      :{status:'blocked',message:'KleenestOS remembers that push is enabled, but notifications are blocked in Android settings.',readiness};
  }
  if(!intent)return{status:'available',message:'Android allows notifications. Enable this device to register it for KleenestOS push.',readiness:{...baseReadiness(),permission:'granted',registration:'not_enabled'}};
  const token=await expoToken(Notifications);
  const{data,error}=await getKleenestSupabaseClient().from('notification_native_push_tokens').select('id,active').eq('token',token).eq('app_id','kleenestos').maybeSingle();
  if(error)throw error;
  return data?.active
    ?{status:'registered',token,message:'Push is enabled, persisted, and registered for this device.',readiness:{...baseReadiness(),permission:'granted',registration:'registered'}}
    :{status:'needs_repair',token,message:'Push permission is enabled, but the server registration needs repair.',readiness:{...baseReadiness(),permission:'granted',registration:'needs_repair'}};
}
export async function registerRolePush():Promise<RolePushState>{
  if(Platform.OS==='web')return{status:'unsupported',message:'Push requires a physical device.',readiness:{configuration:'unsupported',permission:'unavailable',registration:'unavailable'}};
  if(Platform.OS==='android'&&!nativePushConfigured)return{status:'unconfigured',message:'KleenestOS push is not configured in this build yet. The app stayed open safely; install the verified Owner build with Firebase push configured.',readiness:{...baseReadiness(),registration:'not_registered'}};

  const Notifications=await import('expo-notifications');
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('kleenestos-operations',{name:'KleenestOS Operations',importance:Notifications.AndroidImportance.DEFAULT});

  let permission=await Notifications.getPermissionsAsync();
  if(permission.status!=='granted'&&permission.canAskAgain)permission=await Notifications.requestPermissionsAsync();
  if(permission.status!=='granted'){
    await writePushIntent(true);
    const readiness={...baseReadiness(),permission:permission.canAskAgain?'not_granted' as const:'blocked' as const,registration:'not_registered' as const};
    return permission.canAskAgain
      ?{status:'needs_permission',message:'Notification permission was not granted. You can enable it in Android settings.',readiness}
      :{status:'blocked',message:'Notification permission is blocked in Android settings.',readiness};
  }

  const token=await expoToken(Notifications);
  const result=await registerToken(token);
  await writePushIntent(true);
  return result;
}
export async function syncRolePushRegistration():Promise<RolePushState>{
  if(Platform.OS==='web')return{status:'unsupported',message:'Push requires a physical device.',readiness:{configuration:'unsupported',permission:'unavailable',registration:'unavailable'}};
  if(Platform.OS==='android'&&!nativePushConfigured)return{status:'unconfigured',message:'KleenestOS push is not configured in this build yet.',readiness:{...baseReadiness(),registration:'not_registered'}};
  const intent=await readPushIntent();
  if(!intent)return{status:'disabled',message:'Device push has not been enabled in KleenestOS.',readiness:{...baseReadiness(),registration:'not_enabled'}};

  const Notifications=await import('expo-notifications');
  const permission=await Notifications.getPermissionsAsync();
  if(permission.status!=='granted'){
    const readiness={...baseReadiness(),permission:permission.canAskAgain?'not_granted' as const:'blocked' as const,registration:'not_registered' as const};
    return permission.canAskAgain
      ?{status:'needs_permission',message:'Push remains enabled in KleenestOS, but notification permission needs to be granted again.',readiness}
      :{status:'blocked',message:'Push remains enabled in KleenestOS, but notifications are blocked in Android settings.',readiness};
  }

  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('kleenestos-operations',{name:'KleenestOS Operations',importance:Notifications.AndroidImportance.DEFAULT});
  return registerToken(await expoToken(Notifications));
}
