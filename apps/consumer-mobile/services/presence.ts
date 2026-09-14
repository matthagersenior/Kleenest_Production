import * as Location from 'expo-location';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type ConsumerPresence = {
  signed_in?: boolean;
  inside_geofence?: boolean;
  check_in_available?: boolean;
  visit_id?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  entered_at?: string | null;
  last_seen_at?: string | null;
  departed_at?: string | null;
  verification_expires_at?: string | null;
  verification_window_minutes?: number | null;
  distance_meters?: number | null;
  geofence_radius_meters?: number | null;
};

export async function recordConsumerPresenceAt(latitude:number,longitude:number):Promise<ConsumerPresence|null>{
  const client=getKleenestSupabaseClient();
  const{data:auth,error:authError}=await client.auth.getUser();
  if(authError||!auth?.user)return null;
  const{data,error}=await client.rpc('consumer_presence_heartbeat',{p_lat:latitude,p_lng:longitude});
  if(error)throw error;
  return(data&&typeof data==='object'?data:null) as ConsumerPresence|null;
}

export async function refreshConsumerPresence():Promise<ConsumerPresence|null>{
  const client=getKleenestSupabaseClient();
  const{data:auth,error:authError}=await client.auth.getUser();
  if(authError||!auth?.user)return null;
  const permission=await Location.getForegroundPermissionsAsync();
  if(permission.status!=='granted')return null;
  const current=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
  return recordConsumerPresenceAt(current.coords.latitude,current.coords.longitude);
}

export async function getConsumerLocationPresence(locationId:string):Promise<ConsumerPresence|null>{
  const id=String(locationId||'').trim();
  if(!id)return null;
  const{data,error}=await getKleenestSupabaseClient().rpc('consumer_location_presence',{p_location_id:id});
  if(error)throw error;
  return(data&&typeof data==='object'?data:null) as ConsumerPresence|null;
}

export function presenceExpiryLabel(value:string|null|undefined){
  if(!value)return null;
  const expires=new Date(value).getTime();
  if(!Number.isFinite(expires))return null;
  const remaining=Math.max(0,expires-Date.now());
  const minutes=Math.max(1,Math.ceil(remaining/60000));
  return minutes>=60?`${Math.ceil(minutes/60)}h`:`${minutes}m`;
}
