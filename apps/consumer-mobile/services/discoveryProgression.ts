import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type DiscoveryMethod='remote'|'address'|'place_search'|'map_pin'|'gps'|'onsite_live';
export type DiscoveryInput={method:DiscoveryMethod;name?:string;address?:string;latitude?:number|null;longitude?:number|null;place_type?:string;external_source?:string|null;external_id?:string|null};

async function requireUser(){const client=getKleenestSupabaseClient();const{data,error}=await client.auth.getUser();if(error)throw error;if(!data.user)throw new Error('Sign in to contribute and earn XP.');return data.user;}

export async function matchOrCreateDiscovery(input:DiscoveryInput){await requireUser();const{data,error}=await getKleenestSupabaseClient().rpc('consumer_match_or_create_discovery',{p_input:input});if(error)throw error;return data||{};}
export async function recordDiscoveryEvidence(locationId:string,input:Record<string,unknown>){await requireUser();const{data,error}=await getKleenestSupabaseClient().rpc('consumer_record_discovery_evidence',{p_location_id:locationId,p_input:input});if(error)throw error;return data||{};}
export async function getProgressionOverviewV2(){await requireUser();const{data,error}=await getKleenestSupabaseClient().rpc('consumer_progression_overview');if(error)throw error;return data||{};}
export async function listActiveObjectivesV2(){await requireUser();const{data,error}=await getKleenestSupabaseClient().rpc('consumer_active_objectives');if(error)throw error;return Array.isArray(data)?data:[];}
export async function listProgressionRankingsV2(scope='global',metric='xp',context:Record<string,unknown>={}){await requireUser();const{data,error}=await getKleenestSupabaseClient().rpc('consumer_progression_rankings',{p_scope:scope,p_metric:metric,p_context:context});if(error)throw error;return Array.isArray(data)?data:[];}
export async function listNearbyProgressionOpportunities(latitude:number,longitude:number,radiusMeters=5000){await requireUser();const{data,error}=await getKleenestSupabaseClient().rpc('consumer_nearby_progression_opportunities',{p_lat:latitude,p_lon:longitude,p_radius_m:radiusMeters});if(error)throw error;return Array.isArray(data)?data:[];}
