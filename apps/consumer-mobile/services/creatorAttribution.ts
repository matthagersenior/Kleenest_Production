import AsyncStorage from '@react-native-async-storage/async-storage';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const SESSION_KEY='kleenest.creatorMission.session';
const ATTRIBUTION_KEY='kleenest.creatorMission.attribution';

function randomKey(){
  const cryptoObj=(globalThis as any)?.crypto;
  if(cryptoObj?.randomUUID)return cryptoObj.randomUUID();
  return 'cm-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
}

async function creatorMissionSessionKey(){
  const existing=await AsyncStorage.getItem(SESSION_KEY);
  if(existing)return existing;
  const created=randomKey();
  await AsyncStorage.setItem(SESSION_KEY,created);
  return created;
}

export type CreatorMissionAttribution={
  trackingSlug:string;
  channel:string;
  capturedAt:string;
};

export async function rememberCreatorMissionAttribution(trackingSlug:string,channel='social'){
  const value:CreatorMissionAttribution={trackingSlug:String(trackingSlug||'').trim().toLowerCase(),channel:String(channel||'social').trim().toLowerCase(),capturedAt:new Date().toISOString()};
  if(!value.trackingSlug)return;
  await AsyncStorage.setItem(ATTRIBUTION_KEY,JSON.stringify(value));
}

export async function getRememberedCreatorMissionAttribution():Promise<CreatorMissionAttribution|null>{
  try{
    const raw=await AsyncStorage.getItem(ATTRIBUTION_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    return parsed&&typeof parsed.trackingSlug==='string'?parsed:null;
  }catch{return null}
}

export async function recordCreatorMissionAttribution(
  trackingSlug:string,
  eventName:'landing_view'|'open_app'|'install_intent'|'share',
  channel='social',
  metadata:Record<string,unknown>={}
){
  const slug=String(trackingSlug||'').trim().toLowerCase();
  if(!slug)return;
  const sessionKey=await creatorMissionSessionKey();
  await rememberCreatorMissionAttribution(slug,channel);
  const {error}=await getKleenestSupabaseClient().rpc('record_creator_mission_attribution',{
    p_tracking_slug:slug,
    p_event_name:eventName,
    p_channel:String(channel||'social').trim().toLowerCase(),
    p_session_key:sessionKey,
    p_metadata:metadata
  });
  if(error)throw error;
}

export function captureCreatorMissionAttribution(
  trackingSlug:string,
  eventName:'landing_view'|'open_app'|'install_intent'|'share',
  channel='social',
  metadata:Record<string,unknown>={}
){
  void recordCreatorMissionAttribution(trackingSlug,eventName,channel,metadata).catch(()=>{});
}
