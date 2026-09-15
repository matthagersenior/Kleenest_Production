import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type ConsumerFeedbackEvent='tell_kleenest_open'|'pulse_response'|'feedback_detail_opened'|'feedback_submitted';

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

export async function recordConsumerFeedbackEvent(eventName:ConsumerFeedbackEvent,input:{route?:string;metadata?:Record<string,unknown>}={}){
  const {error}=await getKleenestSupabaseClient().rpc('record_consumer_feedback_event',{
    p_event_name:eventName,
    p_route:String(input.route||'').trim()||null,
    p_metadata:input.metadata||{},
  });
  if(error)throw error;
}

export function captureConsumerDiscovery(input:Parameters<typeof recordConsumerDiscovery>[0]){
  void recordConsumerDiscovery(input).catch(()=>{});
}

export function captureConsumerRouteIntent(locationId:string,options?:Parameters<typeof recordConsumerRouteIntent>[1]){
  void recordConsumerRouteIntent(locationId,options).catch(()=>{});
}

export function captureConsumerFeedbackEvent(eventName:ConsumerFeedbackEvent,input?:Parameters<typeof recordConsumerFeedbackEvent>[1]){
  void recordConsumerFeedbackEvent(eventName,input).catch(()=>{});
}

const coreLoopSessionId='core-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);

export type ConsumerCoreLoopEvent=
  |'app_open'
  |'nearby_results_shown'
  |'place_selected'
  |'navigation_started'
  |'arrival_detected'
  |'review_started'
  |'review_submit_attempt'
  |'review_submit_success'
  |'review_submit_failed'
  |'review_photo_added'
  |'review_done';

export function captureConsumerCoreLoopEvent(
  eventName:ConsumerCoreLoopEvent,
  locationId?:string|null,
  metadata:Record<string,unknown>={}
){
  const id=String(locationId||'').trim();
  void (async()=>{
    try{
      await getKleenestSupabaseClient().rpc('record_consumer_core_loop_event',{
        p_event_name:eventName,
        p_location_id:id||null,
        p_session_id:coreLoopSessionId,
        p_metadata:metadata,
      });
    }catch{}
  })();
}

export function currentConsumerCoreLoopSession(){
  return coreLoopSessionId;
}
