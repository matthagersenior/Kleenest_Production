import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type LiveNetworkMotif={
  motif_key:string;
  label:string;
  scope_type:string;
  scope_id:string|null;
  severity:string;
  confidence:number;
  observed_count:number;
  last_seen_at:string|null;
  evidence:Record<string,unknown>;
};

export async function listLiveNetworkMotifs(windowMinutes=60):Promise<LiveNetworkMotif[]>{
  const{data,error}=await getKleenestSupabaseClient().rpc('live_network_motif_snapshot',{p_business_id:null,p_window_minutes:windowMinutes});
  if(error)throw new Error(error.message);
  return(Array.isArray(data)?data:[]).map((row:any)=>({...row,confidence:Number(row.confidence??0),observed_count:Number(row.observed_count??0),evidence:row.evidence&&typeof row.evidence==='object'?row.evidence:{}}));
}

export function subscribeLiveNetworkMotifs(onChange:()=>void){
  const client=getKleenestSupabaseClient();
  let timer:ReturnType<typeof setTimeout>|null=null;
  const signal=()=>{if(timer)clearTimeout(timer);timer=setTimeout(onChange,250)};
  const channel=client.channel('consumer-live-network-motifs')
    .on('postgres_changes',{event:'*',schema:'public',table:'live_network_motif_ticks',filter:'scope_key=eq.network'},signal)
    .subscribe();
  return()=>{if(timer)clearTimeout(timer);void client.removeChannel(channel)};
}
