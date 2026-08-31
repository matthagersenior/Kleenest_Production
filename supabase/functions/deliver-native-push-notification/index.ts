import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const secretKeys=(()=>{try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}')}catch{return {}}})();
const SUPABASE_SECRET_KEY=secretKeys.default??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const supabase=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const EXPO_PUSH_URL='https://exp.host/--/api/v2/push/send';
const MAX_DELIVERY_ATTEMPTS=5;
const MAX_PROVIDER_ATTEMPTS=3;
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
async function authorized(req:Request){const provided=req.headers.get('x-kleenest-worker-secret')??'';if(!provided)return false;const {data,error}=await supabase.rpc('get_push_worker_secret');return !error&&typeof data==='string'&&data.length>0&&provided===data;}
async function postExpo(messages:unknown[]){let lastError='Expo push request failed';for(let attempt=1;attempt<=MAX_PROVIDER_ATTEMPTS;attempt++){try{const response=await fetch(EXPO_PUSH_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(messages)});const result=await response.json().catch(()=>({}));if(response.ok)return result;lastError=`Expo push request failed: ${response.status} ${JSON.stringify(result).slice(0,800)}`;if(response.status!==429&&response.status<500)break;const retryAfter=Number(response.headers.get('retry-after')||0);await sleep(retryAfter>0?retryAfter*1000:250*2**(attempt-1));}catch(error){lastError=error instanceof Error?error.message:String(error);if(attempt<MAX_PROVIDER_ATTEMPTS)await sleep(250*2**(attempt-1));}}throw new Error(lastError)}
Deno.serve(async(req)=>{
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  if(!await authorized(req))return json({error:'Unauthorized'},401);
  if(!SUPABASE_SECRET_KEY)return json({error:'Supabase service credentials are not configured'},500);
  let pending:Array<{id:string;token_id:string;token:string;platform:string;attempts:number}>=[];let notificationId:string|null=null;
  try{
    const payload=await req.json().catch(()=>({}));notificationId=payload?.record?.id??payload?.notification_id;if(!notificationId)return json({error:'notification_id is required'},400);
    const {data:notification,error:notificationError}=await supabase.from('notifications').select('id,user_id,type,title,body,data,created_at').eq('id',notificationId).single();if(notificationError||!notification)return json({error:notificationError?.message??'Notification not found'},404);
    const {data:claims,error:claimError}=await supabase.rpc('claim_native_push_deliveries',{p_notification_id:notification.id,p_max_attempts:MAX_DELIVERY_ATTEMPTS});if(claimError)return json({error:claimError.message},500);pending=Array.isArray(claims)?claims:[];
    if(!pending.length)return json({notification_id:notification.id,submitted:0,claimed:0});
    const messages=pending.map(claim=>({to:claim.token,sound:'default',title:notification.title,body:notification.body??'',data:{...(notification.data??{}),notification_id:notification.id,type:notification.type},priority:'default'}));
    const result=await postExpo(messages);const tickets=Array.isArray(result?.data)?result.data:[];let submitted=0;
    for(let i=0;i<pending.length;i++){const claim=pending[i],ticket=tickets[i]??{},errorCode=ticket?.details?.error,now=new Date().toISOString();if(ticket?.status==='ok'){await supabase.from('notification_native_push_deliveries').update({status:'submitted',provider_message_id:ticket.id??null,last_error:null,sent_at:now,updated_at:now}).eq('id',claim.id);submitted++;}else{const message=String(ticket?.message??errorCode??'Expo push delivery failed').slice(0,1000),expired=errorCode==='DeviceNotRegistered';await supabase.from('notification_native_push_deliveries').update({status:expired?'expired':'failed',last_error:message,updated_at:now}).eq('id',claim.id);if(expired)await supabase.from('notification_native_push_tokens').update({active:false,updated_at:now}).eq('id',claim.token_id);}}
    return json({notification_id:notification.id,submitted,claimed:pending.length});
  }catch(error){const message=error instanceof Error?error.message:String(error);if(notificationId&&pending.length){const now=new Date().toISOString();await Promise.all(pending.map(claim=>supabase.from('notification_native_push_deliveries').update({status:'failed',last_error:message.slice(0,1000),updated_at:now}).eq('id',claim.id)));}return json({error:message},500)}
});
