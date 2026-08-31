import * as SecureStore from 'expo-secure-store';
import type { LocationTrustSummary } from './locationTrust';
import { trustContributionMission, trustContributionPriority } from './routeTrust';

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

function missionSteps(summary:LocationTrustSummary|null|undefined){
  const visits=Number(summary?.verified_visit_count||0),photos=Number(summary?.photo_evidence_count||0),amenities=Number(summary?.amenity_evidence_count||0);
  const steps=['Check in while physically at this restroom','Publish a verified review from that eligible check-in'];
  if(!photos)steps.push('Add current photo evidence');
  if(!amenities)steps.push('Record amenity observations you actually saw');
  if(visits>0&&photos&&amenities)steps.push('Add a fresh verified visit to keep evidence current');
  return steps;
}

export function missionFromTrust(locationId:string,locationName:string,summary:LocationTrustSummary|null|undefined):TrustMission{
  const priority=trustContributionPriority(summary);
  return{locationId,locationName:locationName||'Restroom location',priority:priority==='none'?'low':priority,title:trustContributionMission(summary),steps:missionSteps(summary),startedAt:new Date().toISOString(),completedAt:null};
}

export async function readTrustMission():Promise<TrustMission|null>{
  const raw=await SecureStore.getItemAsync(KEY);
  if(!raw)return null;
  try{const parsed=JSON.parse(raw);return parsed&&parsed.locationId?parsed:null}catch{return null}
}

export async function startTrustMission(mission:TrustMission){await SecureStore.setItemAsync(KEY,JSON.stringify(mission));return mission}

export async function completeTrustMission(locationId:string){
  const current=await readTrustMission();
  if(!current||current.locationId!==locationId)return null;
  const completed={...current,completedAt:new Date().toISOString()};
  await SecureStore.setItemAsync(KEY,JSON.stringify(completed));
  return completed;
}

export async function clearTrustMission(){await SecureStore.deleteItemAsync(KEY)}
