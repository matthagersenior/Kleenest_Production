import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const client=()=>getKleenestSupabaseClient();

async function rpc<T=any>(name:string,args:Record<string,unknown>={}){
  const{data,error}=await client().rpc(name,args);
  if(error)throw error;
  if(data==null)throw new Error('Owner ingestion control returned no data.');
  return data as T;
}

// Background ingestion now reports adaptive capacity alongside Discovery-driven work.
export type IngestionControlSnapshot={
  status?:Record<string,unknown>;
  sources?:Record<string,unknown>[];
  markets?:Record<string,unknown>[];
  storage_guard?:Record<string,unknown>;
  history?:Record<string,unknown>[];
  discovery_signals?:Record<string,unknown>[];
  discovery_signals_error?:string;
  generated_at?:string;
};

export const getOwnerIngestionControl=async(limit=80):Promise<IngestionControlSnapshot>=>{
  const bounded=Math.min(Math.max(limit,1),200);
  // Discovery signal telemetry is supplemental: it must not hide canonical counts
  // or disable ingestion controls if its own RPC is temporarily unavailable.
  const [snapshotResult,signalsResult]=await Promise.allSettled([
    rpc<IngestionControlSnapshot>('owner_ingestion_control_snapshot',{p_limit:bounded}),
    rpc<Record<string,unknown>[]>('owner_discovery_growth_signals',{p_limit:Math.min(bounded,100)}),
  ]);
  if(snapshotResult.status==='rejected')throw snapshotResult.reason;
  return {
    ...snapshotResult.value,
    discovery_signals:signalsResult.status==='fulfilled'?signalsResult.value:[],
    discovery_signals_error:signalsResult.status==='rejected'?'Discovery growth signals temporarily unavailable':undefined,
  };
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

export async function setNationalIngestionPolicy(patch:{national_ingestion_enabled?:boolean;travel_priority_enabled?:boolean;tourism_priority_enabled?:boolean;major_markets_enabled?:boolean}){
  const {data,error}=await getSupabaseClient().rpc('owner_update_ingestion_capacity_policy',{
    p_patch:patch,
    p_reason:'Updated national ingestion priorities from KleenestOS Ingestion Control',
  });
  return unwrap(data,error);
}
