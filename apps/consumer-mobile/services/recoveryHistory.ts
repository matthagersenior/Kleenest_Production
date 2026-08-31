import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type LocationRecoveryHistoryItem = {
  case_id: string;
  location_id: string;
  amenity_id: string;
  amenity_name: string;
  response_status: 'business_alerted' | 'business_addressing' | 'addressed' | string;
  resolution_method: 'business_remediation' | 'community_confirmation' | 'business_response_active' | string;
  priority_band: 'critical' | 'high' | 'elevated' | 'standard' | string;
  opened_at: string;
  source_observed_at: string | null;
  resolved_at: string | null;
  resolution_observed_at: string | null;
  proof_available: boolean;
  proof_storage_path: string | null;
  proof_created_at: string | null;
  proof_url: string | null;
  sla_met: boolean | null;
};

export async function getLocationRecoveryHistory(locationId:string):Promise<LocationRecoveryHistoryItem[]> {
  const client=getKleenestSupabaseClient();
  const {data,error}=await client.rpc('get_location_recovery_history',{p_location_id:locationId});
  if(error)throw error;
  const rows=Array.isArray(data)?data:[];
  return rows.map((row:any)=>{
    const storagePath=typeof row?.proof_storage_path==='string'&&row.proof_storage_path?row.proof_storage_path:null;
    const proofUrl=storagePath?client.storage.from('location-photos').getPublicUrl(storagePath).data.publicUrl:null;
    return {...row,proof_storage_path:storagePath,proof_url:proofUrl||null} as LocationRecoveryHistoryItem;
  });
}
