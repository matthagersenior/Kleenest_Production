import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const secretKeys=(()=>{try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}')}catch{return {}}})();
const SUPABASE_SECRET_KEY=secretKeys.default??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const supabase=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const EXPO_PUSH_URL='https://exp.host/--/api/v2/push/send';
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})}
async function authorized(req:Request){const provided=req.headers.get('x-kleenest-worker-secret')??'';if(!provided)return false;const {data,error}=await supabase.rpc('get_push_worker_secret');return !error&&typeof data==='string'&&data.length>0&&provided===data;}
Deno.serve(async(req)=>{
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  if(!await authorized(req))return json({error:'Unauthorized'},401);
  if(!SUPABASE_SECRET_KEY)return json({error:'Supabase service credentials are not configured'},500);
  try{
    const payload=await req.json().catch(()=>({}));const notificationId=payload?.record?.id??payload?.notification_id;if(!notificationId)return json({error:'notification_id is required'},400);
    const {data:notification,error:notificationError}=await supabase.from('notifications').select('id,user_id,type,title,body,data,created_at').eq('id',notificationId).single();if(notificationError||!notification)return json({error:notificationError?.message??'Notification not found'},404);
    const {data:tokens,error:tokensError}=await supabase.from('notification_native_push_tokens').select('id,token,platform').eq('user_id',notification.user_id).eq('active',true);if(tokensError)return json({error:tokensError.message},500);if(!tokens?.length)return json({notification_id:notification.id,submitted:0,skipped:0});
    const pending:Array<{id:string;token:string;platform:string}>=[];let skipped=0;
    for(const token of tokens){const {data:existing}=await supabase.from('notification_native_push_deliveries').select('id,status,attempts').eq('notification_id',notification.id).eq('token_id',token.id).maybeSingle();if(['submitted','delivered','expired'].includes(existing?.status)){skipped++;continue;}await supabase.from('notification_native_push_deliveries').upsert({notification_id:notification.id,token_id:token.id,status:'pending',attempts:Number(existing?.attempts||0)+1,updated_at:new Date().toISOString()},{onConflict:'notification_id,token_id'});pending.push(token);}
    if(!pending.length)return json({notification_id:notification.id,submitted:0,skipped});
    const messages=pending.map(token=>({to:token.token,sound:'default',title:notification.title,body:notification.body??'',data:{...(notification.data??{}),notification_id:notification.id,type:notification.type},priority:'default'}));
    const response=await fetch(EXPO_PUSH_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(messages)});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`Expo push request failed: ${response.status} ${JSON.stringify(result).slice(0,800)}`);
    const tickets=Array.isArray(result?.data)?result.data:[];let submitted=0;
    for(let i=0;i<pending.length;i++){const token=pending[i],ticket=tickets[i]??{},errorCode=ticket?.details?.error,now=new Date().toISOString();if(ticket?.status==='ok'){await supabase.from('notification_native_push_deliveries').update({status:'submitted',provider_message_id:ticket.id??null,last_error:null,sent_at:now,updated_at:now}).eq('notification_id',notification.id).eq('token_id',token.id);submitted++;}else{const message=String(ticket?.message??errorCode??'Expo push delivery failed').slice(0,1000),expired=errorCode==='DeviceNotRegistered';await supabase.from('notification_native_push_deliveries').update({status:expired?'expired':'failed',last_error:message,updated_at:now}).eq('notification_id',notification.id).eq('token_id',token.id);if(expired)await supabase.from('notification_native_push_tokens').update({active:false,updated_at:now}).eq('id',token.id);}}
    return json({notification_id:notification.id,submitted,skipped,total:pending.length});
  }catch(error){return json({error:error instanceof Error?error.message:String(error)},500)}
});
