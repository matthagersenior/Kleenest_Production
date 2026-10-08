import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const URL=Deno.env.get("SUPABASE_URL")??"";
function key(name:string,legacy:string){
  try { const obj=JSON.parse(Deno.env.get(name)??"{}"); if(obj?.default)return String(obj.default); } catch {}
  return Deno.env.get(legacy)??"";
}
const SECRET=key("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
const VAPID_SUBJECT=Deno.env.get("VAPID_SUBJECT")??"mailto:notifications@kleenest.us";
async function vapidCredentials(){
  const publicEnv=Deno.env.get("VAPID_PUBLIC_KEY")??"";
  const privateEnv=Deno.env.get("VAPID_PRIVATE_KEY")??"";
  if(publicEnv&&privateEnv)return {publicKey:publicEnv,privateKey:privateEnv};
  // Supabase Vault keeps the private key encrypted at rest. RPCs are invoker-only,
  // executable by service_role, never anon or authenticated clients.
  const stored=await db.rpc("owner_email_vapid_get");
  if(stored.error)throw stored.error;
  if(stored.data?.public_key&&stored.data?.private_key){
    return {publicKey:String(stored.data.public_key),privateKey:String(stored.data.private_key)};
  }
  const generated=await crypto.subtle.generateKey(
    {name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]
  );
  const jwk=await crypto.subtle.exportKey("jwk",generated.privateKey);
  if(!jwk.x||!jwk.y||!jwk.d)throw new Error("Unable to export VAPID key.");
  const bytes=(value:string)=>{
    const b64=value.replace(/-/g,"+").replace(/_/g,"/");
    return Uint8Array.from(atob(b64+"=".repeat((4-b64.length%4)%4)),ch=>ch.charCodeAt(0));
  };
  const raw=new Uint8Array(65);
  raw[0]=4;raw.set(bytes(jwk.x),1);raw.set(bytes(jwk.y),33);
  const publicKey=btoa(String.fromCharCode(...raw)).split("+").join("-").split("/").join("_").replace(/=+$/,"");
  const privateKey=jwk.d;
  const seeded=await db.rpc("owner_email_vapid_seed",{p_public_key:publicKey,p_private_key:privateKey});
  if(seeded.error)throw seeded.error;
  // If another instance won the race, use its keys, not the discarded pair.
  const persisted=await db.rpc("owner_email_vapid_get");
  if(persisted.error||!persisted.data?.public_key||!persisted.data?.private_key)
    throw new Error("Cannot load stored mail push credentials.");
  return {publicKey:String(persisted.data.public_key),privateKey:String(persisted.data.private_key)};
}
const cors={"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,authorization,apikey,x-kleenest-worker-secret"};
const db=createClient(URL,SECRET,{auth:{persistSession:false,autoRefreshToken:false}});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store",...cors}});
async function workerAuthorized(req:Request){
  const received=req.headers.get("x-kleenest-worker-secret");
  if(!received||!SECRET)return false;
  const {data,error}=await db.rpc("get_push_worker_secret");
  return !error&&typeof data==="string"&&data.length>0&&received===data;
}
async function main(req:Request){
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method==="GET"){
    if(!SECRET)return response({error:"Push service unavailable."},503);
    const vapid=await vapidCredentials();
    return response({vapid_public_key:vapid.publicKey});
  }
  if(req.method!=="POST")return response({error:"POST required"},405);
  if(!await workerAuthorized(req))return response({error:"Unauthorized"},401);
  if(!SECRET)return response({error:"Push service unavailable."},503);
  const vapid=await vapidCredentials();
  const input=await req.json().catch(()=>({}));
  const threadId=String(input.thread_id??""),mailboxId=String(input.mailbox_id??"");
  if(!uuid.test(threadId)||!uuid.test(mailboxId))return response({error:"Invalid IDs"},400);
  const {data:thread,error:te}=await db.from("owner_email_center_threads")
    .select("id,mailbox_id,folder,latest_direction,message_count")
    .eq("id",threadId).eq("mailbox_id",mailboxId).maybeSingle();
  if(te)throw te;
  if(!thread||thread.folder!=="inbox"||thread.latest_direction!=="inbound")return response({ok:true,skipped:"not_in_inbox"});
  const {data:msg,error:me}=await db.from("owner_email_center_messages")
    .select("id").eq("thread_id",threadId).eq("mailbox_id",mailboxId).eq("direction","inbound")
    .order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(me)throw me;
  if(!msg)return response({ok:true,skipped:"no_inbound_message"});
  const {data:mailbox,error:be}=await db.from("owner_email_mailboxes")
    .select("id,address,active,owner_user_id").eq("id",mailboxId).maybeSingle();
  if(be)throw be;
  if(!mailbox?.active)return response({ok:true,skipped:"inactive_mailbox"});
  const [membersResult,ownerResult]=await Promise.all([
    db.from("owner_email_mailbox_members").select("user_id").eq("mailbox_id",mailboxId),
    db.from("owner_email_center_settings").select("owner_user_id").order("created_at",{ascending:true}).limit(1).maybeSingle()
  ]);
  if(membersResult.error)throw membersResult.error;
  if(ownerResult.error)throw ownerResult.error;
  // The directory grants this primary owner access to every active mailbox.
  const userIds=[...new Set([
    ...(membersResult.data??[]).map((m:{user_id:string})=>m.user_id),
    mailbox.owner_user_id,ownerResult.data?.owner_user_id
  ].filter((s):s is string=>typeof s==="string"&&uuid.test(s)))];
  if(!userIds.length)return response({ok:true,skipped:"no_recipients"});
  const [prefsResult,subscriptionsResult]=await Promise.all([
    db.from("owner_email_push_preferences").select("user_id,enabled").eq("mailbox_id",mailboxId).in("user_id",userIds),
    db.from("owner_email_push_subscriptions").select("id,user_id,subscription").in("user_id",userIds),
  ]);
  if(prefsResult.error)throw prefsResult.error;
  if(subscriptionsResult.error)throw subscriptionsResult.error;
  const disabled=new Set((prefsResult.data??[]).filter((p:{enabled:boolean})=>p.enabled===false).map((p:{user_id:string})=>p.user_id));
  const allowed=new Set(userIds.filter(userId=>!disabled.has(userId)));
  const url="https://mail.kleenest.us/?mailbox="+encodeURIComponent(mailboxId)+"&thread="+encodeURIComponent(threadId);
  const payload=JSON.stringify({
    title:"Kleenest Mail",
    body:"New mail in "+mailbox.address,
    tag:"kleenest-mail-"+msg.id,
    type:"kleenest-mail",
    url,
    data:{type:"kleenest-mail",url,mailbox_id:mailboxId,thread_id:threadId}
  });
  webpush.setVapidDetails(VAPID_SUBJECT,vapid.publicKey,vapid.privateKey);
  let delivered=0,skipped=0,failed=0;
  for(const subscription of subscriptionsResult.data??[]){
    if(!allowed.has(subscription.user_id)){skipped++;continue;}
    const {data:existing,error:existingError}=await db.from("owner_email_push_deliveries")
      .select("status,attempt_count").eq("message_id",msg.id).eq("subscription_id",subscription.id).maybeSingle();
    if(existingError){failed++;continue;}
    if(existing?.status==="sent"||existing?.status==="expired"){skipped++;continue;}
    const attempts=(existing?.attempt_count??0)+1;
    const queued=await db.from("owner_email_push_deliveries").upsert({
      message_id:msg.id,subscription_id:subscription.id,status:"pending",attempt_count:attempts,
      updated_at:new Date().toISOString()
    },{onConflict:"message_id,subscription_id"});
    if(queued.error){failed++;continue;}
    try{
      await webpush.sendNotification(subscription.subscription,payload,{TTL:86400,urgency:"normal"});
      await db.from("owner_email_push_deliveries").update({
        status:"sent",sent_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()
      }).eq("message_id",msg.id).eq("subscription_id",subscription.id);
      delivered++;
    }catch(error){
      const code=Number((error as {statusCode?:number})?.statusCode??0);
      const expired=code===404||code===410;
      await db.from("owner_email_push_deliveries").update({
        status:expired?"expired":"failed",last_error:String(error).slice(0,800),
        updated_at:new Date().toISOString()
      }).eq("message_id",msg.id).eq("subscription_id",subscription.id);
      if(expired)await db.from("owner_email_push_subscriptions").delete().eq("id",subscription.id);
      failed++;
    }
  }
  return response({ok:true,message_id:msg.id,delivered,skipped,failed});
}
Deno.serve(async req=>{try{return await main(req)}catch(error){console.error("mail_push_error",String(error));return response({error:"Mail notification delivery failed."},500)}});
