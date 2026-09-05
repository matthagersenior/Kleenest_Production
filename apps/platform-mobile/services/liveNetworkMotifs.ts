import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type LiveNetworkMotif={motif_key:string;label:string;scope_type:string;scope_id:string|null;severity:string;confidence:number;observed_count:number;last_seen_at:string|null;evidence:Record<string,unknown>};

const client=()=>getKleenestSupabaseClient();
const normalize=(data:unknown):LiveNetworkMotif[]=>(Array.isArray(data)?data:[]).map((row:any)=>({...row,scope_id:row.scope_id?String(row.scope_id):null,confidence:Number(row.confidence??0),observed_count:Number(row.observed_count??0),evidence:row.evidence&&typeof row.evidence==='object'?row.evidence:{}}));
export async function listPlatformMotifs(windowMinutes=60){const{data,error}=await client().rpc('live_network_motif_snapshot',{p_business_id:null,p_window_minutes:windowMinutes});if(error)throw error;return normalize(data)}
export async function listBusinessMotifs(businessId:string,windowMinutes=60){const{data,error}=await client().rpc('live_network_motif_snapshot',{p_business_id:businessId,p_window_minutes:windowMinutes});if(error)throw error;return normalize(data)}
export function subscribePlatformMotifs(onChange:()=>void){let timer:ReturnType<typeof setTimeout>|null=null;const signal=()=>{if(timer)clearTimeout(timer);timer=setTimeout(onChange,250)};const channel=client().channel('platform-live-network-motifs').on('postgres_changes',{event:'*',schema:'public',table:'live_network_motif_ticks'},signal).subscribe();return()=>{if(timer)clearTimeout(timer);void client().removeChannel(channel)}}
