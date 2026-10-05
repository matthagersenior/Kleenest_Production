import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')??'';
function namedKey(plural:string,legacy:string){
  try{
    const parsed=JSON.parse(Deno.env.get(plural)??'{}');
    if(parsed?.default)return String(parsed.default);
  }catch{}
  return Deno.env.get(legacy)??'';
}
const SUPABASE_PUBLISHABLE_KEY=namedKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
const SUPABASE_SECRET_KEY=namedKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
const RESEND_API='https://api.resend.com';

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'access-control-allow-origin':'*',
      'access-control-allow-headers':'authorization,apikey,content-type,x-client-info',
      'access-control-allow-methods':'POST,OPTIONS',
    },
  });
}
function adminClient(){
  if(!SUPABASE_SECRET_KEY)throw new Error('Supabase server credential is unavailable.');
  return createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function authorize(req:Request){
  const authorizationHeader=req.headers.get('authorization')||'';
  if(!authorizationHeader.startsWith('Bearer '))throw Object.assign(new Error('Owner sign-in is required.'),{status:401});
  const jwt=authorizationHeader.slice('Bearer '.length).trim();
  const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:`Bearer ${jwt}`}},
  });
  const[{data:userData,error:userError},{data,error}]=await Promise.all([
    client.auth.getUser(jwt),
    client.rpc('admin_authorization_v1'),
  ]);
  if(userError||!userData.user)throw Object.assign(new Error('Owner sign-in is required.'),{status:401});
  if(error)throw Object.assign(new Error(error.message),{status:403});
  const authorization=(data&&typeof data==='object'?data:{}) as Record<string,unknown>;
  if(!authorization.authorized&&!authorization.is_admin&&!authorization.is_platform_owner){
    throw Object.assign(new Error('Owner/admin authority is required for email access.'),{status:403});
  }
  return{userId:userData.user.id,authorization};
}
function requiredText(value:unknown,name:string,max=20000){
  const text=String(value??'').trim();
  if(!text)throw new Error(`${name} is required.`);
  if(text.length>max)throw new Error(`${name} is too long.`);
  return text;
}
function optionalText(value:unknown,max=20000){
  return String(value??'').trim().slice(0,max);
}
function emailList(value:unknown){
  return [...new Set(String(value??'').split(/[;,]/).map(v=>v.trim().toLowerCase()).filter(v=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)))];
}
function parseMailbox(value:string){
  const bracket=value.match(/<([^>]+)>/);
  const address=(bracket?.[1]||value).trim().toLowerCase();
  const name=bracket?value.slice(0,value.indexOf('<')).trim().replace(/^"|"$/g,''):'';
  return{name,address};
}
function normalizeSubject(value:string){
  return value.toLowerCase().replace(/^\s*((re|fw|fwd):\s*)+/i,'').replace(/\s+/g,' ').trim();
}
function excerpt(value:string,max=240){
  const clean=String(value||'').replace(/\s+/g,' ').trim();
  return clean.length>max?`${clean.slice(0,max-1)}…`:clean;
}
async function providerConfig(){
  const admin=adminClient();
  const{data,error}=await admin.schema('internal').rpc('owner_email_center_provider_config');
  if(error)throw error;
  return(data||{}) as {configured?:boolean;api_key?:string;from_address?:string;webhook_configured?:boolean};
}
async function resend(path:string,apiKey:string,init:RequestInit={}){
  const response=await fetch(`${RESEND_API}${path}`,{
    ...init,
    headers:{
      'authorization':`Bearer ${apiKey}`,
      'content-type':'application/json',
      ...(init.headers||{}),
    },
  });
  const text=await response.text();
  let data:any={};
  try{data=text?JSON.parse(text):{}}catch{data={};}
  if(!response.ok){
    const error=new Error(String(data?.message||data?.error||`Email provider returned ${response.status}.`));
    (error as any).status=response.status;
    throw error;
  }
  return data;
}
async function loadSettings(ownerUserId:string){
  const admin=adminClient();
  const{data,error}=await admin.from('owner_email_center_settings').select('*').eq('owner_user_id',ownerUserId).maybeSingle();
  if(error)throw error;
  if(data)return data;
  const fallback=await admin.from('owner_email_notification_settings').select('recipient_email').eq('owner_user_id',ownerUserId).maybeSingle();
  const row={
    owner_user_id:ownerUserId,
    inbox_address:'support@kleenest.us',
    fallback_email:fallback.data?.recipient_email||null,
    from_name:'Kleenest',
    provider:'resend',
    provider_domain_id:null,
    domain_status:'pending',
    webhook_enabled:false,
  };
  const created=await admin.from('owner_email_center_settings').insert(row).select('*').single();
  if(created.error)throw created.error;
  return created.data;
}
async function requireReady(ownerUserId:string){
  const[provider,settings]=await Promise.all([providerConfig(),loadSettings(ownerUserId)]);
  if(!provider.configured||!provider.api_key)throw Object.assign(new Error('Email provider is not configured.'),{status:503});
  if(settings.domain_status!=='verified')throw Object.assign(new Error('Kleenest email domain is still awaiting DNS verification.'),{status:503});
  if(!settings.webhook_enabled)throw Object.assign(new Error('Inbound Kleenest email is not active yet.'),{status:503});
  const from=String(provider.from_address||'').trim();
  if(!from.toLowerCase().includes('@kleenest.us'))throw Object.assign(new Error('Kleenest branded sender is not active yet.'),{status:503});
  return{provider:{...provider,api_key:String(provider.api_key)},settings,from};
}
async function audit(ownerUserId:string,threadId:string|null,action:string,detail:Record<string,unknown>={}){
  await adminClient().from('owner_email_center_audit').insert({owner_user_id:ownerUserId,thread_id:threadId,action,detail}).catch(()=>{});
}
async function refreshThread(threadId:string){
  const admin=adminClient();
  const{data:messages,error}=await admin.from('owner_email_center_messages').select('direction,from_address,to_addresses,cc_addresses,text_body,subject,attachments,created_at,received_at,sent_at').eq('thread_id',threadId).order('created_at',{ascending:true});
  if(error)throw error;
  const rows=messages||[];
  const last=rows[rows.length-1];
  const participants=[...new Set(rows.flatMap((row:any)=>[row.from_address,...(row.to_addresses||[]),...(row.cc_addresses||[])]).filter(Boolean))];
  const update={
    subject:last?.subject||'(no subject)',
    normalized_subject:normalizeSubject(last?.subject||''),
    participants,
    snippet:excerpt(last?.text_body||''),
    latest_direction:last?.direction||'inbound',
    message_count:rows.length,
    has_attachment:rows.some((row:any)=>Array.isArray(row.attachments)&&row.attachments.length>0),
    last_message_at:last?.received_at||last?.sent_at||last?.created_at||new Date().toISOString(),
    updated_at:new Date().toISOString(),
  };
  const result=await admin.from('owner_email_center_threads').update(update).eq('id',threadId);
  if(result.error)throw result.error;
}
async function sendAndStore(input:{
  ownerUserId:string;threadId:string;from:string;to:string[];cc?:string[];bcc?:string[];
  subject:string;body:string;headers?:Record<string,string>;auditAction:string;
}){
  const ready=await requireReady(input.ownerUserId);
  const payload:any={from:input.from||ready.from,to:input.to,subject:input.subject,text:input.body};
  if(input.cc?.length)payload.cc=input.cc;
  if(input.bcc?.length)payload.bcc=input.bcc;
  if(input.headers&&Object.keys(input.headers).length)payload.headers=input.headers;
  const sent=await resend('/emails',ready.provider.api_key,{method:'POST',body:JSON.stringify(payload)});
  let detail:any={};
  try{detail=await resend(`/emails/${encodeURIComponent(String(sent.id))}`,ready.provider.api_key)}catch{}
  const internetMessageId=String(detail?.message_id||'').trim()||null;
  const parsedFrom=parseMailbox(input.from||ready.from);
  const now=new Date().toISOString();
  const insert=await adminClient().from('owner_email_center_messages').insert({
    thread_id:input.threadId,
    owner_user_id:input.ownerUserId,
    provider_email_id:String(sent.id||'')||null,
    internet_message_id:internetMessageId,
    in_reply_to:input.headers?.['In-Reply-To']||null,
    reference_ids:String(input.headers?.References||'').match(/<[^>]+>/g)||[],
    direction:'outbound',
    from_address:parsedFrom.address,
    from_name:parsedFrom.name||ready.settings.from_name||'Kleenest',
    to_addresses:input.to,
    cc_addresses:input.cc||[],
    bcc_addresses:input.bcc||[],
    subject:input.subject,
    text_body:input.body,
    headers:input.headers||{},
    attachments:[],
    delivery_status:String(detail?.last_event||'sent'),
    sent_at:now,
  });
  if(insert.error)throw insert.error;
  await refreshThread(input.threadId);
  await audit(input.ownerUserId,input.threadId,input.auditAction,{provider_email_id:String(sent.id||''),to:input.to});
  return{messageId:String(sent.id||''),threadId:input.threadId};
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return json({ok:true});
  if(req.method!=='POST')return json({error:'POST required.'},405);
  try{
    const{userId,authorization}=await authorize(req);
    const body=await req.json().catch(()=>({}));
    const action=requiredText(body?.action,'action',40);
    const admin=adminClient();

    if(action==='status'){
      const[settings,provider,snapshot]=await Promise.all([
        loadSettings(userId),
        providerConfig(),
        admin.schema('internal').rpc('owner_email_center_status_snapshot',{p_owner_user_id:userId}),
      ]);
      if(snapshot.error)throw snapshot.error;
      const connected=Boolean(provider.configured)&&settings.domain_status==='verified'&&Boolean(settings.webhook_enabled)&&String(provider.from_address||'').toLowerCase().includes('@kleenest.us');
      return json({
        connected,
        provider:'resend',
        emailAddress:settings.inbox_address,
        fallbackAddress:settings.fallback_email,
        domainStatus:settings.domain_status,
        webhookEnabled:Boolean(settings.webhook_enabled),
        fromAddress:String(provider.from_address||''),
        providerConfigured:Boolean(provider.configured),
        ...(snapshot.data||{}),
        authorization,
      });
    }

    if(action==='list_threads'){
      const maxResults=Math.min(Math.max(Number(body?.maxResults)||50,1),100);
      const query=optionalText(body?.query,300);
      const unreadOnly=Boolean(body?.unreadOnly);
      const mailbox=String(body?.mailbox||'inbox');
      const direction=String(body?.direction||'any');
      let q=admin.from('owner_email_center_threads')
        .select('id,subject,snippet,participants,last_message_at,unread,folder,latest_direction,starred,message_count,has_attachment,labels')
        .eq('owner_user_id',userId)
        .order('last_message_at',{ascending:false})
        .limit(maxResults);
      if(mailbox==='inbox')q=q.eq('folder','inbox');
      else if(mailbox==='sent')q=q.neq('folder','trash').eq('latest_direction','outbound');
      else if(mailbox==='all')q=q.neq('folder','trash');
      else throw new Error('Unsupported mailbox view.');
      if(direction==='incoming')q=q.eq('latest_direction','inbound');
      else if(direction==='outgoing')q=q.eq('latest_direction','outbound');
      else if(direction!=='any')throw new Error('Unsupported message direction.');
      if(unreadOnly)q=q.eq('unread',true);
      if(query)q=q.or(`subject.ilike.%${query.replace(/[,%]/g,'')}%,snippet.ilike.%${query.replace(/[,%]/g,'')}%`);
      const{data,error}=await q;
      if(error)throw error;
      const threads=(data||[]).map((row:any)=>({
        id:row.id,
        historyId:null,
        snippet:row.snippet||'',
        subject:row.subject||'(no subject)',
        from:row.participants?.[0]||'',
        fromEmail:row.participants?.[0]||null,
        date:row.last_message_at||null,
        unread:Boolean(row.unread),
        inInbox:row.folder==='inbox',
        latestSent:row.latest_direction==='outbound',
        starred:Boolean(row.starred),
        messageCount:Number(row.message_count||0),
        hasAttachment:Boolean(row.has_attachment),
        labelNames:Array.isArray(row.labels)?row.labels:[],
      }));
      return json({threads,nextPageToken:null});
    }

    if(action==='get_thread'){
      const threadId=requiredText(body?.threadId,'threadId',100);
      const threadResult=await admin.from('owner_email_center_threads').select('*').eq('owner_user_id',userId).eq('id',threadId).single();
      if(threadResult.error)throw threadResult.error;
      const messageResult=await admin.from('owner_email_center_messages').select('*').eq('owner_user_id',userId).eq('thread_id',threadId).order('created_at',{ascending:true});
      if(messageResult.error)throw messageResult.error;
      const row=threadResult.data;
      const messages=(messageResult.data||[]).map((message:any)=>({
        id:message.id,
        threadId,
        from:message.from_name?`${message.from_name} <${message.from_address}>`:message.from_address,
        fromEmail:message.from_address,
        to:(message.to_addresses||[]).join(', '),
        cc:(message.cc_addresses||[]).join(', '),
        subject:message.subject,
        date:message.received_at||message.sent_at||message.created_at,
        messageId:message.internet_message_id,
        references:(message.reference_ids||[]).join(' '),
        snippet:excerpt(message.text_body||''),
        body:message.text_body||'',
        unread:Boolean(row.unread)&&message.direction==='inbound',
        sent:message.direction==='outbound',
        attachments:Array.isArray(message.attachments)?message.attachments:[],
      }));
      return json({thread:{
        id:row.id,
        historyId:null,
        subject:row.subject,
        participants:row.participants||[],
        unread:Boolean(row.unread),
        inInbox:row.folder==='inbox',
        labelIds:row.labels||[],
        labelNames:row.labels||[],
        messages,
      }});
    }

    if(action==='send'){
      const ready=await requireReady(userId);
      const to=emailList(requiredText(body?.to,'to',2000));
      const cc=emailList(body?.cc);
      const bcc=emailList(body?.bcc);
      if(!to.length)throw new Error('At least one valid recipient is required.');
      const subject=requiredText(body?.subject,'subject',500);
      const text=requiredText(body?.body,'body',50000);
      const created=await admin.from('owner_email_center_threads').insert({
        owner_user_id:userId,
        subject,
        normalized_subject:normalizeSubject(subject),
        folder:'sent',
        unread:false,
        participants:[...new Set([...to,...cc])],
        snippet:excerpt(text),
        latest_direction:'outbound',
        last_message_at:new Date().toISOString(),
      }).select('id').single();
      if(created.error)throw created.error;
      return json(await sendAndStore({ownerUserId:userId,threadId:created.data.id,from:ready.from,to,cc,bcc,subject,body:text,auditAction:'send'}));
    }

    if(action==='reply'){
      const ready=await requireReady(userId);
      const threadId=requiredText(body?.threadId,'threadId',100);
      const replyBody=requiredText(body?.body,'body',50000);
      const replyAll=Boolean(body?.replyAll);
      const thread=await admin.from('owner_email_center_threads').select('*').eq('owner_user_id',userId).eq('id',threadId).single();
      if(thread.error)throw thread.error;
      const history=await admin.from('owner_email_center_messages').select('*').eq('owner_user_id',userId).eq('thread_id',threadId).order('created_at',{ascending:false});
      if(history.error)throw history.error;
      const messages=history.data||[];
      const source=messages.find((m:any)=>m.direction==='inbound')||messages[0];
      if(!source?.from_address)throw new Error('A reply target could not be determined.');
      const self=String(ready.settings.inbox_address||'support@kleenest.us').toLowerCase();
      const target=String(source.from_address).toLowerCase();
      const cc=replyAll?[...new Set([...(source.to_addresses||[]),...(source.cc_addresses||[])].map((v:string)=>v.toLowerCase()).filter((v:string)=>v!==self&&v!==target))]:[];
      const subject=/^re:/i.test(thread.data.subject)?thread.data.subject:`Re: ${thread.data.subject}`;
      const refs=[...(source.reference_ids||[]),source.internet_message_id].filter(Boolean);
      const headers:Record<string,string>={};
      if(source.internet_message_id)headers['In-Reply-To']=source.internet_message_id;
      if(refs.length)headers.References=[...new Set(refs)].join(' ');
      await admin.from('owner_email_center_threads').update({folder:'inbox',unread:false,updated_at:new Date().toISOString()}).eq('id',threadId);
      return json(await sendAndStore({ownerUserId:userId,threadId,from:ready.from,to:[target],cc,subject,body:replyBody,headers,auditAction:replyAll?'reply_all':'reply'}));
    }

    if(action==='forward'){
      const ready=await requireReady(userId);
      const threadId=requiredText(body?.threadId,'threadId',100);
      const to=emailList(requiredText(body?.to,'to',2000));
      if(!to.length)throw new Error('At least one valid recipient is required.');
      const note=optionalText(body?.body,50000);
      const thread=await admin.from('owner_email_center_threads').select('subject').eq('owner_user_id',userId).eq('id',threadId).single();
      if(thread.error)throw thread.error;
      const last=await admin.from('owner_email_center_messages').select('*').eq('owner_user_id',userId).eq('thread_id',threadId).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(last.error||!last.data)throw last.error||new Error('Thread has no messages.');
      const subject=/^fwd:/i.test(thread.data.subject)?thread.data.subject:`Fwd: ${thread.data.subject}`;
      const forwarded=[note,note?'\n':'','---------- Forwarded message ----------',`From: ${last.data.from_address}`,`Subject: ${last.data.subject}`,'',last.data.text_body||''].join('\n');
      return json(await sendAndStore({ownerUserId:userId,threadId,from:ready.from,to,subject,body:forwarded,auditAction:'forward'}));
    }

    if(['archive','set_read','star','trash','set_inbox','set_label'].includes(action)){
      const threadId=requiredText(body?.threadId,'threadId',100);
      const current=await admin.from('owner_email_center_threads').select('*').eq('owner_user_id',userId).eq('id',threadId).single();
      if(current.error)throw current.error;
      const patch:any={updated_at:new Date().toISOString()};
      if(action==='archive')patch.folder='archive';
      if(action==='trash')patch.folder='trash';
      if(action==='set_inbox')patch.folder=Boolean(body?.inInbox)?'inbox':'archive';
      if(action==='set_read')patch.unread=!Boolean(body?.read);
      if(action==='star')patch.starred=Boolean(body?.starred);
      if(action==='set_label'){
        const label=requiredText(body?.labelName,'labelName',64);
        const labels=new Set<string>(Array.isArray(current.data.labels)?current.data.labels:[]);
        Boolean(body?.applied)?labels.add(label):labels.delete(label);
        patch.labels=[...labels];
      }
      const updated=await admin.from('owner_email_center_threads').update(patch).eq('id',threadId);
      if(updated.error)throw updated.error;
      await audit(userId,threadId,action,patch);
      return json(action==='set_label'?{ok:true,labelId:String(body?.labelName||'')}:{ok:true});
    }

    throw Object.assign(new Error('Unsupported Email Center action.'),{status:400});
  }catch(error:any){
    return json({error:String(error?.message||error||'Email Center request failed.')},Number(error?.status)||500);
  }
});
