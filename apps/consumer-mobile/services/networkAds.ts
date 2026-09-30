import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { Platform } from 'react-native';

const client=()=>getKleenestSupabaseClient();

type NetworkAdPlacementPolicy={
  enabled?:boolean;
  placement_code?:string;
  session_cap?:number;
  max_per_session?:number;
};

let sessionRequests=0;
const placementRequests=new Map<string,number>();

function nativePlatform(){
  return Platform.OS==='android'||Platform.OS==='ios'?Platform.OS:null;
}

export async function consumerNetworkAdsEnabled(){
  const{data,error}=await client().rpc('consumer_network_ads_enabled');
  if(error)return false;
  return data!==false;
}

export async function consumerNetworkAdPlacementEnabled(placementCode:string){
  const code=String(placementCode||'').trim().toLowerCase();
  const platform=nativePlatform();
  if(!platform||!code)return false;

  const enabled=await client().rpc('consumer_network_ad_placement_enabled',{
    p_placement_code:code,
    p_platform:platform,
  });
  if(enabled.error||enabled.data!==true)return false;

  const policyResult=await client().rpc('consumer_network_ad_placement_policy',{
    p_placement_code:code,
    p_platform:platform,
  });
  if(policyResult.error)return false;

  const policy=(policyResult.data||{}) as NetworkAdPlacementPolicy;
  if(policy.enabled===false)return false;
  const sessionCap=Math.max(0,Math.min(Number(policy.session_cap??4)||0,20));
  const placementCap=Math.max(0,Math.min(Number(policy.max_per_session??1)||0,5));
  const placementCount=placementRequests.get(code)||0;
  if(sessionCap===0||placementCap===0||sessionRequests>=sessionCap||placementCount>=placementCap)return false;

  sessionRequests+=1;
  placementRequests.set(code,placementCount+1);
  return true;
}

export function getConsumerNetworkAdSessionUsage(){
  return{total:sessionRequests,placements:Object.fromEntries(placementRequests.entries())};
}
