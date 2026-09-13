import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
const client=()=>getKleenestSupabaseClient();
async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}
export async function getOwnerSmartDeviceSnapshot(){return (await rpc('owner_smart_device_snapshot'))||{health:{},connectors:[],devices:[],commands:[],events:[]};}
export function ownerApproveSmartDeviceCommand(commandId:string,approve:boolean,notes:string){return rpc('owner_approve_smart_device_command',{p_command_id:commandId,p_approve:approve,p_notes:notes.trim()||null});}
