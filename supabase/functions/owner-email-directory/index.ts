import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')??'';
function namedKey(plural:string,legacy:string){
  try{const parsed=JSON.parse(Deno.env.get(plural)??'{}');if(parsed?.default)return String(parsed.default)}catch{}
  return Deno.env.get(legacy)??'';
}
const SUPABASE_PUBLISHABLE_KEY=namedKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
const SUPABASE_SECRET_KEY=namedKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{
    'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'access-control-allow-origin':'*',
    'access-control-allow-headers':'authorization,apikey,content-type,x-client-info',
    'access-control-allow-methods':'POST,OPTIONS',
  }});
}
function adminClient(){
  if(!SUPABASE_SECRET_KEY)throw new Error('Supabase server credential is unavailable.');
  return createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function authorize(req:Request){
  const header=req.headers.get('authorization')||'';
  if(!header.startsWith('Bearer '))throw Object.assign(new Error('Sign-in is required.'),{status:401});
  const jwt=header.slice(7).trim();
  const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:`Bearer ${jwt}`}},
  });
  const userResult=await client.auth.getUser(jwt);
  if(userResult.error||!userResult.data.user)throw Object.assign(new Error('Sign-in is required.'),{status:401});
  let authorization:any={};
  try{
    const result=await client.rpc('admin_authorization_v1');
    if(!result.error&&result.data&&typeof result.data==='object')authorization=result.data;
  }catch{}
  const isAdmin=Boolean(authorization.authorized||authorization.is_admin||authorization.is_platform_owner);
  return{userId:userResult.data.user.id,isAdmin,authorization};
}
function normalizeAddress(value:unknown){
  const raw=String(value??'').trim().toLowerCase();
  if(!raw)throw new Error('Email address is required.');
  const address=raw.includes('@')?raw:`${raw}@kleenest.us`;
  if(!/^[a-z0-9.!#$%&'*+/=?^_{}|~-]+@kleenest\.us$/.test(address))throw new Error('Address must be on kleenest.us.');
  return address;
}
function emailList(value:unknown){
  const raw=Array.isArray(value)?value.join(','):String(value??'');
  return [...new Set(raw.split(/[;,\n]/).map(v=>v.trim().toLowerCase()).filter(v=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)))].slice(0,10);
}
async function membership(userId:string,mailboxId:string){
  const admin=adminClient();
  const result=await admin.from('owner_email_mailbox_members').select('access_role,can_send').eq('mailbox_id',mailboxId).eq('user_id',userId).maybeSingle();
  if(result.error)throw result.error;
  return result.data;
}
async function canManage(userId:string,mailboxId:string,isAdmin:boolean){
  if(isAdmin)return true;
  const member=await membership(userId,mailboxId);
  return Boolean(member&&['owner','manager'].includes(String(member.access_role)));
}
async function accessibleMailboxIds(userId:string,isAdmin:boolean){
  const admin=adminClient();
  if(isAdmin){
    const result=await admin.from('owner_email_mailboxes').select('id').eq('active',true);
    if(result.error)throw result.error;
    return (result.data||[]).map((r:any)=>String(r.id));
  }
  const result=await admin.from('owner_email_mailbox_members').select('mailbox_id').eq('user_id',userId);
  if(result.error)throw result.error;
  return (result.data||[]).map((r:any)=>String(r.mailbox_id));
}
async function resolveUserIdByEmail(email:string){
  const admin=adminClient();
  let page=1;
  for(let i=0;i<10;i++,page++){
    const result=await admin.auth.admin.listUsers({page,perPage:1000});
    if(result.error)throw result.error;
    const found=result.data.users.find(u=>String(u.email||'').toLowerCase()===email.toLowerCase());
    if(found)return found.id;
    if(result.data.users.length<1000)break;
  }
  return null;
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return json({ok:true});
  if(req.method!=='POST')return json({error:'POST required.'},405);
  try{
    const auth=await authorize(req);
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||'').trim();
    const admin=adminClient();

    if(action==='list_mailboxes'){
      const ids=await accessibleMailboxIds(auth.userId,auth.isAdmin);
      if(!ids.length)return json({mailboxes:[],isAdmin:auth.isAdmin});
      const q=await admin.from('owner_email_mailboxes')
        .select('id,address,display_name,mailbox_type,owner_user_id,send_enabled,forwarding_enabled,forwarding_targets,keep_copy,signature_text,auto_reply_enabled,auto_reply_subject,auto_reply_body,active,created_at,updated_at')
        .in('id',ids)
        .order('address');
      if(q.error)throw q.error;
      return json({mailboxes:q.data||[],isAdmin:auth.isAdmin});
    }

    if(action==='directory'){
      if(!auth.isAdmin)throw Object.assign(new Error('Email administrator access is required.'),{status:403});
      const [mailboxes,aliases,members]=await Promise.all([
        admin.from('owner_email_mailboxes').select('*').order('address'),
        admin.from('owner_email_mailbox_aliases').select('*').order('alias_address'),
        admin.from('owner_email_mailbox_members').select('mailbox_id,user_id,access_role,can_send,created_at,updated_at').order('created_at'),
      ]);
      if(mailboxes.error)throw mailboxes.error;if(aliases.error)throw aliases.error;if(members.error)throw members.error;
      const userIds=[...new Set((members.data||[]).map((m:any)=>m.user_id).filter(Boolean))];
      let profiles:any[]=[];
      if(userIds.length){
        const p=await admin.from('profiles').select('id,display_name,username,is_admin,is_platform_owner').in('id',userIds);
        if(!p.error)profiles=p.data||[];
      }
      return json({mailboxes:mailboxes.data||[],aliases:aliases.data||[],members:members.data||[],profiles});
    }

    if(action==='save_mailbox'){
      if(!auth.isAdmin)throw Object.assign(new Error('Email administrator access is required.'),{status:403});
      const address=normalizeAddress(body?.address);
      const displayName=String(body?.displayName||address.split('@')[0]).trim().slice(0,120)||address;
      const mailboxType=String(body?.mailboxType||'shared');
      if(!['personal','shared','system'].includes(mailboxType))throw new Error('Invalid mailbox type.');
      const ownerUserId=body?.ownerUserId?String(body.ownerUserId):null;
      const row:any={
        address,display_name:displayName,mailbox_type:mailboxType,owner_user_id:ownerUserId,
        send_enabled:body?.sendEnabled!==false,
        signature_text:String(body?.signatureText||'').slice(0,10000),
        auto_reply_enabled:Boolean(body?.autoReplyEnabled),
        auto_reply_subject:String(body?.autoReplySubject||'').slice(0,500),
        auto_reply_body:String(body?.autoReplyBody||'').slice(0,20000),
        active:body?.active!==false,created_by:auth.userId,updated_at:new Date().toISOString(),
      };
      const saved=await admin.from('owner_email_mailboxes').upsert(row,{onConflict:'address'}).select('*').single();
      if(saved.error)throw saved.error;
      const member=await admin.from('owner_email_mailbox_members').upsert({
        mailbox_id:saved.data.id,user_id:auth.userId,access_role:'owner',can_send:true,updated_at:new Date().toISOString(),
      },{onConflict:'mailbox_id,user_id'});
      if(member.error)throw member.error;
      return json({ok:true,mailbox:saved.data});
    }

    if(action==='set_forwarding'){
      const mailboxId=String(body?.mailboxId||'');
      if(!mailboxId)throw new Error('Mailbox is required.');
      if(!await canManage(auth.userId,mailboxId,auth.isAdmin))throw Object.assign(new Error('Mailbox manager access is required.'),{status:403});
      const targets=emailList(body?.targets);
      const enabled=Boolean(body?.enabled)&&targets.length>0;
      const update=await admin.from('owner_email_mailboxes').update({
        forwarding_enabled:enabled,forwarding_targets:targets,keep_copy:body?.keepCopy!==false,updated_at:new Date().toISOString(),
      }).eq('id',mailboxId).select('*').single();
      if(update.error)throw update.error;
      return json({ok:true,mailbox:update.data});
    }

    if(action==='save_alias'){
      if(!auth.isAdmin)throw Object.assign(new Error('Email administrator access is required.'),{status:403});
      const mailboxId=String(body?.mailboxId||'');
      if(!mailboxId)throw new Error('Mailbox is required.');
      const aliasAddress=normalizeAddress(body?.aliasAddress);
      const same=await admin.from('owner_email_mailboxes').select('id').eq('address',aliasAddress).maybeSingle();
      if(same.error)throw same.error;
      if(same.data)throw new Error('That address is already a mailbox.');
      const saved=await admin.from('owner_email_mailbox_aliases').upsert({alias_address:aliasAddress,mailbox_id:mailboxId,active:true},{onConflict:'alias_address'}).select('*').single();
      if(saved.error)throw saved.error;
      return json({ok:true,alias:saved.data});
    }

    if(action==='remove_alias'){
      if(!auth.isAdmin)throw Object.assign(new Error('Email administrator access is required.'),{status:403});
      const aliasAddress=normalizeAddress(body?.aliasAddress);
      const removed=await admin.from('owner_email_mailbox_aliases').delete().eq('alias_address',aliasAddress);
      if(removed.error)throw removed.error;
      return json({ok:true});
    }

    if(action==='grant_access'){
      const mailboxId=String(body?.mailboxId||'');
      if(!mailboxId)throw new Error('Mailbox is required.');
      if(!await canManage(auth.userId,mailboxId,auth.isAdmin))throw Object.assign(new Error('Mailbox manager access is required.'),{status:403});
      const email=String(body?.memberEmail||'').trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw new Error('A valid user email is required.');
      const userId=await resolveUserIdByEmail(email);
      if(!userId)throw new Error('No Kleenest account exists for that email yet.');
      const role=String(body?.accessRole||'viewer');
      if(!['owner','manager','responder','viewer'].includes(role))throw new Error('Invalid mailbox role.');
      const saved=await admin.from('owner_email_mailbox_members').upsert({
        mailbox_id:mailboxId,user_id:userId,access_role:role,can_send:Boolean(body?.canSend),updated_at:new Date().toISOString(),
      },{onConflict:'mailbox_id,user_id'}).select('*').single();
      if(saved.error)throw saved.error;
      return json({ok:true,member:saved.data});
    }

    if(action==='revoke_access'){
      const mailboxId=String(body?.mailboxId||'');
      const userId=String(body?.userId||'');
      if(!mailboxId||!userId)throw new Error('Mailbox and user are required.');
      if(!await canManage(auth.userId,mailboxId,auth.isAdmin))throw Object.assign(new Error('Mailbox manager access is required.'),{status:403});
      const removed=await admin.from('owner_email_mailbox_members').delete().eq('mailbox_id',mailboxId).eq('user_id',userId);
      if(removed.error)throw removed.error;
      return json({ok:true});
    }

    if(action==='set_active'){
      if(!auth.isAdmin)throw Object.assign(new Error('Email administrator access is required.'),{status:403});
      const mailboxId=String(body?.mailboxId||'');
      const updated=await admin.from('owner_email_mailboxes').update({active:Boolean(body?.active),updated_at:new Date().toISOString()}).eq('id',mailboxId);
      if(updated.error)throw updated.error;
      return json({ok:true});
    }

    throw Object.assign(new Error('Unsupported mail directory action.'),{status:400});
  }catch(error:any){
    return json({error:String(error?.message||error||'Mail directory request failed.')},Number(error?.status)||500);
  }
});