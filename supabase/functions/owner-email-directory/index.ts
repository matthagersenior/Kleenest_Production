import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
function namedKey(plural:string,legacy:string){
  try { const v=JSON.parse(Deno.env.get(plural)??"{}"); if(v?.default)return String(v.default); }catch{}
  return Deno.env.get(legacy)??"";
}
const PUBLIC_KEY=namedKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
const SECRET_KEY=namedKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const addressPattern=/^[a-z0-9.!#$%&'*+/=?^_{}|~-]+@kleenest\.us$/;
const admin=()=>createClient(SUPABASE_URL,SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type,x-client-info","access-control-allow-methods":"POST,OPTIONS"}});
function reject(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
function id(value:unknown){const v=String(value??"");if(!uuid.test(v))reject("Invalid ID.");return v;}
function address(value:unknown){const v=String(value??"").trim().toLowerCase();if(!addressPattern.test(v)||v.length>254)reject("Use an @kleenest.us address.");return v;}
function textValue(value:unknown,max=300){const v=String(value??"").trim();if(v.length>max)reject("Text is too long.");return v;}
function optionalBool(value:unknown){if(typeof value!=="boolean")reject("Expected a true/false setting.");return value;}
async function identity(req:Request){
  const bearer=req.headers.get("authorization")??"";
  if(!bearer.startsWith("Bearer "))reject("Sign in required.",401);
  const jwt=bearer.slice(7);
  const userClient=createClient(SUPABASE_URL,PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:"Bearer "+jwt}}});
  const {data:userData,error:userError}=await userClient.auth.getUser(jwt);
  if(userError||!userData.user||userData.user.is_anonymous)reject("Sign in required.",401);
  const {data,error}=await userClient.rpc("admin_authorization_v1");
  // Failure of the admin RPC must never confer administrative powers.
  const authority=(!error&&data&&typeof data==="object"?data:{}) as Record<string,unknown>;
  return {userId:userData.user.id,authority,platformOwner:!error&&authority.is_platform_owner===true};
}
async function audit(userId:string,action:string,detail:Record<string,unknown>){
  const {error}=await admin().from("owner_email_center_audit").insert({owner_user_id:userId,action:"mailbox_"+action,detail});
  if(error)throw error;
}
async function availableAddress(value:string,exceptId?:string){
  const db=admin();
  const [m,a]=await Promise.all([db.from("owner_email_mailboxes").select("id").eq("address",value).maybeSingle(),db.from("owner_email_mailbox_aliases").select("mailbox_id").eq("alias_address",value).maybeSingle()]);
  if(m.error)throw m.error;if(a.error)throw a.error;
  if((m.data&&m.data.id!==exceptId)||(a.data&&a.data.mailbox_id!==exceptId))reject("That address already belongs to a mailbox or alias.",409);
}
async function existingMailbox(mailboxId:string){
  const {data,error}=await admin().from("owner_email_mailboxes").select("id,address,mailbox_type,owner_user_id,active").eq("id",mailboxId).single();
  if(error||!data)reject("Mailbox not found.",404);
  return data!;
}
async function validUser(value:unknown){
  const target=id(value);const {data,error}=await admin().auth.admin.getUserById(target);
  if(error||!data.user)reject("Choose an existing Kleenest account.",404);
  return target;
}
async function overview(){
  const db=admin();
  const [mailboxes,members,aliases]=await Promise.all([
    db.from("owner_email_mailboxes").select("id,address,display_name,mailbox_type,owner_user_id,send_enabled,active,forwarding_enabled,forwarding_targets,keep_copy,signature_text,auto_reply_enabled,auto_reply_subject,auto_reply_body").order("address"),
    db.from("owner_email_mailbox_members").select("mailbox_id,user_id,access_role,can_send"),
    db.from("owner_email_mailbox_aliases").select("alias_address,mailbox_id,active").order("alias_address"),
  ]);
  for(const result of [mailboxes,members,aliases])if(result.error)throw result.error;
  // Address display is restricted to the platform owner on this endpoint.
  const users=[...new Set((members.data||[]).map((m:any)=>String(m.user_id)))];
  const userEntries=await Promise.all(users.map(async userId=>{
    const {data,error}=await db.auth.admin.getUserById(userId);
    return [userId,error?"":String(data.user?.email??"")] as const;
  }));
  const emails=new Map<string,string>(userEntries);
  return {mailboxes:(mailboxes.data||[]).map((m:any)=>({...m,members:(members.data||[]).filter((x:any)=>x.mailbox_id===m.id).map((x:any)=>({...x,email:emails.get(String(x.user_id))??""})),aliases:(aliases.data||[]).filter((a:any)=>a.mailbox_id===m.id)}))};
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return json({ok:true});
  if(req.method!=="POST")return json({error:"POST required."},405);
  try{
    if(!SECRET_KEY||!PUBLIC_KEY)reject("Mail service credentials unavailable.",503);
    const {userId,authority,platformOwner}=await identity(req);
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    const action=String(body.action??"");
    const db=admin();
    if(action==="list_mailboxes"){
      const [mailboxes,members]=await Promise.all([
        db.from("owner_email_mailboxes").select("id,address,display_name,mailbox_type,send_enabled,active,owner_user_id,signature_text,forwarding_enabled,auto_reply_enabled").eq("active",true).neq("mailbox_type","system").order("address"),
        db.from("owner_email_mailbox_members").select("mailbox_id,access_role,can_send").eq("user_id",userId),
      ]);
      if(mailboxes.error)throw mailboxes.error;if(members.error)throw members.error;
      const byId=new Map((members.data||[]).map((m:any)=>[String(m.mailbox_id),m]));
      const isAdmin=authority.is_admin===true||authority.is_platform_owner===true||authority.authorized===true;
      const visible=(mailboxes.data||[]).filter((m:any)=> {
        const member=byId.has(String(m.id)), owns=m.owner_user_id===userId;
        return platformOwner||owns||member;
      }).map((m:any)=>{
        const member:any=byId.get(String(m.id));
        return {id:m.id,address:m.address,display_name:m.display_name,mailbox_type:m.mailbox_type,active:m.active,
          signature_text:m.signature_text||'',forwarding_enabled:Boolean(m.forwarding_enabled),auto_reply_enabled:Boolean(m.auto_reply_enabled),
          send_enabled:Boolean(m.send_enabled)&&(platformOwner||m.owner_user_id===userId||Boolean(member?.can_send)),
          can_modify:platformOwner||m.owner_user_id===userId||["owner","manager","responder"].includes(String(member?.access_role||"")),
          can_manage:platformOwner||m.owner_user_id===userId||["owner","manager"].includes(String(member?.access_role||""))};
      });
      if(!visible.length&&!isAdmin)reject("No mailbox is assigned to this account.",403);
      return json({mailboxes:visible,isAdmin});
    }
    if(!platformOwner)reject("Platform owner authorization required.",403);
    if(action==="admin_overview")return json(await overview());
    if(action==="create_mailbox"){
      const addr=address(body.address);await availableAddress(addr);
      const mailboxType=body.mailboxType==="personal"?"personal":"shared";
      const ownerId=body.ownerUserId?await validUser(body.ownerUserId):null;
      if(mailboxType==="personal"&&!ownerId)reject("A personal mailbox must have an assigned owner.");
      const displayName=textValue(body.displayName,120)||addr;
      const {data,error}=await db.from("owner_email_mailboxes").insert({address:addr,display_name:displayName,mailbox_type:mailboxType,owner_user_id:ownerId,created_by:userId,send_enabled:true,active:true}).select("id").single();
      if(error)throw error;
      if(ownerId){const member=await db.from("owner_email_mailbox_members").upsert({mailbox_id:data.id,user_id:ownerId,access_role:"owner",can_send:true},{onConflict:"mailbox_id,user_id"});if(member.error)throw member.error;}
      await audit(userId,action,{mailboxId:data.id,address:addr});return json({ok:true,mailboxId:data.id});
    }
    if(action==="update_mailbox"){
      const mailboxId=id(body.mailboxId);const m=await existingMailbox(mailboxId);
      if(m.mailbox_type==="system")reject("System mailbox settings cannot be edited here.",403);
      const updates:Record<string,unknown>={updated_at:new Date().toISOString()};
      const fields:Record<string,string>={displayName:"display_name",sendEnabled:"send_enabled",active:"active",forwardingEnabled:"forwarding_enabled",forwardingTargets:"forwarding_targets",keepCopy:"keep_copy",signatureText:"signature_text",autoReplyEnabled:"auto_reply_enabled",autoReplySubject:"auto_reply_subject",autoReplyBody:"auto_reply_body"};
      for(const [key,col] of Object.entries(fields)){
        if(!(key in body))continue;
        if(["sendEnabled","active","forwardingEnabled","keepCopy","autoReplyEnabled"].includes(key))updates[col]=optionalBool(body[key]);
        else if(key==="forwardingTargets"){
          if(!Array.isArray(body[key])||body[key].length>10)reject("Use up to ten forwarding addresses.");
          updates[col]=(body[key] as unknown[]).map(v=>{const s=textValue(v,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))reject("Invalid forwarding address.");return s});
        }else updates[col]=textValue(body[key],key==="autoReplyBody"?5000:key==="signatureText"?2000:160);
      }
      if("display_name" in updates&&!updates.display_name)reject("Display name required.");
      const {error}=await db.from("owner_email_mailboxes").update(updates).eq("id",mailboxId);
      if(error)throw error;
      await audit(userId,action,{mailboxId,fields:Object.keys(updates)});
      return json({ok:true});
    }
    if(action==="add_alias"){
      const mailboxId=id(body.mailboxId);const m=await existingMailbox(mailboxId);
      if(m.mailbox_type==="system")reject("System aliases cannot be modified.",403);
      const alias=address(body.alias);await availableAddress(alias,mailboxId);
      const {error}=await db.from("owner_email_mailbox_aliases").upsert({alias_address:alias,mailbox_id:mailboxId,active:true},{onConflict:"alias_address"});
      if(error)throw error;
      await audit(userId,action,{mailboxId,alias});return json({ok:true});
    }
    if(action==="remove_alias"){
      const mailboxId=id(body.mailboxId);const alias=address(body.alias);
      await existingMailbox(mailboxId);
      const {data,error}=await db.from("owner_email_mailbox_aliases").update({active:false}).eq("mailbox_id",mailboxId).eq("alias_address",alias).select("alias_address");
      if(error)throw error;if(!data?.length)reject("Alias not found.",404);
      await audit(userId,action,{mailboxId,alias});return json({ok:true});
    }
    if(action==="assign_member"){
      const mailboxId=id(body.mailboxId);const m=await existingMailbox(mailboxId);
      if(m.mailbox_type==="system")reject("System mailbox cannot be delegated.",403);
      const target=await validUser(body.userId);
      const role=String(body.role??"viewer");
      if(!["owner","manager","responder","viewer"].includes(role))reject("Invalid mailbox role.");
      const canSend=role==="viewer"?false:optionalBool(body.canSend??true);
      const {error}=await db.from("owner_email_mailbox_members").upsert({mailbox_id:mailboxId,user_id:target,access_role:role,can_send:canSend},{onConflict:"mailbox_id,user_id"});
      if(error)throw error;
      await audit(userId,action,{mailboxId,userId:target,role,canSend});return json({ok:true});
    }
    if(action==="remove_member"){
      const mailboxId=id(body.mailboxId),target=id(body.userId),m=await existingMailbox(mailboxId);
      if(m.owner_user_id===target)reject("Transfer ownership before removing the personal mailbox owner.");
      const {data,error}=await db.from("owner_email_mailbox_members").delete().eq("mailbox_id",mailboxId).eq("user_id",target).select("user_id");
      if(error)throw error;if(!data?.length)reject("Membership not found.",404);
      await audit(userId,action,{mailboxId,userId:target});return json({ok:true});
    }
    reject("Unsupported directory action.",400);
  }catch(error:any){return json({error:String(error?.message||"Mailbox request failed.")},Number(error?.status)||500)}
});