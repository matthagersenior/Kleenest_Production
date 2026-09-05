import AsyncStorage from '@react-native-async-storage/async-storage';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const KEY='kleenest.fleet.offline.route-stop.v1';
type Event={id:string;packId:string;businessId:string;routeId:string;routeStopId:string;eventType:'arrived'|'service_started'|'completed'|'departed'|'skipped';occurredAt:string;attempts:number};
const uuid=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16),v=c==='x'?r:(r&0x3)|0x8;return v.toString(16)});
async function read():Promise<Event[]>{try{return JSON.parse((await AsyncStorage.getItem(KEY))||'[]')}catch{return[]}}
async function write(rows:Event[]){await AsyncStorage.setItem(KEY,JSON.stringify(rows.slice(-250)))}
export async function listOfflineRouteEvents(){return read()}
export async function recordOrQueueRouteStopTiming(businessId:string,routeId:string,routeStopId:string,eventType:Event['eventType']){const occurredAt=new Date().toISOString();const client=getKleenestSupabaseClient();const{error}=await client.rpc('fleet_record_route_stop_timing',{p_business_id:businessId,p_route_id:routeId,p_route_stop_id:routeStopId,p_event_type:eventType,p_occurred_at:occurredAt});if(!error)return{queued:false};const rows=await read();rows.push({id:uuid(),packId:uuid(),businessId,routeId,routeStopId,eventType,occurredAt,attempts:0});await write(rows);return{queued:true,error:error.message}}
export async function replayOfflineRouteEvents(){const rows=await read(),remaining:Event[]=[];let synced=0;for(const row of rows){const{error}=await getKleenestSupabaseClient().rpc('fleet_replay_route_stop_timing',{p_pack_id:row.packId,p_business_id:row.businessId,p_route_id:row.routeId,p_route_stop_id:row.routeStopId,p_event_type:row.eventType,p_occurred_at:row.occurredAt,p_client_event_id:row.id});if(error)remaining.push({...row,attempts:row.attempts+1});else synced++}await write(remaining);return{synced,remaining:remaining.length}}
