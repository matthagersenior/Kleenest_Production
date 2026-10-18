import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { requirePlatformOwner } from './ownerAdmin';
import type { DuplicateCase, DuplicateLocation } from './locationDedup';

export type ConsolidationImpact = {
 table: string; column: string; source_rows: number; survivor_rows: number; handling: string;
};
export type ConsolidationPreview = {
 case_id: number; case_status: string; case_reviewed_at: string|null;
 survivor: Record<string,unknown>; retiring: Record<string,unknown>;
 impact: ConsolidationImpact[]; source_linked_total: number; unresolved_other_cases: number;
 blockers: string[]; preservation: string; mirror_status: string;
 allowed: boolean; fingerprint: string;
};
export type ConsolidationStatus = {
 ledger_id?: number; source_location_id?: string; survivor_location_id?: string;
 executed_at?: string; undone_at?: string|null; geo_status?: string;
};
export type ConsolidationResult = {
 ok:boolean; ledger_id?:number; survivor_id?:string; retired_id?:string;
 restored_id?:string; mirror_sync?:string;
};
const client=()=>getKleenestSupabaseClient();

export async function getOwnerDuplicateCase(caseId:number):Promise<DuplicateCase>{
 await requirePlatformOwner();
 const {data,error}=await client().from('location_duplicate_cases')
  .select('id,first_location_id,second_location_id,rule,confidence,status,distance_m,review_notes,reviewed_at,created_at')
  .eq('id',caseId).single();
 if(error)throw error;
 const ids=[data.first_location_id,data.second_location_id];
 const {data:places,error:placesError}=await client().from('locations')
  .select('id,name,address,city,state,postal_code,phone,website,place_type,brand_name,latitude,longitude,source_dataset,source_external_id,is_active')
  .in('id',ids);
 if(placesError)throw placesError;
 const byId=new Map(((places??[]) as DuplicateLocation[]).map(x=>[x.id,x]));
 return {...data,first:byId.get(data.first_location_id),second:byId.get(data.second_location_id)} as DuplicateCase;
}
export async function previewOwnerConsolidation(caseId:number,survivorId:string):Promise<ConsolidationPreview>{
 await requirePlatformOwner();
 const {data,error}=await client().rpc('preview_location_consolidation',{
  p_case_id:caseId,p_survivor_id:survivorId,
 });
 if(error)throw error;
 return data as ConsolidationPreview;
}
export async function executeOwnerConsolidation(caseId:number,survivorId:string,fingerprint:string,confirmation:string):Promise<ConsolidationResult>{
 await requirePlatformOwner();
 const {data,error}=await client().rpc('execute_location_consolidation',{
  p_case_id:caseId,p_survivor_id:survivorId,p_fingerprint:fingerprint,p_confirmation:confirmation,
 });
 if(error)throw error;
 return data as ConsolidationResult;
}
export async function readOwnerConsolidationStatus(caseId:number):Promise<ConsolidationStatus>{
 await requirePlatformOwner();
 const {data,error}=await client().rpc('get_location_consolidation_status',{p_case_id:caseId});
 if(error)throw error;
 return (data??{}) as ConsolidationStatus;
}
export async function undoOwnerConsolidation(ledgerId:number,confirmation:string):Promise<ConsolidationResult>{
 await requirePlatformOwner();
 const {data,error}=await client().rpc('undo_location_consolidation',{
  p_ledger_id:ledgerId,p_confirmation:confirmation,
 });
 if(error)throw error;
 return data as ConsolidationResult;
}
