import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { startTrustMission } from './trustMissions';

export type ResolvedQrAction={
  id:string;
  code:string;
  location_id:string|null;
  business_id:string|null;
  label:string|null;
  purpose:string|null;
  action_type:string;
  action_payload:Record<string,unknown>;
  single_use:boolean;
};

export async function resolveQrAction(code:string):Promise<ResolvedQrAction>{
  const value=String(code||'').trim();if(!value)throw new Error('QR code is required.');
  const client=getKleenestSupabaseClient();
  const {data,error}=await client.rpc('resolve_custom_qr_action',{p_qr_code:value});if(error)throw error;
  if(!data?.id)throw new Error('QR action could not be resolved.');
  await client.rpc('record_qr_attribution',{p_code:value,p_action_type:'scan',p_source:'consumer_mobile',p_metadata:{purpose:data.purpose,action_type:data.action_type}}).catch(()=>null);
  return data as ResolvedQrAction;
}

export async function executeQrAction(action:ResolvedQrAction){
  const type=String(action.action_type||'').toLowerCase();
  if(type==='trust_mission'){
    const locationId=String(action.location_id||action.action_payload?.location_id||'');
    if(!locationId)throw new Error('This trust-mission QR is missing its restroom location.');
    const mission=await startTrustMission(locationId,'qr_reverification');
    return {kind:'trust_mission' as const,locationId,mission};
  }
  return {kind:type||'custom',locationId:action.location_id||null,action};
}
