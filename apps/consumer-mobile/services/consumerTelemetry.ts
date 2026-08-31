import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

function sourcesForDiscovery({search='',amenityCount=0,cached=false}:{search?:string;amenityCount?:number;cached?:boolean}={}){
  const sources=['native_mobile'];
  if(search.trim())sources.push('search');
  if(amenityCount>0)sources.push('amenity_filter');
  if(cached)sources.push('cache');
  return sources;
}

export async function recordConsumerDiscovery(input:{latitude:number;longitude:number;radiusMeters:number;resultCount:number;search?:string;amenityCount?:number}){
  const client=getKleenestSupabaseClient();
  const {error}=await client.rpc('record_location_discovery_event',{
    p_latitude:Number(input.latitude),
    p_longitude:Number(input.longitude),
    p_radius_km:Number(input.radiusMeters)/1000,
    p_sources:sourcesForDiscovery({search:input.search,amenityCount:input.amenityCount}),
    p_discovered_count:Math.max(0,Number(input.resultCount)||0),
  });
  if(error)throw error;
}

export async function recordConsumerRouteIntent(locationId:string,{fromFavorite=false}:{fromFavorite?:boolean}={}){
  const id=String(locationId||'').trim();
  if(!id)return;
  const {error}=await getKleenestSupabaseClient().rpc('record_location_route_event',{
    p_location_id:id,
    p_from_favorite:Boolean(fromFavorite),
  });
  if(error)throw error;
}

export function captureConsumerDiscovery(input:Parameters<typeof recordConsumerDiscovery>[0]){
  void recordConsumerDiscovery(input).catch(()=>{});
}

export function captureConsumerRouteIntent(locationId:string,options?:Parameters<typeof recordConsumerRouteIntent>[1]){
  void recordConsumerRouteIntent(locationId,options).catch(()=>{});
}
