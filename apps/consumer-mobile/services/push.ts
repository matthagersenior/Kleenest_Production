import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export const NATIVE_PUSH_CHANNEL='kleenest-updates';
const PUSH_TOKEN_KEY='kleenest.native.push.token.v1';

export type NativePushStatus={
  supported:boolean;
  permission:Notifications.PermissionStatus;
  canAskAgain:boolean;
  registeredToken:string|null;
};

function pushError(message:string,code:string){const error=new Error(message) as Error&{code?:string};error.code=code;return error}

export async function getNativePushStatus():Promise<NativePushStatus>{
  const supported=Platform.OS==='ios'||Platform.OS==='android';
  if(!supported)return{supported:false,permission:Notifications.PermissionStatus.UNDETERMINED,canAskAgain:false,registeredToken:null};
  const [permission,registeredToken]=await Promise.all([Notifications.getPermissionsAsync(),SecureStore.getItemAsync(PUSH_TOKEN_KEY)]);
  return{supported:true,permission:permission.status,canAskAgain:permission.canAskAgain!==false,registeredToken:registeredToken||null};
}

export async function registerNativePush(){
  if(Platform.OS!=='ios'&&Platform.OS!=='android')throw pushError('Native push is available on iOS and Android.','unsupported');
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync(NATIVE_PUSH_CHANNEL,{name:'Kleenest updates',importance:Notifications.AndroidImportance.DEFAULT});
  let permission=await Notifications.getPermissionsAsync();
  if(permission.status!=='granted'&&permission.canAskAgain!==false)permission=await Notifications.requestPermissionsAsync();
  if(permission.status!=='granted'){
    if(permission.canAskAgain===false)throw pushError('Notification permission is blocked. Enable Kleenest notifications in your phone settings.','permission-blocked');
    throw pushError('Notification permission was not granted.','permission-denied');
  }
  const projectId=Constants.easConfig?.projectId??Constants.expoConfig?.extra?.eas?.projectId??process.env.EAS_PROJECT_ID;
  if(!projectId)throw pushError('EAS project ID is required for native push registration.','missing-project-id');
  const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
  if(!token)throw pushError('This device did not return a push token.','missing-token');

  const client=getKleenestSupabaseClient();
  const previousToken=await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  if(previousToken&&previousToken!==token){
    await client.rpc('remove_notification_native_push_token',{p_token:previousToken}).catch(()=>{});
  }
  const {data,error}=await client.rpc('register_notification_native_push_token',{p_token:token,p_platform:Platform.OS,p_app_id:'com.kleenest.app'});
  if(error)throw error;
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY,token);
  return {token,registration:data,rotated:Boolean(previousToken&&previousToken!==token)};
}

export async function unregisterNativePush(token?:string|null){
  const stored=await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  const target=token||stored;
  if(!target)return false;
  const {data,error}=await getKleenestSupabaseClient().rpc('remove_notification_native_push_token',{p_token:target});
  if(error)throw error;
  if(!stored||stored===target)await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  return Boolean(data);
}
