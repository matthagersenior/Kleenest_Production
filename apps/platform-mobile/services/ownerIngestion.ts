import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();

async function rpc<T=any>(name:string,args:Record<string,unknown>={}){
  const{data,error}=await client().rpc(name,args);
  if(error)throw error;
  if(data==null)throw new Error('Owner ingestion control returned no data.');
  return data as T;
}

export type IngestionControlSnapshot={
  status?:Record<string,unknown>;
  sources?:Record<string,unknown>[];
  markets?:Record<string,unknown>[];
  storage_guard?:Record<string,unknown>;
  history?:Record<string,unknown>[];
  discovery_signals?:Record<string,unknown>[];
  generated_at?:string;
};

export const getOwnerIngestionControl=async(limit=80):Promise<IngestionControlSnapshot>=>{
  const bounded=Math.min(Math.max(limit,1),200);
  const [snapshot,discoverySignals]=await Promise.all([
    rpc<IngestionControlSnapshot>('owner_ingestion_control_snapshot',{p_limit:bounded}),
    rpc<Record<string,unknown>[]>('owner_discovery_growth_signals',{p_limit:Math.min(bounded,100)}),
  ]);
  return {...snapshot,discovery_signals:discoverySignals};
};

export const setGlobalIngestionPaused=(paused:boolean)=>rpc('owner_set_ingestion_global_pause',{
  p_paused:paused,
  p_reason:paused?'Paused from KleenestOS Ingestion Control':'Resumed from KleenestOS Ingestion Control',
});

export const runBoundedIngestionCycle=()=>rpc('owner_run_ingestion_cycle',{
  p_reason:'Manual bounded cycle from KleenestOS Ingestion Control',
});

export const repairStalledIngestion=()=>rpc('owner_repair_ingestion_cells',{
  p_reason:'Repair requested from KleenestOS Ingestion Control',
});

export const setIngestionSourceEnabled=(sourceKey:string,enabled:boolean)=>rpc('owner_update_ingestion_source_policy',{
  p_source_key:sourceKey,
  p_patch:{enabled},
  p_reason:`${enabled?'Enabled':'Paused'} ${sourceKey} from KleenestOS Ingestion Control`,
});

export const setCoverageMarketEnabled=(input:{marketId:string;priority:number;enabled:boolean;name?:string})=>rpc('owner_update_ingestion_market',{
  p_market_id:input.marketId,
  p_priority:input.priority,
  p_enabled:input.enabled,
  p_reason:`${input.enabled?'Enabled':'Paused'} coverage priority${input.name?' for '+input.name:''} from KleenestOS Ingestion Control`,
});
