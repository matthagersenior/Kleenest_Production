import AsyncStorage from '@react-native-async-storage/async-storage';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const LOCAL_OFFLINE_PACKS_KEY='kleenest.native.offline.route-packs.v1';
const MAX_LOCAL_PACKS=12;
const client=()=>getKleenestSupabaseClient();

export type LocalOfflinePack={
  id:string;
  pack_type:string;
  name:string;
  status:string;
  route_discovery_session_id?:string|null;
  route_id?:string|null;
  expires_at?:string|null;
  savedAt:number;
  locations:any[];
};

function isExpired(expiresAt?:string|null){
  if(!expiresAt)return false;
  const value=Date.parse(expiresAt);
  return Number.isFinite(value)&&value<=Date.now();
}

function normalizeLocalPack(value:any):LocalOfflinePack|null{
  if(!value||typeof value!=='object'||typeof value.id!=='string'||!Array.isArray(value.locations))return null;
  return{
    id:value.id,
    pack_type:String(value.pack_type||'route'),
    name:String(value.name||'Offline route'),
    status:String(value.status||'ready'),
    route_discovery_session_id:value.route_discovery_session_id?String(value.route_discovery_session_id):null,
    route_id:value.route_id?String(value.route_id):null,
    expires_at:value.expires_at?String(value.expires_at):null,
    savedAt:Number.isFinite(Number(value.savedAt))?Number(value.savedAt):Date.now(),
    locations:value.locations,
  };
}

export async function readLocalOfflinePacks(limit=30):Promise<LocalOfflinePack[]>{
  try{
    const raw=await AsyncStorage.getItem(LOCAL_OFFLINE_PACKS_KEY);
    if(!raw)return[];
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed))return[];
    const active=parsed.map(normalizeLocalPack).filter((pack):pack is LocalOfflinePack=>Boolean(pack)&&!isExpired(pack?.expires_at)).sort((a,b)=>b.savedAt-a.savedAt).slice(0,Math.max(1,limit));
    if(active.length!==parsed.length)await AsyncStorage.setItem(LOCAL_OFFLINE_PACKS_KEY,JSON.stringify(active.slice(0,MAX_LOCAL_PACKS)));
    return active;
  }catch{return[];}
}

export async function listSavedRoutePlans(limit=30){
  const{data,error}=await client().from('route_plans').select('id,name,start_lat,start_lng,end_lat,end_lng,distance_miles,estimated_minutes,route_geometry,created_at,updated_at').order('updated_at',{ascending:false}).limit(limit);
  if(error)throw error;
  return data||[];
}

export async function listOfflinePacks(limit=30){
  const{data,error}=await client().from('offline_packs').select('id,pack_type,name,status,route_discovery_session_id,expires_at,created_at,updated_at').order('updated_at',{ascending:false}).limit(limit);
  if(error)throw error;
  return data||[];
}

async function ensureRouteGeometry(routeId:string){
  const c=client();
  const{data:route,error:routeError}=await c.from('route_plans').select('id,start_lat,start_lng,end_lat,end_lng,route_geometry').eq('id',routeId).single();
  if(routeError)throw routeError;
  if(route?.route_geometry)return route.route_geometry;
  const{data:stops,error:stopsError}=await c.from('route_stops').select('stop_order,location_id,locations!inner(latitude,longitude)').eq('route_id',routeId).order('stop_order',{ascending:true});
  if(stopsError)throw stopsError;
  const points:[[number,number],...Array<[number,number]>]=[[Number(route.start_lng),Number(route.start_lat)],...(stops||[]).map((row:any)=>[Number(row.locations?.longitude),Number(row.locations?.latitude)] as [number,number])];
  if(points.some(([lng,lat])=>!Number.isFinite(lng)||!Number.isFinite(lat)))throw new Error('Saved route is missing valid coordinates.');
  const last:[number,number]=[Number(route.end_lng),Number(route.end_lat)];
  if(Number.isFinite(last[0])&&Number.isFinite(last[1])&&(points.at(-1)?.[0]!==last[0]||points.at(-1)?.[1]!==last[1]))points.push(last);
  if(points.length<2)throw new Error('Saved route needs at least two route points.');
  const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${points.map(([lng,lat])=>`${lng},${lat}`).join(';')}?overview=full&geometries=geojson&steps=false`,{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('Routing provider could not reconstruct this saved route.');
  const payload=await response.json();
  const geometry=payload?.routes?.[0]?.geometry;
  if(!geometry)throw new Error('Routing provider returned no route geometry.');
  const{data,error}=await c.rpc('set_route_plan_geometry',{p_route_id:routeId,p_route_geometry:geometry});
  if(error)throw error;
  return(data as any)?.route_geometry||geometry;
}

export async function prepareRouteOfflinePack(routeId:string,name?:string){
  const c=client();
  await ensureRouteGeometry(routeId);
  const{data:session,error:sessionError}=await c.rpc('prepare_route_discovery',{p_route_id:routeId,p_corridor_meters:1000,p_expires_minutes:180});
  if(sessionError)throw sessionError;
  const sessionId=String((session as any)?.id||'');
  if(!sessionId)throw new Error('Route discovery did not return a session id.');
  const{count:discovered,error:countError}=await c.from('route_discovery_locations').select('location_id',{count:'exact',head:true}).eq('session_id',sessionId);
  if(countError)throw countError;
  if(!Number(discovered||0))throw new Error('No Kleenest restrooms were discovered inside this route corridor. The route was not marked offline-ready.');
  const{data:pack,error:packError}=await c.rpc('create_offline_pack',{p_pack_type:'route',p_name:name||'Offline route',p_business_id:null,p_route_discovery_session_id:sessionId,p_west:null,p_south:null,p_east:null,p_north:null,p_expires_hours:24});
  if(packError)throw packError;
  const packId=String((pack as any)?.id||'');
  if(!packId)throw new Error('Offline pack creation returned no pack id.');
  const{data:packedRows,error:packedError}=await c.from('offline_pack_locations').select('location_id,snapshot,source_version,cached_at').eq('pack_id',packId).order('cached_at',{ascending:true});
  if(packedError)throw packedError;
  const locations=(packedRows||[]).map((row:any)=>{
    const snapshot=row?.snapshot&&typeof row.snapshot==='object'?row.snapshot:{};
    return{...snapshot,location_id:String(snapshot.location_id||snapshot.id||row.location_id||'')};
  }).filter((snapshot:any)=>snapshot.location_id&&Number.isFinite(Number(snapshot.latitude))&&Number.isFinite(Number(snapshot.longitude)));
  if(!locations.length)throw new Error('Offline pack was created without usable restroom snapshots and was rejected as incomplete.');
  await writeLocalOfflinePack({
    id:packId,
    pack_type:String((pack as any)?.pack_type||'route'),
    name:String((pack as any)?.name||name||'Offline route'),
    status:String((pack as any)?.status||'ready'),
    route_discovery_session_id:sessionId,
    route_id:routeId,
    expires_at:(pack as any)?.expires_at?String((pack as any).expires_at):new Date(Date.now()+24*60*60*1000).toISOString(),
    savedAt:Date.now(),
    locations,
  });
  return{session,pack,discoveredLocations:Number(discovered||0),packedLocations:locations.length};
}

export const writeLocalOfflinePack=async(pack:LocalOfflinePack)=>{
  const existing=await readLocalOfflinePacks(MAX_LOCAL_PACKS);
  const next=[pack,...existing.filter(item=>item.id!==pack.id)].sort((a,b)=>b.savedAt-a.savedAt).slice(0,MAX_LOCAL_PACKS);
  await AsyncStorage.setItem(LOCAL_OFFLINE_PACKS_KEY,JSON.stringify(next));
};
