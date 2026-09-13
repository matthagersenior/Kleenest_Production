import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { useEffect,useState } from 'react';
import { Platform } from 'react-native';

const APP_PRESENCE_KEY='kleenest.consumer.app-presence.v1';

function browser(){
  return Platform.OS==='web'&&typeof window!=='undefined'?window:null;
}

export function isConsumerStandaloneWebApp(){
  const w=browser();
  if(!w)return Platform.OS!=='web';
  const nav=w.navigator as Navigator&{standalone?:boolean};
  return Boolean(
    nav.standalone||
    w.matchMedia?.('(display-mode: standalone)').matches||
    w.matchMedia?.('(display-mode: fullscreen)').matches||
    w.matchMedia?.('(display-mode: minimal-ui)').matches
  );
}

export function isExplicitConsumerAppLaunch(){
  const w=browser();
  if(!w)return Platform.OS!=='web';
  return new URLSearchParams(w.location.search).get('app')==='1';
}

export function markConsumerAppPresence(){
  const w=browser();
  if(!w)return;
  try{w.localStorage.setItem(APP_PRESENCE_KEY,'1')}catch{}
}

export function clearConsumerAppPresence(){
  const w=browser();
  if(!w)return;
  try{w.localStorage.removeItem(APP_PRESENCE_KEY)}catch{}
}

function storedConsumerAppPresence(){
  const w=browser();
  if(!w)return false;
  try{return w.localStorage.getItem(APP_PRESENCE_KEY)==='1'}catch{return false}
}

async function relatedInstalledApp(){
  const w=browser();
  if(!w)return false;
  const nav=w.navigator as Navigator&{getInstalledRelatedApps?:()=>Promise<unknown[]>};
  if(typeof nav.getInstalledRelatedApps!=='function')return false;
  try{return (await nav.getInstalledRelatedApps()).length>0}catch{return false}
}

export function useConsumerWebExperience(){
  const native=Platform.OS!=='web';
  const[ready,setReady]=useState(native);
  const[signedIn,setSignedIn]=useState(false);
  const[installed,setInstalled]=useState(native);

  useEffect(()=>{
    if(native)return;
    let active=true;
    const client=getKleenestSupabaseClient();
    const explicit=isExplicitConsumerAppLaunch();
    const standalone=isConsumerStandaloneWebApp();
    if(explicit||standalone)markConsumerAppPresence();

    async function refresh(sessionOverride?:unknown){
      const session=sessionOverride===undefined?(await client.auth.getSession()).data.session:sessionOverride;
      const related=await relatedInstalledApp();
      if(!active)return;
      const present=explicit||standalone||storedConsumerAppPresence()||related;
      setInstalled(present);
      setSignedIn(Boolean(session));
      setReady(true);
    }

    void refresh().catch(()=>{if(active){setInstalled(explicit||standalone||storedConsumerAppPresence());setSignedIn(false);setReady(true)}});
    const auth=client.auth.onAuthStateChange((_event,session)=>{void refresh(session)});
    return()=>{active=false;auth.data.subscription.unsubscribe()};
  },[native]);

  return{
    ready,
    signedIn,
    installed,
    appActive:native||signedIn||installed,
  };
}
