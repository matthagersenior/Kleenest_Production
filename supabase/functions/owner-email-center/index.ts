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
const RESEND_EMAILS_ENDPOINT='https://api.resend.com/emails';

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
  const authorization=(!error&&data&&typeof data==='object'?data:{}) as Record<string,unknown>;
  if(!authorization.authorized&&!authorization.is_admin&&!authorization.is_platform_owner){
    // Membership, not global admin status, grants a named/shared mailbox login.
    const member=await adminClient().from('owner_email_mailbox_members')
      .select('mailbox_id').eq('user_id',userData.user.id).limit(1);
    if(member.error)throw Object.assign(new Error('Mailbox access could not be checked.'),{status:403});
    if(!member.data?.length)throw Object.assign(new Error('No Kleenest mailbox is assigned to this account.'),{status:403});
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

function emailAttachments(value:unknown){
  if(value===undefined||value===null)return [];
  if(!Array.isArray(value)||value.length>3)throw new Error('Up to three attachments are supported.');
  const formats:Record<string,string>={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',txt:'text/plain',csv:'text/csv'};
  let total=0;
  return value.map((item:any)=>{
    const filename=String(item?.filename||'').split(/[/\\]/).pop()?.slice(0,140)||'';
    const ext=filename.split('.').pop()?.toLowerCase()||'';
    const content=String(item?.content||'');
    if(!formats[ext])throw new Error('Only PDF, PNG, JPG, TXT, and CSV attachments are supported.');
    if(!content||content.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(content))throw new Error('Attachment encoding is invalid.');
    const size=content.length/4*3-(content.endsWith('==')?2:content.endsWith('=')?1:0);
    if(size>2*1024*1024)throw new Error('Each attachment must be 2 MB or smaller.');
    total+=size;
    if(total>3*1024*1024)throw new Error('Total attachments must be 3 MB or smaller.');
    return {filename,content,contentType:formats[ext],size};
  });
}

function parseMailbox(value:string){
  const bracket=value.match(/<([^>]+)>/);
  const address=(bracket?.[1]||value).trim().toLowerCase();
  const name=bracket?value.slice(0,value.indexOf('<')).trim().replace(/^"|"$/g,''):'';
  return{name,address};
}
function withMailboxSignature(message:string,mailbox:{signature_text?:string|null}){
  const signature=String(mailbox.signature_text||'').trim();
  if(!signature||message.trimEnd().endsWith(signature))return message;
  return message.trimEnd()+'\n\n'+signature;
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
  const{data,error}=await admin.rpc('owner_email_center_provider_config');
  if(error)throw error;
  return(data||{}) as {configured?:boolean;api_key?:string;from_address?:string;webhook_configured?:boolean};
}
async function resend(path:string,apiKey:string,init:RequestInit={}){
  const endpoint=path==='/emails'?RESEND_EMAILS_ENDPOINT:`${RESEND_API}${path}`;
  const response=await fetch(endpoint,{
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
  const own=await admin.from('owner_email_center_settings').select('*').eq('owner_user_id',ownerUserId).maybeSingle();
  if(own.error)throw own.error;
  if(own.data)return own.data;
  const primary=await admin.from('owner_email_center_settings').select('*').order('created_at',{ascending:true}).limit(1).maybeSingle();
  if(primary.error)throw primary.error;
  if(!primary.data)throw new Error('Owner Email Center settings are missing.');
  return primary.data;
}
async function loadMailbox(mailboxId?:string|null){
  const admin=adminClient();
  let q=admin.from('owner_email_mailboxes').select('*').eq('active',true);
  q=mailboxId?q.eq('id',mailboxId):q.eq('address','support@kleenest.us');
  const result=await q.limit(1).maybeSingle();
  if(result.error)throw result.error;
  if(!result.data)throw new Error('Kleenest mailbox is unavailable.');
  return result.data;
}
async function mailboxMembership(userId:string,mailboxId:string){
  const result=await adminClient().from('owner_email_mailbox_members')
    .select('access_role,can_send')
    .eq('mailbox_id',mailboxId)
    .eq('user_id',userId)
    .maybeSingle();
  if(result.error)throw result.error;
  return result.data;
}
async function requireMailboxAccess(userId:string,authorization:Record<string,unknown>,mailboxId:string,requireSend=false,requireModify=false){
  const mailbox=await loadMailbox(mailboxId);
  const platformOwner=Boolean(authorization.is_platform_owner);
  const admin=Boolean(authorization.authorized||authorization.is_admin||authorization.is_platform_owner);
  const member=await mailboxMembership(userId,mailboxId);
  const owns=String(mailbox.owner_user_id||'')===userId;
  const personal=mailbox.mailbox_type==='personal';
  const canRead=platformOwner||owns||Boolean(member);
  if(!canRead)throw Object.assign(new Error('Mailbox access is required.'),{status:403});
  if(requireModify&&!platformOwner&&!owns&&!['owner','manager','responder'].includes(String(member?.access_role||'')))
    throw Object.assign(new Error('Mailbox editing permission is required.'),{status:403});
  if(requireSend){
    const canSend=platformOwner||owns||Boolean(member?.can_send);
    if(!mailbox.send_enabled||!canSend)throw Object.assign(new Error('Send permission is required for this mailbox.'),{status:403});
  }
  return mailbox;
}
async function accessibleMailboxIds(userId:string,authorization:Record<string,unknown>){
  const admin=adminClient();
  if(Boolean(authorization.is_platform_owner)){
    const all=await admin.from('owner_email_mailboxes').select('id').eq('active',true);
    if(all.error)throw all.error;
    return (all.data||[]).map((row:any)=>String(row.id));
  }
  const membership=await admin.from('owner_email_mailbox_members').select('mailbox_id').eq('user_id',userId);
  if(membership.error)throw membership.error;
  const memberIds=(membership.data||[]).map((row:any)=>String(row.mailbox_id));
  const mailboxes=await admin.from('owner_email_mailboxes').select('id,mailbox_type,owner_user_id').eq('active',true);
  if(mailboxes.error)throw mailboxes.error;
  const isAdmin=Boolean(authorization.authorized||authorization.is_admin);
  return (mailboxes.data||[])
    .filter((row:any)=>String(row.owner_user_id||'')===userId||memberIds.includes(String(row.id)))
    .map((row:any)=>String(row.id));
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
  try{
    const{error}=await adminClient().from('owner_email_center_audit').insert({
      owner_user_id:ownerUserId,
      thread_id:threadId,
      action,
      detail,
    });
    if(error)console.warn('Owner Email Center audit insert failed:',error.message);
  }catch(error){
    console.warn('Owner Email Center audit insert failed:',String((error as any)?.message||error));
  }
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
  attachments?:Array<{filename:string;content:string;contentType:string;size:number}>;
}){
  const ready=await requireReady(input.ownerUserId);
  const payload:any={from:input.from||ready.from,to:input.to,subject:input.subject,text:input.body};
  if(input.cc?.length)payload.cc=input.cc;
  if(input.bcc?.length)payload.bcc=input.bcc;
  if(input.headers&&Object.keys(input.headers).length)payload.headers=input.headers;
  if(input.attachments?.length)payload.attachments=input.attachments.map(({filename,content,contentType})=>({filename,content,contentType}));
  const sent=await resend('/emails',ready.provider.api_key,{method:'POST',body:JSON.stringify(payload)});
  let detail:any={};
  try{detail=await resend(`/emails/${encodeURIComponent(String(sent.id))}`,ready.provider.api_key)}catch{}
  let attachmentMetadata=(input.attachments||[]).map(file=>({filename:file.filename,mimeType:file.contentType,size:file.size,id:null}));
  if(input.attachments?.length&&sent.id){
    try{
      const listing=await resend('/emails/'+encodeURIComponent(String(sent.id))+'/attachments',ready.provider.api_key);
      const rows=Array.isArray(listing?.data)?listing.data:[];
      if(rows.length)attachmentMetadata=rows.map((item:any)=>({
        id:String(item.id||'')||null,
        filename:String(item.filename||'attachment'),
        mimeType:String(item.content_type||'application/octet-stream'),
        size:Number(item.size)||0,
      }));
    }catch{}
  }
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
    attachments:attachmentMetadata,
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
    const storageSettings=await loadSettings(userId);
    const storageOwnerUserId=String(storageSettings.owner_user_id);

    if(action==='status'){
      let settings=await loadSettings(userId);
      const provider=await providerConfig();
      if(provider.configured&&provider.api_key&&settings.provider_domain_id){
        try{
          const domain=await resend(`/domains/${encodeURIComponent(String(settings.provider_domain_id))}`,String(provider.api_key));
          const domainStatus=String(domain?.status||settings.domain_status||'pending').toLowerCase();
          if(domainStatus&&domainStatus!==settings.domain_status){
            const synced=await admin.from('owner_email_center_settings')
              .update({domain_status:domainStatus,updated_at:new Date().toISOString()})
              .eq('owner_user_id',storageOwnerUserId)
              .select('*')
              .single();
            if(!synced.error&&synced.data)settings=synced.data;
          }
        }catch{}
      }
      const snapshot=await admin.rpc('owner_email_center_status_snapshot',{p_owner_user_id:storageOwnerUserId});
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
        ...(Boolean(authorization.is_platform_owner)?(snapshot.data||{}):{}),
        authorization,
      });
    }

    if(action==='list_threads'){
      const maxResults=Math.min(Math.max(Number(body?.maxResults)||50,1),100);
      const query=optionalText(body?.query,300);
      const unreadOnly=Boolean(body?.unreadOnly);
      const mailbox=String(body?.mailbox||'inbox');
      const direction=String(body?.direction||'any');
      const mailboxId=optionalText(body?.mailboxId,100);
      const accessibleIds=await accessibleMailboxIds(userId,authorization);
      if(mailboxId&&!accessibleIds.includes(mailboxId))throw Object.assign(new Error('Mailbox access is required.'),{status:403});
      if(!accessibleIds.length)return json({threads:[],nextPageToken:null});
      let q=admin.from('owner_email_center_threads')
        .select('id,subject,snippet,participants,last_message_at,unread,folder,latest_direction,starred,message_count,has_attachment,labels,priority,support_request_id,source_app,mailbox_id,recipient_address')
        .eq('owner_user_id',storageOwnerUserId)
        .in('mailbox_id',mailboxId?[mailboxId]:accessibleIds)
        .order('last_message_at',{ascending:false})
        .limit(maxResults);
      if(mailboxId)q=q.eq('mailbox_id',mailboxId);
      if(mailbox==='inbox')q=q.eq('folder','inbox');
      else if(mailbox==='archive')q=q.eq('folder','archive');
      else if(mailbox==='sent')q=q.eq('folder','sent');
      else if(mailbox==='drafts')q=q.eq('folder','drafts');
      else if(mailbox==='spam')q=q.eq('folder','spam');
      else if(mailbox==='trash')q=q.eq('folder','trash');
      else if(mailbox==='all')q=q.neq('folder','trash');
      else throw new Error('Unsupported mailbox view.');
      if(direction==='incoming')q=q.eq('latest_direction','inbound');
      else if(direction==='outgoing')q=q.eq('latest_direction','outbound');
      else if(direction!=='any')throw new Error('Unsupported message direction.');
      if(unreadOnly)q=q.eq('unread',true);
      if(query)q=q.or('subject.ilike.%'+query.replace(/[,%]/g,'')+'%,snippet.ilike.%'+query.replace(/[,%]/g,'')+'%');
      const{data,error}=await q;
      if(error)throw error;
      const mailboxIds=[...new Set((data||[]).map((row:any)=>row.mailbox_id).filter(Boolean))];
      const mailboxRows=mailboxIds.length
        ? await admin.from('owner_email_mailboxes').select('id,address,display_name').in('id',mailboxIds)
        : {data:[],error:null};
      if(mailboxRows.error)throw mailboxRows.error;
      const byId=new Map((mailboxRows.data||[]).map((m:any)=>[String(m.id),m]));
      const threadIds=(data||[]).map((row:any)=>String(row.id));
      const messageRows=threadIds.length
        ? await admin.from('owner_email_center_messages')
            .select('thread_id,direction,from_address,to_addresses,delivery_status,created_at')
            .in('thread_id',threadIds)
            .order('created_at',{ascending:false})
        : {data:[],error:null};
      if(messageRows.error)throw messageRows.error;
      const latestByThread=new Map<string,any>();
      for(const message of messageRows.data||[]){
        const id=String(message.thread_id||'');
        if(id&&!latestByThread.has(id))latestByThread.set(id,message);
      }
      const threads=(data||[]).map((row:any)=>{
        const m=byId.get(String(row.mailbox_id||''));
        const mailboxAddress=String(m?.address||row.recipient_address||'').toLowerCase();
        const latest=latestByThread.get(String(row.id));
        const participants=Array.isArray(row.participants)?row.participants.map((v:any)=>String(v).toLowerCase()):[];
        const fallbackCounterparty=participants.find((v:string)=>v&&v!==mailboxAddress)||participants[0]||'';
        const counterparty=latest?.direction==='outbound'
          ? String(latest?.to_addresses?.[0]||fallbackCounterparty)
          : String(latest?.from_address||fallbackCounterparty);
        return{
          id:row.id,historyId:null,snippet:row.snippet||'',subject:row.subject||'(no subject)',
          from:counterparty,fromEmail:counterparty||null,date:row.last_message_at||null,
          unread:Boolean(row.unread),inInbox:row.folder==='inbox',latestSent:row.latest_direction==='outbound',
          latestDeliveryStatus:latest?.delivery_status||null,
          starred:Boolean(row.starred),messageCount:Number(row.message_count||0),hasAttachment:Boolean(row.has_attachment),
          labelNames:Array.isArray(row.labels)?row.labels:[],folder:row.folder,priority:row.priority||'normal',
          supportRequestId:row.support_request_id||null,sourceApp:row.source_app||null,
          mailboxId:row.mailbox_id||null,mailboxAddress:m?.address||row.recipient_address||null,mailboxDisplayName:m?.display_name||null,
        };
      });
      return json({threads,nextPageToken:null});
    }

    if(action==='get_attachment'){
      const threadId=requiredText(body?.threadId,'threadId',100);
      const messageId=requiredText(body?.messageId,'messageId',100);
      const attachmentId=requiredText(body?.attachmentId,'attachmentId',160);
      const thread=await admin.from('owner_email_center_threads')
        .select('mailbox_id').eq('owner_user_id',storageOwnerUserId).eq('id',threadId).single();
      if(thread.error)throw thread.error;
      if(!thread.data.mailbox_id)throw Object.assign(new Error('Thread mailbox is unavailable.'),{status:409});
      await requireMailboxAccess(userId,authorization,String(thread.data.mailbox_id),false);
      const record=await admin.from('owner_email_center_messages')
        .select('direction,provider_email_id,attachments')
        .eq('owner_user_id',storageOwnerUserId).eq('thread_id',threadId).eq('id',messageId).single();
      if(record.error)throw record.error;
      const attachments=Array.isArray(record.data.attachments)?record.data.attachments:[];
      const match=attachments.find((item:any)=>String(item.id||'')===attachmentId);
      if(!match||!record.data.provider_email_id)throw Object.assign(new Error('Attachment is not available.'),{status:404});
      const provider=await providerConfig();
      if(!provider.configured||!provider.api_key)throw Object.assign(new Error('Email provider unavailable.'),{status:503});
      const prefix=record.data.direction==='inbound'?'emails/receiving/':'emails/';
      const location='/'+prefix+encodeURIComponent(record.data.provider_email_id)+'/attachments/'+encodeURIComponent(attachmentId);
      const file=await resend(location,String(provider.api_key));
      const downloadUrl=String(file.download_url||'');
      if(!downloadUrl.startsWith('https://'))throw Object.assign(new Error('Secure download is unavailable.'),{status:502});
      await audit(storageOwnerUserId,threadId,'download_attachment',{messageId,attachmentId});
      return json({downloadUrl,filename:String(file.filename||match.filename||'attachment'),expiresAt:file.expires_at||null});
    }

    if(action==='get_thread'){
      const threadId=requiredText(body?.threadId,'threadId',100);
      const threadResult=await admin.from('owner_email_center_threads').select('*').eq('owner_user_id',storageOwnerUserId).eq('id',threadId).single();
      if(threadResult.error)throw threadResult.error;
      const row=threadResult.data;
      if(!row.mailbox_id)throw Object.assign(new Error('Thread mailbox is unavailable.'),{status:409});
      const mailboxRow=await requireMailboxAccess(userId,authorization,String(row.mailbox_id),false);
      const messageResult=await admin.from('owner_email_center_messages').select('*').eq('owner_user_id',storageOwnerUserId).eq('thread_id',threadId).order('created_at',{ascending:true});
      if(messageResult.error)throw messageResult.error;
      const messages=(messageResult.data||[]).map((message:any)=>({
        id:message.id,threadId,
        from:message.from_name?String(message.from_name)+' <'+String(message.from_address)+'>':message.from_address,
        fromEmail:message.from_address,to:(message.to_addresses||[]).join(', '),cc:(message.cc_addresses||[]).join(', '),bcc:(message.bcc_addresses||[]).join(', '),
        subject:message.subject,date:message.received_at||message.sent_at||message.created_at,
        messageId:message.internet_message_id,references:(message.reference_ids||[]).join(' '),
        snippet:excerpt(message.text_body||''),body:message.text_body||'',
        unread:Boolean(row.unread)&&message.direction==='inbound',sent:message.direction==='outbound',
        deliveryStatus:message.delivery_status||null,attachments:Array.isArray(message.attachments)?message.attachments:[],
      }));
      return json({thread:{
        id:row.id,historyId:null,subject:row.subject,participants:row.participants||[],unread:Boolean(row.unread),
        inInbox:row.folder==='inbox',folder:row.folder,starred:Boolean(row.starred),priority:row.priority||'normal',
        supportRequestId:row.support_request_id||null,sourceApp:row.source_app||null,
        mailboxId:row.mailbox_id||null,mailboxAddress:mailboxRow?.address||row.recipient_address||null,
        mailboxDisplayName:mailboxRow?.display_name||null,labelIds:row.labels||[],labelNames:row.labels||[],messages,
      }});
    }

    if(action==='save_draft'){
      const draftId=optionalText(body?.draftId,100);
      const to=emailList(body?.to);
      const cc=emailList(body?.cc);
      const bcc=emailList(body?.bcc);
      const subject=optionalText(body?.subject,500)||'(draft)';
      const text=optionalText(body?.body,50000);
      if(!to.length&&!cc.length&&!bcc.length&&subject==='(draft)'&&!text)throw new Error('Draft is empty.');
      let mailbox:any;
      let threadId=draftId;
      if(threadId){
        const current=await admin.from('owner_email_center_threads').select('id,folder,mailbox_id').eq('owner_user_id',storageOwnerUserId).eq('id',threadId).single();
        if(current.error)throw current.error;
        if(current.data.folder!=='drafts')throw new Error('Only draft conversations can be updated as drafts.');
        if(!current.data.mailbox_id)throw Object.assign(new Error('Draft mailbox is unavailable.'),{status:409});
        mailbox=await requireMailboxAccess(userId,authorization,String(current.data.mailbox_id),true);
        const updated=await admin.from('owner_email_center_threads').update({
          subject,normalized_subject:normalizeSubject(subject),folder:'drafts',unread:false,
          participants:[...new Set([...to,...cc])],snippet:excerpt(text),latest_direction:'outbound',
          mailbox_id:mailbox.id,recipient_address:mailbox.address,
          last_message_at:new Date().toISOString(),updated_at:new Date().toISOString(),
        }).eq('id',threadId);
        if(updated.error)throw updated.error;
        const cleared=await admin.from('owner_email_center_messages').delete().eq('owner_user_id',storageOwnerUserId).eq('thread_id',threadId);
        if(cleared.error)throw cleared.error;
      }else{
        const requestedMailboxId=optionalText(body?.mailboxId,100);
        const requestedMailbox=requestedMailboxId?await loadMailbox(requestedMailboxId):await loadMailbox(null);
        mailbox=await requireMailboxAccess(userId,authorization,String(requestedMailbox.id),true);
        const created=await admin.from('owner_email_center_threads').insert({
          owner_user_id:storageOwnerUserId,mailbox_id:mailbox.id,recipient_address:mailbox.address,
          subject,normalized_subject:normalizeSubject(subject),folder:'drafts',unread:false,
          participants:[...new Set([...to,...cc])],snippet:excerpt(text),latest_direction:'outbound',
          message_count:0,last_message_at:new Date().toISOString(),
        }).select('id').single();
        if(created.error)throw created.error;
        threadId=String(created.data.id);
      }
      const inserted=await admin.from('owner_email_center_messages').insert({
        thread_id:threadId,owner_user_id:storageOwnerUserId,mailbox_id:mailbox.id,direction:'outbound',from_address:mailbox.address,
        from_name:mailbox.display_name||'Kleenest',to_addresses:to,cc_addresses:cc,bcc_addresses:bcc,
        subject,text_body:text,headers:{draft:true},attachments:[],delivery_status:'draft',
      }).select('id').single();
      if(inserted.error)throw inserted.error;
      await refreshThread(threadId);
      await admin.from('owner_email_center_threads').update({folder:'drafts',unread:false}).eq('id',threadId);
      await audit(storageOwnerUserId,threadId,'save_draft',{to,subject,mailbox:mailbox.address});
      return json({ok:true,threadId,messageId:String(inserted.data.id)});
    }

    if(action==='send'){
      const requestedMailboxId=optionalText(body?.mailboxId,100);
      const requestedMailbox=requestedMailboxId?await loadMailbox(requestedMailboxId):await loadMailbox(null);
      const mailbox=await requireMailboxAccess(userId,authorization,String(requestedMailbox.id),true);
      const ready=await requireReady(storageOwnerUserId);
      const to=emailList(requiredText(body?.to,'to',2000));
      const cc=emailList(body?.cc);
      const bcc=emailList(body?.bcc);
      if(!to.length)throw new Error('At least one valid recipient is required.');
      if(!mailbox.send_enabled)throw Object.assign(new Error('Sending is disabled for this mailbox.'),{status:403});
      const subject=requiredText(body?.subject,'subject',500);
      const text=withMailboxSignature(requiredText(body?.body,'body',50000),mailbox);
      const attachments=emailAttachments(body?.attachments);
      const created=await admin.from('owner_email_center_threads').insert({
        owner_user_id:storageOwnerUserId,mailbox_id:mailbox.id,recipient_address:mailbox.address,
        subject,normalized_subject:normalizeSubject(subject),folder:'sent',unread:false,
        participants:[...new Set([...to,...cc])],snippet:excerpt(text),latest_direction:'outbound',
        last_message_at:new Date().toISOString(),
      }).select('id').single();
      if(created.error)throw created.error;
      const from=String(mailbox.display_name||'Kleenest')+' <'+String(mailbox.address)+'>';
      return json(await sendAndStore({ownerUserId:storageOwnerUserId,threadId:created.data.id,from,to,cc,bcc,subject,body:text,attachments,auditAction:'send'}));
    }

    if(action==='reply'){
      const threadId=requiredText(body?.threadId,'threadId',100);
      const replyBody=requiredText(body?.body,'body',50000);
      const replyAll=Boolean(body?.replyAll);
      const thread=await admin.from('owner_email_center_threads').select('*').eq('owner_user_id',storageOwnerUserId).eq('id',threadId).single();
      if(thread.error)throw thread.error;
      if(!thread.data.mailbox_id)throw Object.assign(new Error('Thread mailbox is unavailable.'),{status:409});
      const mailbox=await requireMailboxAccess(userId,authorization,String(thread.data.mailbox_id),true);

      if(thread.data.support_request_id){
        const support=await admin.from('support_requests').select('id,user_id,status,source_app,subject').eq('id',thread.data.support_request_id).single();
        if(support.error)throw support.error;
        const history=await admin.from('owner_email_center_messages').select('*').eq('owner_user_id',storageOwnerUserId).eq('thread_id',threadId).order('created_at',{ascending:false});
        if(history.error)throw history.error;
        const source=(history.data||[]).find((m:any)=>m.direction==='inbound')||(history.data||[])[0];
        const target=String(source?.from_address||('app-user+'+String(support.data.user_id).replaceAll('-','')+'@kleenest.local')).toLowerCase();
        const now=new Date().toISOString();
        const stored=await admin.from('owner_email_center_messages').insert({
          thread_id:threadId,owner_user_id:storageOwnerUserId,mailbox_id:mailbox.id,direction:'outbound',
          from_address:mailbox.address,from_name:mailbox.display_name||'Kleenest',to_addresses:[target],cc_addresses:[],bcc_addresses:[],
          subject:/^re:/i.test(thread.data.subject)?thread.data.subject:'Re: '+thread.data.subject,
          text_body:replyBody,headers:{channel:'app_support',support_request_id:String(support.data.id),source_app:support.data.source_app||thread.data.source_app||'unknown'},
          attachments:[],delivery_status:'delivered_in_app',sent_at:now,
        }).select('id').single();
        if(stored.error)throw stored.error;
        const updatedSupport=await admin.from('support_requests').update({status:'in_progress',admin_notes:replyBody,updated_at:now}).eq('id',support.data.id);
        if(updatedSupport.error)throw updatedSupport.error;
        await admin.from('owner_email_center_threads').update({folder:'inbox',unread:false,updated_at:now}).eq('id',threadId);
        await refreshThread(threadId);
        await audit(storageOwnerUserId,threadId,'support_reply',{support_request_id:support.data.id,status:'in_progress',mailbox:mailbox.address});
        return json({messageId:String(stored.data.id),threadId,status:'in_progress'});
      }

      await requireReady(storageOwnerUserId);
      if(!mailbox.send_enabled)throw Object.assign(new Error('Sending is disabled for this mailbox.'),{status:403});
      const history=await admin.from('owner_email_center_messages').select('*').eq('owner_user_id',storageOwnerUserId).eq('thread_id',threadId).order('created_at',{ascending:false});
      if(history.error)throw history.error;
      const messages=history.data||[];
      const source=messages.find((m:any)=>m.direction==='inbound')||messages[0];
      if(!source?.from_address)throw new Error('A reply target could not be determined.');
      const target=String(source.from_address).toLowerCase();
      const cc=replyAll?[...new Set([...(source.to_addresses||[]),...(source.cc_addresses||[])].map((v:string)=>v.toLowerCase()).filter((v:string)=>v!==mailbox.address&&v!==target))]:[];
      const subject=/^re:/i.test(thread.data.subject)?thread.data.subject:'Re: '+thread.data.subject;
      const refs=[...(source.reference_ids||[]),source.internet_message_id].filter(Boolean);
      const headers:Record<string,string>={};
      if(source.internet_message_id)headers['In-Reply-To']=source.internet_message_id;
      if(refs.length)headers.References=[...new Set(refs)].join(' ');
      await admin.from('owner_email_center_threads').update({folder:'inbox',unread:false,updated_at:new Date().toISOString()}).eq('id',threadId);
      const from=String(mailbox.display_name||'Kleenest')+' <'+String(mailbox.address)+'>';
      return json(await sendAndStore({ownerUserId:storageOwnerUserId,threadId,from,to:[target],cc,subject,body:withMailboxSignature(replyBody,mailbox),headers,auditAction:replyAll?'reply_all':'reply'}));
    }

    if(action==='forward'){
      const threadId=requiredText(body?.threadId,'threadId',100);
      const to=emailList(requiredText(body?.to,'to',2000));
      if(!to.length)throw new Error('At least one valid recipient is required.');
      const note=optionalText(body?.body,50000);
      const thread=await admin.from('owner_email_center_threads').select('subject,mailbox_id').eq('owner_user_id',storageOwnerUserId).eq('id',threadId).single();
      if(thread.error)throw thread.error;
      if(!thread.data.mailbox_id)throw Object.assign(new Error('Thread mailbox is unavailable.'),{status:409});
      const mailbox=await requireMailboxAccess(userId,authorization,String(thread.data.mailbox_id),true);
      await requireReady(storageOwnerUserId);
      if(!mailbox.send_enabled)throw Object.assign(new Error('Sending is disabled for this mailbox.'),{status:403});
      const last=await admin.from('owner_email_center_messages').select('*').eq('owner_user_id',storageOwnerUserId).eq('thread_id',threadId).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(last.error||!last.data)throw last.error||new Error('Thread has no messages.');
      const subject=/^fwd:/i.test(thread.data.subject)?thread.data.subject:'Fwd: '+thread.data.subject;
      const forwarded=[note,note?'\n':'','---------- Forwarded message ----------','From: '+last.data.from_address,'Subject: '+last.data.subject,'',last.data.text_body||''].join('\n');
      const from=String(mailbox.display_name||'Kleenest')+' <'+String(mailbox.address)+'>';
      return json(await sendAndStore({ownerUserId:storageOwnerUserId,threadId,from,to,subject,body:withMailboxSignature(forwarded,mailbox),auditAction:'forward'}));
    }

    if(action==='block_sender'){
      const threadId=requiredText(body?.threadId,'threadId',100);
      const current=await admin.from('owner_email_center_threads').select('*').eq('owner_user_id',storageOwnerUserId).eq('id',threadId).single();
      if(current.error)throw current.error;
      if(!current.data.mailbox_id)throw Object.assign(new Error('Thread mailbox is unavailable.'),{status:409});
      await requireMailboxAccess(userId,authorization,String(current.data.mailbox_id),false,true);
      const member=await mailboxMembership(userId,String(current.data.mailbox_id));
      const isAdministrator=Boolean(authorization.is_platform_owner);
      if(!isAdministrator&&!['owner','manager'].includes(String(member?.access_role||''))){
        throw Object.assign(new Error('Mailbox management permission is required to block senders.'),{status:403});
      }
      const latest=await admin.from('owner_email_center_messages').select('from_address,direction').eq('owner_user_id',storageOwnerUserId).eq('thread_id',threadId).eq('direction','inbound').order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(latest.error)throw latest.error;
      const sender=String(latest.data?.from_address||'').toLowerCase();
      if(!sender)throw new Error('No inbound sender is available to block.');
      const settings=await loadSettings(userId);
      const blocked=[...new Set([...(Array.isArray(settings.blocked_senders)?settings.blocked_senders:[]),sender])];
      const saved=await admin.from('owner_email_center_settings').update({blocked_senders:blocked,updated_at:new Date().toISOString()}).eq('owner_user_id',storageOwnerUserId);
      if(saved.error)throw saved.error;
      const moved=await admin.from('owner_email_center_threads').update({folder:'spam',unread:false,updated_at:new Date().toISOString()}).eq('id',threadId);
      if(moved.error)throw moved.error;
      await audit(storageOwnerUserId,threadId,'block_sender',{sender});
      return json({ok:true,sender});
    }

    if(['archive','set_read','star','trash','set_inbox','set_label','spam'].includes(action)){
      const threadId=requiredText(body?.threadId,'threadId',100);
      const current=await admin.from('owner_email_center_threads').select('*').eq('owner_user_id',storageOwnerUserId).eq('id',threadId).single();
      if(current.error)throw current.error;
      if(!current.data.mailbox_id)throw Object.assign(new Error('Thread mailbox is unavailable.'),{status:409});
      await requireMailboxAccess(userId,authorization,String(current.data.mailbox_id),false,true);
      const patch:any={updated_at:new Date().toISOString()};
      if(action==='archive')patch.folder='archive';
      if(action==='trash')patch.folder='trash';
      if(action==='spam')patch.folder='spam';
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
      await audit(storageOwnerUserId,threadId,action,patch);
      return json(action==='set_label'?{ok:true,labelId:String(body?.labelName||'')}:{ok:true});
    }

    throw Object.assign(new Error('Unsupported Email Center action.'),{status:400});
  }catch(error:any){
    return json({error:String(error?.message||error||'Email Center request failed.')},Number(error?.status)||500);
  }
});
