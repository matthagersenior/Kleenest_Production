import * as SecureStore from 'expo-secure-store';
import type { LocationTrustSummary } from './locationTrust';
import { trustContributionMission } from './routeTrust';

const KEY='kleenest.native.trust.mission.v1';

export type TrustMission={
  locationId:string;
  locationName:string;
  priority:'high'|'medium'|'low';
  title:string;
  steps:string[];
  startedAt:string;
  completedAt:string|null;
};

export function missionFromTrust(locationId:string,locationName:string,summary:LocationTrustSummary|null|undefined):TrustMission{
  const mission=trustContributionMission(summary);
  return{locationId,locationName:locationName||'Restroom location',priority:mission.priority,title:mission.title,steps:mission.steps,startedAt:new Date().toISOString(),completedAt:null};
}

export async function readTrustMission():Promise<TrustMission|null>{
  const raw=await SecureStore.getItemAsync(KEY);
  if(!raw)return null;
  try{const parsed=JSON.parse(raw);return parsed&&parsed.locationId?parsed:null}catch{return null}
}

export async function startTrustMission(mission:TrustMission){
  await SecureStore.setItemAsync(KEY,JSON.stringify(mission));
  return mission;
}

export async function completeTrustMission(locationId:string){
  const current=await readTrustMission();
  if(!current||current.locationId!==locationId)return null;
  const completed={...current,completedAt:new Date().toISOString()};
  await SecureStore.setItemAsync(KEY,JSON.stringify(completed));
  return completed;
}

export async function clearTrustMission(){await SecureStore.deleteItemAsync(KEY)}
