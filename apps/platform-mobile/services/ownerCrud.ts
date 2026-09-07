import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { requirePlatformOwner } from './ownerAdmin';
const client=()=>getKleenestSupabaseClient();
async function gateway(resource:string,action:'list'|'get'|'create'|'update'|'delete',id:string|null,payload:Record<string,unknown>={}){await requirePlatformOwner();if(!/^[-_a-z0-9]+$/.test(resource))throw new Error('Choose a valid canonical resource.');const{data,error}=await client().rpc('admin_crud_gateway',{p_resource:resource,p_action:action,p_id:id,p_payload:payload});if(error)throw new Error(error.message);return data;}
export async function ownerCrudListRecords(resource:string){const data=await gateway(resource,'list',null,{});return Array.isArray(data)?data:[];}
export async function ownerCrudGetRecord(resource:string,id:string){return gateway(resource,'get',id,{});}
export async function ownerCrudCreateRecord(resource:string,payload:Record<string,unknown>){return gateway(resource,'create',null,payload);}
export async function ownerCrudUpdateRecord(resource:string,id:string,payload:Record<string,unknown>){return gateway(resource,'update',id,payload);}
export async function ownerCrudDeleteRecord(resource:string,id:string){return gateway(resource,'delete',id,{});}
