import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export const BUSINESS_GEOFENCE_TASK='kleenest-business-live-network-geofence';
const APP_ID='com.kleenest.business';

export type ManifestRow={geofence_id:string;business_id:string;location_id:string;radius_meters:number;notification_enabled:boolean;active:boolean;location_name:string|null;latitude:number;longitude:number;address?:string|null;city?:string|null;state?:string|null};

function decodeIdentifier(identifier:string){const[geofenceId,businessId,locationId]=identifier.split('|');return{geofenceId,businessId,locationId};}
function client(){return getKleenestSupabaseClient();}

if(!TaskManager.isTaskDefined(BUSINESS_GEOFENCE_TASK)){
 TaskManager.defineTask(BUSINESS_GEOFENCE_TASK,async({data,error}:any)=>{
  if(error||!data)return;
  try{
   const{eventType,region}=data;const ids=decodeIdentifier(String(region?.identifier??''));
   if(!ids.geofenceId||!ids.businessId||!ids.locationId)return;
   const{data:auth}=await client().auth.getUser();if(!auth.user)return;
   const type=eventType===Location.GeofencingEventType.Enter?'enter':eventType===Location.GeofencingEventType.Exit?'exit':'unknown';if(type==='unknown')return;
   await client().rpc('record_geofence_event',{p_geofence_id:ids.geofenceId,p_user_id:auth.user.id,p_location_id:ids.locationId,p_business_id:ids.businessId,p_event_type:type,p_dwell_seconds:null,p_metadata:{source:'business_live_network_background',platform:Platform.OS},p_notification_id:null,p_qr_code_id:null,p_check_in_id:null});
  }catch{/* background tasks must never crash the host process */}
 });
}

export async function ensureLiveNetworkGeofences(businessId:string,radiusMeters=150){const{data,error}=await client().rpc('business_ensure_live_network_geofences',{p_business_id:businessId,p_radius_meters:radiusMeters});if(error)throw new Error(error.message);return data as{touched?:number;manifest?:ManifestRow[]}|null;}
export async function listLiveNetworkManifest(businessId:string):Promise<ManifestRow[]>{const{data,error}=await client().rpc('business_live_network_manifest',{p_business_id:businessId});if(error)throw new Error(error.message);return(Array.isArray(data)?data:[]) as ManifestRow[];}
export async function configureLiveNetworkGeofence(geofenceId:string,input:{radiusMeters:number;notificationEnabled:boolean;active:boolean}){const{data,error}=await client().rpc('configure_business_geofence',{p_geofence_id:geofenceId,p_radius_meters:input.radiusMeters,p_notification_enabled:input.notificationEnabled,p_notification_payload:{title:'Kleenest Live Network',body:'Live location activity is available for this business location.'},p_active:input.active});if(error)throw new Error(error.message);return data;}

export async function getLiveNetworkStatus(){
 const[foreground,background,services,registered,notifications]=await Promise.all([
  Location.getForegroundPermissionsAsync().catch(()=>({status:'undetermined'} as any)),
  Location.getBackgroundPermissionsAsync().catch(()=>({status:'undetermined'} as any)),
  Location.hasServicesEnabledAsync().catch(()=>false),
  TaskManager.isTaskRegisteredAsync(BUSINESS_GEOFENCE_TASK).catch(()=>false),
  Notifications.getPermissionsAsync().catch(()=>({status:'undetermined'} as any)),
 ]);
 return{foreground:foreground.status,background:background.status,notifications:notifications.status,services,registered};
}

export async function requestLiveNetworkForegroundPermission(){const permission=await Location.requestForegroundPermissionsAsync();if(permission.status!=='granted')throw new Error('Foreground location permission is required before Live Network can start.');return permission.status;}

export async function requestLiveNetworkBackgroundPermission(){
 const foreground=await Location.getForegroundPermissionsAsync();
 if(foreground.status!=='granted')throw new Error('Grant foreground location first.');
 const current=await Location.getBackgroundPermissionsAsync();
 if(current.status==='granted')return current.status;
 const result=await Location.requestBackgroundPermissionsAsync();
 if(result.status!=='granted')throw new Error(Platform.OS==='android'?'Background location was not granted. Android may open App settings for this permission; return to Kleenest Business after allowing it.':'Background location permission is required for Live Network alerts when the app is not open.');
 return result.status;
}

export async function startLiveNetworkGeofencing(businessId:string){
 const status=await getLiveNetworkStatus();
 if(!status.services)throw new Error('Turn on device location services before starting Live Network.');
 if(status.foreground!=='granted')throw new Error('Grant foreground location first.');
 if(status.background!=='granted')throw new Error('Grant background location separately, then return and start Live Network.');
 await ensureLiveNetworkGeofences(businessId);
 const manifest=await listLiveNetworkManifest(businessId);
 if(!manifest.length)throw new Error('No active Business locations with coordinates are available for Live Network yet.');
 const maximum=Platform.OS==='ios'?20:100;
 const regions=manifest.slice(0,maximum).filter(row=>Number.isFinite(Number(row.latitude))&&Number.isFinite(Number(row.longitude))).map(row=>({identifier:`${row.geofence_id}|${row.business_id}|${row.location_id}`,latitude:Number(row.latitude),longitude:Number(row.longitude),radius:Math.max(50,Math.min(Number(row.radius_meters||150),1000)),notifyOnEnter:true,notifyOnExit:true}));
 if(!regions.length)throw new Error('No valid geofence coordinates are available for this workspace.');
 await Location.startGeofencingAsync(BUSINESS_GEOFENCE_TASK,regions);
 return{registered:regions.length,total:manifest.length,platformLimit:maximum};
}

export async function disableLiveNetwork(){const registered=await TaskManager.isTaskRegisteredAsync(BUSINESS_GEOFENCE_TASK).catch(()=>false);if(registered)await Location.stopGeofencingAsync(BUSINESS_GEOFENCE_TASK);return true;}

export async function registerLiveNetworkPush(){
 const permission=await Notifications.requestPermissionsAsync();
 if(permission.status!=='granted')throw new Error('Notification permission is required for Live Network alerts.');
 if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('live-network',{name:'Live Network',importance:Notifications.AndroidImportance.HIGH});
 const projectId=String(Constants.expoConfig?.extra?.eas?.projectId??'');
 if(!projectId)throw new Error('Expo project identity is missing for push registration.');
 let token:string;
 try{token=(await Notifications.getExpoPushTokenAsync({projectId})).data;}catch(cause){const detail=cause instanceof Error?cause.message:String(cause);throw new Error(`Native push token could not be created. ${detail}`);}
 const{error}=await client().rpc('register_notification_native_push_token',{p_token:token,p_platform:Platform.OS,p_app_id:APP_ID});
 if(error)throw new Error(error.message);
 return token;
}
