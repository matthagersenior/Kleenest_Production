import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { requirePlatformOwner } from './ownerAdmin';

const client=()=>getKleenestSupabaseClient();
export type CrudCapability={resource:string;read:boolean;create:boolean;update:boolean;delete:boolean;read_only:boolean;primary_key:string};
async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}
export async function getOwnerCrudCatalog():Promise<CrudCapability[]>{await requirePlatformOwner();const data=await rpc('admin_crud_capability_catalog');return(Array.isArray(data)?data:[]) as CrudCapability[];}
export async function ownerCrudListRecords(resource:string,limit=100){await requirePlatformOwner();const data=await rpc('admin_crud_gateway',{p_resource:resource,p_action:'list',p_id:null,p_payload:{limit:Math.min(Math.max(limit,1),200)}});return Array.isArray(data)?data:[];}
export async function ownerCrudGetRecord(resource:string,id:string){await requirePlatformOwner();return rpc('admin_crud_gateway',{p_resource:resource,p_action:'get',p_id:id,p_payload:{}});}
export async function ownerCrudCreateRecord(resource:string,payload:Record<string,unknown>){await requirePlatformOwner();return rpc('admin_crud_gateway',{p_resource:resource,p_action:'create',p_id:null,p_payload:payload});}
export async function ownerCrudUpdateRecord(resource:string,id:string,payload:Record<string,unknown>){await requirePlatformOwner();return rpc('admin_crud_gateway',{p_resource:resource,p_action:'update',p_id:id,p_payload:payload});}
export async function ownerCrudDeleteRecord(resource:string,id:string){await requirePlatformOwner();return rpc('admin_crud_gateway',{p_resource:resource,p_action:'delete',p_id:id,p_payload:{}});}
