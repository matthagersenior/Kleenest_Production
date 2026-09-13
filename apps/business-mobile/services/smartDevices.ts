import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
const client=()=>getKleenestSupabaseClient();
async function rpc(name:string,args:Record<string,unknown>={}){const{data,error}=await client().rpc(name,args);if(error)throw error;return data;}

export type SmartDeviceManifest={
 connectors:any[];devices:any[];recent_events:any[];recent_commands:any[];automations:any[];
 health:{total_devices:number;online_devices:number;offline_devices:number;open_commands:number;critical_events_24h:number};
};

export async function smartDeviceManifest(businessId:string):Promise<SmartDeviceManifest>{
 const value:any=await rpc('smart_device_manifest',{p_business_id:businessId});
 return{
  connectors:Array.isArray(value?.connectors)?value.connectors:[],
  devices:Array.isArray(value?.devices)?value.devices:[],
  recent_events:Array.isArray(value?.recent_events)?value.recent_events:[],
  recent_commands:Array.isArray(value?.recent_commands)?value.recent_commands:[],
  automations:Array.isArray(value?.automations)?value.automations:[],
  health:value?.health||{total_devices:0,online_devices:0,offline_devices:0,open_commands:0,critical_events_24h:0}
 };
}

export function upsertSmartDeviceConnector(input:{
 businessId:string;name:string;protocol:string;connectorId?:string|null;locationId?:string|null;
 platformPartnerId?:string|null;controlEnabled?:boolean;telemetryEnabled?:boolean;capabilities?:string[];metadata?:Record<string,unknown>;
}){
 return rpc('smart_device_upsert_connector',{
  p_business_id:input.businessId,p_name:input.name,p_protocol:input.protocol,
  p_connector_id:input.connectorId??null,p_location_id:input.locationId??null,
  p_platform_partner_id:input.platformPartnerId??null,p_control_enabled:input.controlEnabled??false,
  p_telemetry_enabled:input.telemetryEnabled??true,p_capabilities:input.capabilities??[],
  p_metadata:input.metadata??{}
 });
}

export function upsertSmartDevice(input:{
 businessId:string;connectorId:string;externalDeviceId:string;name:string;deviceId?:string|null;
 locationId?:string|null;deviceType?:string;manufacturer?:string|null;model?:string|null;firmwareVersion?:string|null;
 capabilities?:string[];tags?:string[];controlEnabled?:boolean;telemetryEnabled?:boolean;metadata?:Record<string,unknown>;
}){
 return rpc('smart_device_upsert_device',{
  p_business_id:input.businessId,p_connector_id:input.connectorId,p_external_device_id:input.externalDeviceId,p_name:input.name,
  p_device_id:input.deviceId??null,p_location_id:input.locationId??null,p_device_type:input.deviceType??'sensor',
  p_manufacturer:input.manufacturer??null,p_model:input.model??null,p_firmware_version:input.firmwareVersion??null,
  p_capabilities:input.capabilities??[],p_tags:input.tags??[],p_control_enabled:input.controlEnabled??false,
  p_telemetry_enabled:input.telemetryEnabled??true,p_metadata:input.metadata??{}
 });
}

export function smartDeviceCommand(input:{businessId:string;deviceId:string;command:string;arguments?:Record<string,unknown>;idempotencyKey?:string|null}){
 return rpc('smart_device_command',{
  p_business_id:input.businessId,p_device_id:input.deviceId,p_command:input.command,
  p_arguments:input.arguments??{},p_idempotency_key:input.idempotencyKey??null,p_expires_at:null
 });
}

export function smartDeviceSetAutomationRule(input:{
 businessId:string;name:string;triggerType:'event_type'|'metric_threshold'|'status_changed';triggerConfig:Record<string,unknown>;
 command:string;ruleId?:string|null;locationId?:string|null;deviceId?:string|null;commandArguments?:Record<string,unknown>;
 cooldownSeconds?:number;enabled?:boolean;
}){
 return rpc('smart_device_set_automation_rule',{
  p_business_id:input.businessId,p_name:input.name,p_trigger_type:input.triggerType,p_trigger_config:input.triggerConfig,
  p_command:input.command,p_rule_id:input.ruleId??null,p_location_id:input.locationId??null,p_device_id:input.deviceId??null,
  p_command_arguments:input.commandArguments??{},p_cooldown_seconds:input.cooldownSeconds??300,p_enabled:input.enabled??true
 });
}


export async function smartRestroomSnapshot(businessId:string,locationId:string|null=null){
 return rpc('business_smart_amenity_snapshot',{p_business_id:businessId,p_location_id:locationId});
}

export async function setSmartRestroomAmenity(businessId:string,locationId:string,enabled:boolean){
 const{data,error}=await client().from('amenities').select('id').eq('name','Connected / Smart Restroom').limit(1).maybeSingle();
 if(error)throw error;if(!data?.id)throw new Error('Connected / Smart Restroom amenity is unavailable.');
 return rpc('business_set_location_amenity',{p_business_id:businessId,p_location_id:locationId,p_amenity_id:data.id,p_action:enabled?'add':'remove'});
}

export function createSmartRestroomQr(businessId:string,locationId:string,mode:'contribute'|'command'='contribute',deviceId:string|null=null,command:string|null=null){
 return rpc('business_create_smart_restroom_qr',{p_business_id:businessId,p_location_id:locationId,p_mode:mode,p_device_id:deviceId,p_command:command});
}

export function executeSmartDeviceQr(code:string){
 return rpc('execute_smart_device_qr_action',{p_qr_code:code});
}
