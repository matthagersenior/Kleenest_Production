import * as SecureStore from 'expo-secure-store';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import type { LocationTrustSummary } from './locationTrust';
import { trustContributionMission, trustContributionPriority } from './routeTrust';

const KEY='kleenest.native.trust.mission.v2';
export type TrustMissionSource='explore'|'saved'|'play'|'location';
export type TrustMissionStatus='active'|'completed'|'cancelled';
export type TrustMissionGoal={kind?:string;requires_verified_review?:boolean;requires_photo?:boolean;requires_amenity?:boolean;requires_photo_or_amenity?:boolean;steps?:string[]};
export type TrustMission={
  id?:string;
  locationId:string;
  locationName:string;
  source:TrustMissionSource;
  status:TrustMissionStatus;
  priority:'high'|'medium'|'low';
  title:string;
  steps:string[];
  goal:TrustMissionGoal;
  rewardPoints:number;
  startedAt:string;
  completedAt:string|null;
  baselineEvidence?:Record<string,unknown>;
  completionEvidence?:Record<string,unknown>|null;
  offlineMirror?:boolean;
};

function mapMission(row:any):TrustMission|null{
  if(!row?.location_id)return null;
  const goal=(row.goal||{}) as TrustMissionGoal;
  return{id:String(row.id||''),locationId:String(row.location_id),locationName:String(row.location_name||'Restroom location'),source:(row.source||'location') as TrustMissionSource,status:(row.status||'active') as TrustMissionStatus,priority:(row.priority||'low') as TrustMission['priority'],title:goal.kind?String(goal.kind).replaceAll('_',' '):'Strengthen this restroom',steps:Array.isArray(goal.steps)?goal.steps.map(String):[],goal,rewardPoints:Number(row.reward_points||0),startedAt:String(row.started_at||new Date().toISOString()),completedAt:row.completed_at?String(row.completed_at):null,baselineEvidence:row.baseline_evidence||{},completionEvidence:row.completion_evidence||null};
}
async function cache(mission:TrustMission|null){if(mission)await SecureStore.setItemAsync(KEY,JSON.stringify(mission));else await SecureStore.deleteItemAsync(KEY)}
async function readMirror(){const raw=await SecureStore.getItemAsync(KEY);if(!raw)return null;try{const parsed=JSON.parse(raw);return parsed?.locationId?{...parsed,offlineMirror:true} as TrustMission:null}catch{return null}}

export function missionFromTrust(locationId:string,locationName:string,summary:LocationTrustSummary|null|undefined,source:TrustMissionSource='location'):TrustMission{
  const priority=trustContributionPriority(summary),steps=['Check in while physically at this restroom','Publish a verified review from that eligible check-in'];
  if(!summary?.photo_evidence_count)steps.push('Add current photo evidence when requested');
  if(!summary?.amenity_evidence_count)steps.push('Record amenity observations when requested');
  return{locationId,locationName:locationName||'Restroom location',source,status:'active',priority:priority==='none'?'low':priority,title:trustContributionMission(summary),steps,goal:{steps},rewardPoints:0,startedAt:new Date().toISOString(),completedAt:null,offlineMirror:true};
}

export async function startTrustMission(locationId:string,source:TrustMissionSource='location'){
  const client=getKleenestSupabaseClient();
  const {data,error}=await client.rpc('start_my_trust_mission',{p_location_id:locationId,p_source:source});
  if(error)throw error;
  const mission=mapMission(data);if(!mission)throw new Error('Trust mission could not be started.');await cache(mission);return mission;
}
export async function readTrustMission():Promise<TrustMission|null>{
  try{const client=getKleenestSupabaseClient();const {data,error}=await client.rpc('my_trust_mission');if(error)throw error;const mission=mapMission(data);await cache(mission);return mission}catch{return readMirror()}
}
export async function listTrustMissionHistory(limit=20):Promise<TrustMission[]>{
  const client=getKleenestSupabaseClient();const {data,error}=await client.rpc('my_trust_mission_history',{p_limit:Math.min(100,Math.max(1,limit))});if(error)throw error;return (Array.isArray(data)?data:[]).map(mapMission).filter(Boolean) as TrustMission[];
}
export async function completeTrustMission(reviewId:string){
  const client=getKleenestSupabaseClient();const {data,error}=await client.rpc('complete_my_trust_mission',{p_review_id:reviewId});if(error)throw error;const mission=mapMission(data);if(mission)await cache(mission);return mission;
}
export async function clearTrustMission(){
  try{const client=getKleenestSupabaseClient();const {error}=await client.rpc('cancel_my_trust_mission');if(error)throw error}finally{await cache(null)}
}
export function missionEvidenceRequirement(mission:TrustMission|null|undefined){
  if(!mission)return null;if(mission.goal.requires_photo)return'Add at least one current restroom photo before completing this mission.';if(mission.goal.requires_amenity)return'Record at least one amenity observation before completing this mission.';if(mission.goal.requires_photo_or_amenity)return'Add a current photo or record an amenity observation before completing this mission.';return null;
}
