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


export type LiveCreatorMission={
  assignmentId:string;
  objectiveId:string;
  creatorName:string;
  creatorHandle:string;
  creatorSlug:string;
  trackingSlug:string;
  campaignCode:string;
  title:string;
  summary:string;
  steps:string[];
  cta:string;
  primaryAction:string;
  target:number;
  xpReward:number;
  audience:string;
};

export async function loadCreatorMissionLanding(trackingSlug:string):Promise<LiveCreatorMission|null>{
  const slug=String(trackingSlug||'').trim().toLowerCase();
  if(!slug)return null;
  const {data,error}=await getKleenestSupabaseClient().rpc('get_creator_mission_landing',{p_tracking_slug:slug});
  if(error)throw error;
  if(!data||typeof data!=='object')return null;
  const row=data as any;
  return {
    assignmentId:String(row.assignment_id||''),
    objectiveId:String(row.objective_id||''),
    creatorName:String(row.creator_name||''),
    creatorHandle:String(row.creator_handle||''),
    creatorSlug:String(row.creator_slug||''),
    trackingSlug:String(row.tracking_slug||slug),
    campaignCode:String(row.campaign_code||''),
    title:String(row.title||'Creator mission'),
    summary:String(row.summary||''),
    steps:Array.isArray(row.steps)?row.steps.map(String):[],
    cta:String(row.cta||'Open Kleenest'),
    primaryAction:String(row.primary_action||''),
    target:Number(row.target||1),
    xpReward:Number(row.xp_reward||0),
    audience:String(row.audience||'consumer')
  };
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
