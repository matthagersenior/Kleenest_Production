import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const SESSION_KEY='kleenest.acquisition.session';
const ATTRIBUTION_KEY='kleenest.acquisition.lastTouch';

export type AcquisitionEvent=
  |'landing_view'
  |'install_intent'
  |'install_success'
  |'apk_download'
  |'continue_guest'
  |'signup_intent'
  |'signin_intent'
  |'open_app'
  |'share';

export type AcquisitionAttribution={
  utmSource:string;
  utmMedium:string|null;
  utmCampaign:string|null;
  utmContent:string|null;
  utmTerm:string|null;
  landingPath:string|null;
  referrerHost:string|null;
};

function clean(value:unknown,max=120){
  const text=String(value??'').trim();
  return text?text.slice(0,max):null;
}

function randomKey(){
  const cryptoObj=(globalThis as any)?.crypto;
  if(cryptoObj?.randomUUID)return cryptoObj.randomUUID();
  return 'acq-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
}

async function acquisitionSessionKey(){
  const existing=await AsyncStorage.getItem(SESSION_KEY);
  if(existing)return existing;
  const created=randomKey();
  await AsyncStorage.setItem(SESSION_KEY,created);
  return created;
}

function currentReferrerHost(){
  if(Platform.OS!=='web'||typeof document==='undefined'||!document.referrer)return null;
  try{return clean(new URL(document.referrer).hostname,160)}catch{return null}
}

export function readAcquisitionAttributionFromLocation():AcquisitionAttribution{
  if(Platform.OS!=='web'||typeof window==='undefined'){
    return{utmSource:'direct',utmMedium:null,utmCampaign:null,utmContent:null,utmTerm:null,landingPath:null,referrerHost:null};
  }
  const params=new URLSearchParams(window.location.search);
  return{
    utmSource:clean(params.get('utm_source'),80)||'direct',
    utmMedium:clean(params.get('utm_medium'),80),
    utmCampaign:clean(params.get('utm_campaign'),120),
    utmContent:clean(params.get('utm_content'),120),
    utmTerm:clean(params.get('utm_term'),120),
    landingPath:clean(window.location.pathname,220),
    referrerHost:currentReferrerHost(),
  };
}

function isTagged(value:AcquisitionAttribution){
  return value.utmSource!=='direct'||Boolean(value.utmMedium||value.utmCampaign||value.utmContent||value.utmTerm);
}

export async function rememberAcquisitionAttribution(value:AcquisitionAttribution){
  await AsyncStorage.setItem(ATTRIBUTION_KEY,JSON.stringify(value));
}

export async function getRememberedAcquisitionAttribution():Promise<AcquisitionAttribution|null>{
  try{
    const raw=await AsyncStorage.getItem(ATTRIBUTION_KEY);
    if(!raw)return null;
    const value=JSON.parse(raw);
    if(!value||typeof value!=='object')return null;
    return{
      utmSource:clean(value.utmSource,80)||'direct',
      utmMedium:clean(value.utmMedium,80),
      utmCampaign:clean(value.utmCampaign,120),
      utmContent:clean(value.utmContent,120),
      utmTerm:clean(value.utmTerm,120),
      landingPath:clean(value.landingPath,220),
      referrerHost:clean(value.referrerHost,160),
    };
  }catch{return null}
}

export async function recordAcquisitionEvent(
  eventName:AcquisitionEvent,
  input:{metadata?:Record<string,unknown>;attribution?:AcquisitionAttribution}={}
){
  const current=input.attribution||readAcquisitionAttributionFromLocation();
  const remembered=await getRememberedAcquisitionAttribution();
  const attribution=isTagged(current)?current:(remembered||current);
  if(isTagged(current))await rememberAcquisitionAttribution(current);
  const sessionKey=await acquisitionSessionKey();
  const {error}=await getKleenestSupabaseClient().rpc('record_acquisition_attribution_event',{
    p_session_key:sessionKey,
    p_event_name:eventName,
    p_utm_source:attribution.utmSource,
    p_utm_medium:attribution.utmMedium,
    p_utm_campaign:attribution.utmCampaign,
    p_utm_content:attribution.utmContent,
    p_utm_term:attribution.utmTerm,
    p_referrer_host:attribution.referrerHost,
    p_landing_path:attribution.landingPath,
    p_metadata:input.metadata||{},
  });
  if(error)throw error;
}

export function captureAcquisitionEvent(
  eventName:AcquisitionEvent,
  input:{metadata?:Record<string,unknown>;attribution?:AcquisitionAttribution}={}
){
  void recordAcquisitionEvent(eventName,input).catch(()=>{});
}

export function captureInstallCenterLanding(metadata:Record<string,unknown>={}){
  const attribution=readAcquisitionAttributionFromLocation();
  if(isTagged(attribution))void rememberAcquisitionAttribution(attribution).catch(()=>{});
  captureAcquisitionEvent('landing_view',{metadata,attribution});
}
