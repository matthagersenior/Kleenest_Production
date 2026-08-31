import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const secretKeys=(()=>{try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}')}catch{return {}}})();
const SUPABASE_SECRET_KEY=secretKeys.default??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const supabase=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const EXPO_RECEIPTS_URL='https://exp.host/--/api/v2/push/getReceipts';
const BATCH_SIZE=100;
const MAX_RECEIPT_ATTEMPTS=8;

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
async function authorized(req:Request){const provided=req.headers.get('x-kleenest-worker-secret')??'';if(!provided)return false;const {data,error}=await supabase.rpc('get_push_worker_secret');return !error&&typeof data==='string'&&data.length>0&&provided===data;}
async function fetchReceipts(ids:string[]){let lastError='Expo receipt request failed';for(let attempt=1;attempt<=3;attempt++){try{const response=await fetch(EXPO_RECEIPTS_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({ids})});const result=await response.json().catch(()=>({}));if(response.ok)return result?.data??{};lastError=`Expo receipt request failed: ${response.status} ${JSON.stringify(result).slice(0,800)}`;if(response.status!==429&&response.status<500)break;const retryAfter=Number(response.headers.get('retry-after')||0);await sleep(retryAfter>0?retryAfter*1000:250*2**(attempt-1));}catch(error){lastError=error instanceof Error?error.message:String(error);if(attempt<3)await sleep(250*2**(attempt-1));}}throw new Error(lastError)}

Deno.serve(async(req)=>{
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  if(!SUPABASE_SECRET_KEY)return json({error:'Supabase service credentials are not configured'},500);
  if(!await authorized(req))return json({error:'Unauthorized'},401);
  try{
    const cutoff=new Date(Date.now()-15_000).toISOString();
    const {data:rows,error}=await supabase.from('notification_native_push_deliveries').select('id,token_id,provider_message_id,receipt_attempts,sent_at').eq('status','submitted').not('provider_message_id','is',null).lt('sent_at',cutoff).lt('receipt_attempts',MAX_RECEIPT_ATTEMPTS).order('sent_at',{ascending:true}).limit(BATCH_SIZE);
    if(error)throw error;
    if(!rows?.length)return json({checked:0,delivered:0,failed:0,expired:0,pending:0});
    const ids=rows.map(row=>String(row.provider_message_id));
    const receipts=await fetchReceipts(ids);
    let delivered=0,failed=0,expired=0,pending=0;
    for(const row of rows){
      const receipt=receipts?.[String(row.provider_message_id)];
      const now=new Date().toISOString();
      const attempts=Number(row.receipt_attempts||0)+1;
      if(!receipt){await supabase.from('notification_native_push_deliveries').update({receipt_attempts:attempts,receipt_checked_at:now,updated_at:now}).eq('id',row.id);pending++;continue;}
      if(receipt.status==='ok'){
        await supabase.from('notification_native_push_deliveries').update({status:'delivered',receipt_attempts:attempts,receipt_checked_at:now,delivered_at:now,last_error:null,updated_at:now}).eq('id',row.id);delivered++;continue;
      }
      const errorCode=receipt?.details?.error;
      const message=String(receipt?.message??errorCode??'Expo push receipt failed').slice(0,1000);
      const isExpired=errorCode==='DeviceNotRegistered';
      const terminal=isExpired||['MessageTooBig','MessageRateExceeded','MismatchSenderId','InvalidCredentials'].includes(String(errorCode));
      await supabase.from('notification_native_push_deliveries').update({status:terminal?(isExpired?'expired':'failed'):'submitted',receipt_attempts:attempts,receipt_checked_at:now,last_error:message,updated_at:now}).eq('id',row.id);
      if(isExpired){await supabase.from('notification_native_push_tokens').update({active:false,updated_at:now}).eq('id',row.token_id);expired++;}else if(terminal)failed++;else pending++;
    }
    return json({checked:rows.length,delivered,failed,expired,pending});
  }catch(error){return json({error:error instanceof Error?error.message:String(error)},500)}
});
