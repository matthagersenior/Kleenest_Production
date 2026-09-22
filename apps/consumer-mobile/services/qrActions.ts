import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { startTrustMission } from './trustMissions';

export type QrTrustState='community'|'placement_verified'|'kleenest_verified'|'business_claimed';
export type QrPlacementStatus='digital_only'|'placed_unverified'|'placement_verified'|'disputed';

export type ResolvedQrAction={
  id:string;
  code:string;
  location_id:string|null;
  location_name?:string|null;
  location_address?:string|null;
  location_city?:string|null;
  location_state?:string|null;
  location_postal_code?:string|null;
  location_place_type?:string|null;
  brand_name?:string|null;
  rating?:number|null;
  review_count?:number|null;
  business_id:string|null;
  business_name?:string|null;
  business_logo_url?:string|null;
  business_website?:string|null;
  business_description?:string|null;
  label:string|null;
  purpose:string|null;
  action_type:string;
  action_payload:Record<string,unknown>;
  single_use:boolean;
  canonical_location_identity?:boolean;
  qr_scope?:'community'|'business';
  placement_status?:QrPlacementStatus;
  trust_state?:QrTrustState;
  business_claimed?:boolean;
  network_verified?:boolean;
  claimable?:boolean;
  network?:Record<string,unknown>;
  deep_link?:string|null;
  feedback_available?:boolean;
  review_requires_verified_visit?:boolean;
  location_route?:string|null;
};

export type LocationQrIdentity=ResolvedQrAction&{
  canonical_location_identity:true;
  qr_scope:'community'|'business';
  placement_status:QrPlacementStatus;
  trust_state:QrTrustState;
  business_claimed:boolean;
  network_verified:boolean;
  claimable:boolean;
  deep_link:string;
};

export type QrPlacementEventType='placed'|'placement_verified'|'damaged'|'missing'|'unauthorized'|'removed';

export function normalizeQrCode(raw:string){
  const value=String(raw||'').trim();
  if(!value)return'';
  const query=value.match(/[?&]code=([^&#]+)/i);
  if(query?.[1]){
    try{return decodeURIComponent(query[1]).trim()}catch{return query[1].trim()}
  }
  const path=value.match(/(?:kleenest:\/\/qr\/|\/qr\/)([A-Za-z0-9_-]+)$/i);
  if(path?.[1])return path[1].trim();
  return value;
}

export async function resolveQrAction(code:string):Promise<ResolvedQrAction>{
  const value=normalizeQrCode(code);if(!value)throw new Error('QR code is required.');
  const client=getKleenestSupabaseClient();
  const {data,error}=await client.rpc('resolve_custom_qr_action',{p_qr_code:value});if(error)throw error;
  if(!data?.id)throw new Error('QR action could not be resolved.');
  await client.rpc('record_qr_attribution',{p_code:value,p_action_type:'scan',p_source:'consumer_mobile',p_metadata:{purpose:data.purpose,action_type:data.action_type,canonical_location_identity:Boolean(data.canonical_location_identity)}});
  return data as ResolvedQrAction;
}

export async function ensureLocationQrIdentity(locationId:string):Promise<LocationQrIdentity>{
  const id=String(locationId||'').trim();if(!id)throw new Error('Location is required.');
  const{data,error}=await getKleenestSupabaseClient().rpc('ensure_location_qr_identity',{p_location_id:id});
  if(error)throw error;
  if(!data?.id||!data?.code)throw new Error('Location QR identity could not be created.');
  return data as LocationQrIdentity;
}

export async function recordLocationQrPlacementEvent(
  code:string,
  eventType:QrPlacementEventType,
  latitude:number|null=null,
  longitude:number|null=null,
  metadata:Record<string,unknown>={}
){
  const value=normalizeQrCode(code);if(!value)throw new Error('QR code is required.');
  const{data,error}=await getKleenestSupabaseClient().rpc('record_location_qr_placement_event',{
    p_code:value,p_event_type:eventType,p_lat:latitude,p_lng:longitude,p_metadata:metadata,
  });
  if(error)throw error;
  return data as {event_id?:string;duplicate?:boolean;event_type?:string;placement_status?:QrPlacementStatus;distance_meters?:number;xp_awarded?:number;progression?:Record<string,unknown>};
}

export async function verifyQrCheckIn(code:string,latitude:number,longitude:number,accuracyMeters:number|null=null){
  const value=normalizeQrCode(code);if(!value)throw new Error('QR code is required.');
  const client=getKleenestSupabaseClient();
  const normalizedAccuracy=Number.isFinite(Number(accuracyMeters))?Math.max(0,Number(accuracyMeters)):null;
  const {data,error}=await client.rpc('verify_checkin',{p_qr_code:value,p_lat:latitude,p_lng:longitude,p_accuracy_m:normalizedAccuracy});
  if(error)throw error;
  return data;
}

export async function executeQrAction(action:ResolvedQrAction){
  const type=String(action.action_type||'').toLowerCase();
  if(type==='smart_amenity'){
    const locationId=String(action.location_id||action.action_payload?.locationId||action.action_payload?.location_id||'');
    if(!locationId)throw new Error('This Smart Restroom QR is missing its location.');
    return {kind:'smart_amenity' as const,locationId,amenity:'Connected / Smart Restroom'};
  }
  if(type==='trust_mission'){
    const locationId=String(action.location_id||action.action_payload?.location_id||'');
    if(!locationId)throw new Error('This trust-mission QR is missing its restroom location.');
    const mission=await startTrustMission(locationId,'qr_reverification');
    return {kind:'trust_mission' as const,locationId,mission};
  }
  return {kind:type||'custom',locationId:action.location_id||null,action};
}
