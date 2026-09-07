import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Linking, Platform } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { registerNativePush } from './push';

export const CONSUMER_LIVE_NETWORK_TASK='consumer-live-network';

type NearbyRow={id?:string;location_id?:string;latitude?:number;longitude?:number;distance_meters?:number;distance_m?:number;name?:string};

if(!TaskManager.isTaskDefined(CONSUMER_LIVE_NETWORK_TASK)){
  TaskManager.defineTask(CONSUMER_LIVE_NETWORK_TASK,async({data,error}:any)=>{
    if(error||!data||data.eventType!==Location.GeofencingEventType.Enter)return;
    const locationId=String(data.region?.identifier??'');
    if(!locationId)return;
    const client=getKleenestSupabaseClient();
    const {data:auth}=await client.auth.getUser();
    if(!auth.user)return;
    await client.rpc('create_gps_geofence_notification',{
      p_location_id:locationId,p_distance_m:0,p_category:'restroom',p_title:'Bathroom nearby',p_body:null,
      p_data:{source:'consumer_live_network',platform:Platform.OS,geofence_event:'enter'}
    });
  });
}

async function nearbyRegions(){
  const current=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
  const {data,error}=await getKleenestSupabaseClient().rpc('map_network_nearby_v2',{
    p_lat:current.coords.latitude,p_lng:current.coords.longitude,p_radius_m:25000,p_limit:100,p_category:'restroom',p_search:null,p_amenity_names:null
  });
  if(error)throw error;
  const rows=(Array.isArray(data)?data:[]) as NearbyRow[];
  const maximum=Platform.OS==='ios'?20:100;
  return rows.map(row=>({
    id:String(row.location_id??row.id??''),latitude:Number(row.latitude),longitude:Number(row.longitude),distance:Number(row.distance_meters??row.distance_m??0),name:String(row.name??'Restroom')
  })).filter(row=>row.id&&Number.isFinite(row.latitude)&&Number.isFinite(row.longitude)).sort((a,b)=>a.distance-b.distance).slice(0,maximum);
}

export async function getConsumerLiveNetworkStatus(){
  const[foreground,background,services,registered]=await Promise.all([Location.getForegroundPermissionsAsync(),Location.getBackgroundPermissionsAsync(),Location.hasServicesEnabledAsync(),TaskManager.isTaskRegisteredAsync(CONSUMER_LIVE_NETWORK_TASK).catch(()=>false)]);
  const regions=registered?await TaskManager.getTaskOptionsAsync(CONSUMER_LIVE_NETWORK_TASK).catch(()=>null):null;
  return{foreground:foreground.status,background:background.status,services,registered,regionCount:Array.isArray((regions as any)?.regions)?(regions as any).regions.length:0};
}

export async function openConsumerLiveNetworkSettings(){
  await Linking.openSettings();
}

export async function refreshConsumerLiveNetworkRegions(){
  const registered=await TaskManager.isTaskRegisteredAsync(CONSUMER_LIVE_NETWORK_TASK).catch(()=>false);
  if(!registered)return{registered:0};
  const nearby=await nearbyRegions();
  await Location.startGeofencingAsync(CONSUMER_LIVE_NETWORK_TASK,nearby.map(row=>({identifier:row.id,latitude:row.latitude,longitude:row.longitude,radius:200,notifyOnEnter:true,notifyOnExit:false})));
  return{registered:nearby.length};
}

export async function enableConsumerLiveNetwork(){
  const foreground=await Location.requestForegroundPermissionsAsync();
  if(foreground.status!=='granted')throw new Error('Location permission is required for Live Network nearby-restroom alerts.');
  let background=await Location.getBackgroundPermissionsAsync();
  if(background.status!=='granted'&&Platform.OS!=='android')background=await Location.requestBackgroundPermissionsAsync();
  if(background.status!=='granted')throw new Error('Background location is off. Open Kleenest location settings, choose Allow all the time, return to Kleenest, then enable Live Network again.');
  await registerNativePush();
  const nearby=await nearbyRegions();
  if(!nearby.length)throw new Error('No nearby restroom locations with valid coordinates are available yet.');
  await Location.startGeofencingAsync(CONSUMER_LIVE_NETWORK_TASK,nearby.map(row=>({identifier:row.id,latitude:row.latitude,longitude:row.longitude,radius:200,notifyOnEnter:true,notifyOnExit:false})));
  return{registered:nearby.length};
}

export async function disableConsumerLiveNetwork(){
  const registered=await TaskManager.isTaskRegisteredAsync(CONSUMER_LIVE_NETWORK_TASK).catch(()=>false);
  if(registered)await Location.stopGeofencingAsync(CONSUMER_LIVE_NETWORK_TASK);
}
