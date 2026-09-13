import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')??'';
const secretKeys=(()=>{try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}')}catch{return{}}})();
const SERVICE_KEY=secretKeys.default??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-kleenest-api-key,x-kleenest-worker-secret',
 'access-control-allow-methods':'GET,POST,OPTIONS'
}})}
function text(value:unknown,max=320){return String(value??'').trim().slice(0,max)}
function uuid(value:unknown){const v=text(value,64);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw new Error('Invalid UUID');return v}
async function authorizePartner(req:Request,route:string){
 const raw=req.headers.get('x-kleenest-api-key')??'';
 const{data,error}=await db.rpc('authorize_platform_request',{p_raw_key:raw,p_route:route,p_request_id:crypto.randomUUID(),p_origin:req.headers.get('origin')});
 if(error)throw error;
 return data as any;
}
async function kickWebhookWorker(){
 const{data:secret,error}=await db.rpc('platform_webhook_worker_secret_internal');
 if(error||!secret)return;
 await fetch(`${SUPABASE_URL.replace(/\/$/,'')}/functions/v1/deliver-platform-webhooks`,{
  method:'POST',
  headers:{'content-type':'application/json','x-kleenest-worker-secret':String(secret)},
  body:JSON.stringify({limit:50}),
  signal:AbortSignal.timeout(10000)
 }).catch(()=>null);
}
async function dispatch(limit:number){
 const{data,error}=await db.rpc('claim_smart_device_commands',{p_limit:Math.max(1,Math.min(limit,100))});
 if(error)throw error;
 const rows=Array.isArray(data)?data:[];
 let queued=0,failed=0;
 for(const row of rows){
  try{
   const{error:eventError}=await db.rpc('enqueue_platform_webhook_event',{
    p_partner_id:row.platform_partner_id,
    p_event_type:'device.command_requested',
    p_payload:{
     commandId:row.command_id,businessId:row.business_id,deviceId:row.device_id,
     externalDeviceId:row.external_device_id,command:row.command,arguments:row.arguments,
     riskClass:row.risk_class,attempt:row.attempt,expiresAt:row.expires_at
    }
   });
   if(eventError)throw eventError;
   const{error:markError}=await db.rpc('mark_smart_device_command_dispatched',{p_command_id:row.command_id});
   if(markError)throw markError;
   queued++;
  }catch(error){
   failed++;
   await db.rpc('complete_smart_device_command',{
    p_command_id:row.command_id,p_success:false,p_result:{},
    p_error:error instanceof Error?error.message:'Dispatch enqueue failed'
   }).catch(()=>null);
  }
 }
 if(queued)await kickWebhookWorker();
 return{claimed:rows.length,queued,failed};
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:json({}).headers});
 if(req.method==='GET')return json({ok:true,service:'smart-device-gateway',mode:'provider-neutral'});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 if(!SERVICE_KEY)return json({error:'Service unavailable'},503);

 try{
  const body=await req.json().catch(()=>({}));
  const operation=text(body?.operation,64);

  if(operation==='dispatch'){
   const supplied=req.headers.get('x-kleenest-worker-secret')??'';
   const{data:allowed,error}=await db.rpc('authorize_platform_webhook_worker',{p_secret:supplied});
   if(error||allowed!==true)return json({error:'Unauthorized'},401);
   return json(await dispatch(Number(body?.limit??25)));
  }

  if(operation==='ingest-event'){
   const auth=await authorizePartner(req,'/v1/devices/events');
   if(!auth?.authorized)return json({error:'Unauthorized',code:auth?.reason??'unauthorized'},auth?.reason==='insufficient_scope'||auth?.reason==='product_not_enabled'?403:401);
   const{data,error}=await db.rpc('record_smart_device_event',{
    p_partner_id:auth.partner_id,
    p_external_device_id:text(body?.externalDeviceId,240),
    p_event_type:text(body?.eventType,120),
    p_severity:text(body?.severity||'info',24),
    p_metric:body?.metric?text(body.metric,120):null,
    p_value_numeric:Number.isFinite(Number(body?.valueNumeric))?Number(body.valueNumeric):null,
    p_value_text:body?.valueText==null?null:text(body.valueText,500),
    p_unit:body?.unit==null?null:text(body.unit,40),
    p_payload:body?.payload&&typeof body.payload==='object'?body.payload:{},
    p_observed_at:body?.observedAt||null,
    p_dedupe_key:body?.dedupeKey?text(body.dedupeKey,240):null
   });
   if(error)throw error;
   return json({event:data},202);
  }

  if(operation==='complete-command'){
   const deviceId=uuid(body?.deviceId),commandId=uuid(body?.commandId);
   const route=`/v1/devices/${deviceId}/commands/${commandId}/complete`;
   const auth=await authorizePartner(req,route);
   if(!auth?.authorized)return json({error:'Unauthorized',code:auth?.reason??'unauthorized'},auth?.reason==='insufficient_scope'||auth?.reason==='product_not_enabled'?403:401);
   const{data,error}=await db.rpc('platform_complete_smart_device_command',{
    p_partner_id:auth.partner_id,p_command_id:commandId,p_success:Boolean(body?.success),
    p_result:body?.result&&typeof body.result==='object'?body.result:{},
    p_error:body?.error?text(body.error,1000):null
   });
   if(error)throw error;
   return json({command:data});
  }

  return json({error:'Unsupported operation'},400);
 }catch(error){
  console.error('Smart device gateway failed',error instanceof Error?error.name:'unknown_error');
  return json({error:error instanceof Error?error.message:'Operation failed'},400);
 }
});