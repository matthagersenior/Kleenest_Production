import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@6.9.2";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')??'';
function namedKey(plural:string,legacy:string){
  try{
    const parsed=JSON.parse(Deno.env.get(plural)??'{}');
    if(parsed?.default)return String(parsed.default);
  }catch{}
  return Deno.env.get(legacy)??'';
}
const SUPABASE_SECRET_KEY=namedKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');

function adminClient(){
  if(!SUPABASE_SECRET_KEY)throw new Error('Supabase server credential is unavailable.');
  return createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
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
function htmlToText(value:string){
  return value
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<br\s*\/?\s*>/gi,'\n')
    .replace(/<\/p>/gi,'\n\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/[ \t]+/g,' ')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}
function headerMap(input:any){
  const map=new Map<string,string>();
  if(Array.isArray(input)){
    for(const row of input){
      const name=String(row?.name??'').toLowerCase();
      if(name&&!map.has(name))map.set(name,String(row?.value??''));
    }
  }else if(input&&typeof input==='object'){
    for(const[key,value]of Object.entries(input))map.set(String(key).toLowerCase(),Array.isArray(value)?value.join(' '):String(value??''));
  }
  return map;
}
function messageIds(value:string){
  return [...new Set(String(value||'').match(/<[^>]+>/g)||[])];
}
async function providerConfig(){
  const admin=adminClient();
  const{data,error}=await admin.rpc('owner_email_center_provider_config');
  if(error)throw error;
  const config=(data||{}) as {api_key?:string;webhook_secret?:string;configured?:boolean;webhook_configured?:boolean};
  if(!config.configured||!config.api_key)throw new Error('Resend API key is not configured.');
  if(!config.webhook_configured||!config.webhook_secret)throw new Error('Resend webhook signing secret is not configured.');
  return{apiKey:String(config.api_key),webhookSecret:String(config.webhook_secret)};
}
async function findOwnerForRecipients(recipients:string[]){
  const admin=adminClient();
  const{data,error}=await admin.from('owner_email_center_settings').select('*');
  if(error)throw error;
  const normalized=new Set(recipients.map(v=>v.toLowerCase()));
  return(data||[]).find((row:any)=>normalized.has(String(row.inbox_address||'').toLowerCase()))||null;
}
async function resolveThread(ownerUserId:string,subject:string,candidates:string[]){
  const admin=adminClient();
  if(candidates.length){
    const{data,error}=await admin.from('owner_email_center_messages')
      .select('thread_id,internet_message_id')
      .eq('owner_user_id',ownerUserId)
      .in('internet_message_id',candidates)
      .limit(1)
      .maybeSingle();
    if(error)throw error;
    if(data?.thread_id)return String(data.thread_id);
  }
  const normalized=normalizeSubject(subject);
  if(normalized){
    const{data,error}=await admin.from('owner_email_center_threads')
      .select('id')
      .eq('owner_user_id',ownerUserId)
      .eq('normalized_subject',normalized)
      .neq('folder','trash')
      .order('last_message_at',{ascending:false})
      .limit(1)
      .maybeSingle();
    if(error)throw error;
    if(data?.id)return String(data.id);
  }
  const{data,error}=await admin.from('owner_email_center_threads').insert({
    owner_user_id:ownerUserId,
    subject:subject||'(no subject)',
    normalized_subject:normalized,
    folder:'inbox',
    unread:true,
    snippet:'',
    latest_direction:'inbound',
    message_count:0,
  }).select('id').single();
  if(error)throw error;
  return String(data.id);
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return json({error:'POST required.'},405);
  try{
    const raw=await req.text();
    const config=await providerConfig();
    const resend=new Resend(config.apiKey);
    const event:any=resend.webhooks.verify({
      payload:raw,
      headers:{
        'svix-id':req.headers.get('svix-id')||'',
        'svix-timestamp':req.headers.get('svix-timestamp')||'',
        'svix-signature':req.headers.get('svix-signature')||'',
      },
      secret:config.webhookSecret,
    });
    if(event.type!=='email.received')return json({ok:true,ignored:true});

    const providerEmailId=String(event?.data?.email_id||'').trim();
    if(!providerEmailId)throw new Error('Received email event is missing email_id.');

    const admin=adminClient();
    const duplicate=await admin.from('owner_email_center_messages').select('id').eq('provider_email_id',providerEmailId).maybeSingle();
    if(duplicate.error)throw duplicate.error;
    if(duplicate.data)return json({ok:true,duplicate:true});

    const result:any=await resend.emails.receiving.get(providerEmailId);
    if(result?.error)throw new Error(String(result.error?.message||'Received email body could not be loaded.'));
    const email:any=result?.data||result||{};
    const recipients=[...(Array.isArray(email?.to)?email.to:[email?.to]).filter(Boolean).map((v:any)=>parseMailbox(String(v)).address)];
    const owner=await findOwnerForRecipients(recipients);
    if(!owner)return json({ok:true,ignored:true,reason:'recipient_not_managed'});

    const headers=headerMap(email?.headers);
    const messageId=String(email?.message_id||headers.get('message-id')||event?.data?.message_id||'').trim()||null;
    const inReplyTo=String(headers.get('in-reply-to')||'').trim()||null;
    const refs=messageIds(headers.get('references')||'');
    const candidates=[...new Set([...(inReplyTo?messageIds(inReplyTo):[]),...refs])];
    const subject=String(email?.subject||event?.data?.subject||'(no subject)').trim()||'(no subject)';
    const threadId=await resolveThread(owner.owner_user_id,subject,candidates);
    const from=parseMailbox(String(email?.from||event?.data?.from||'unknown@invalid'));
    const cc=[...(Array.isArray(email?.cc)?email.cc:[email?.cc]).filter(Boolean).map((v:any)=>parseMailbox(String(v)).address)];
    const text=String(email?.text||'').trim()||htmlToText(String(email?.html||''));
    const boundedText=text.slice(0,100000);
    const boundedHtml=String(email?.html||'').slice(0,200000)||null;
    const attachments=(Array.isArray(email?.attachments)?email.attachments:[]).slice(0,50).map((item:any)=>({
      id:String(item?.id||item?.attachment_id||'')||null,
      filename:String(item?.filename||'attachment').slice(0,240),
      mimeType:String(item?.content_type||item?.mime_type||'application/octet-stream').slice(0,120),
      size:Number(item?.size||0)||0,
    }));
    const receivedAt=String(email?.created_at||event?.created_at||new Date().toISOString());
    const safeHeaders={
      'message-id':messageId,
      'in-reply-to':inReplyTo,
      references:refs.join(' '),
      'reply-to':String(headers.get('reply-to')||'').slice(0,1000),
      date:String(headers.get('date')||'').slice(0,200),
    };

    const inserted=await admin.from('owner_email_center_messages').insert({
      thread_id:threadId,
      owner_user_id:owner.owner_user_id,
      provider_email_id:providerEmailId,
      internet_message_id:messageId,
      in_reply_to:inReplyTo,
      reference_ids:refs,
      direction:'inbound',
      from_address:from.address,
      from_name:from.name||null,
      to_addresses:recipients,
      cc_addresses:cc,
      bcc_addresses:[],
      subject,
      text_body:boundedText,
      html_body:boundedHtml,
      headers:safeHeaders,
      attachments,
      delivery_status:'received',
      received_at:receivedAt,
    });
    if(inserted.error)throw inserted.error;

    const participants=[...new Set([from.address,...recipients,...cc].filter(Boolean))];
    const updated=await admin.from('owner_email_center_threads').update({
      subject,
      normalized_subject:normalizeSubject(subject),
      folder:'inbox',
      unread:true,
      participants,
      snippet:excerpt(boundedText),
      latest_direction:'inbound',
      has_attachment:attachments.length>0,
      last_message_at:receivedAt,
      updated_at:new Date().toISOString(),
    }).eq('id',threadId);
    if(updated.error)throw updated.error;

    const count=await admin.from('owner_email_center_messages').select('id',{count:'exact',head:true}).eq('thread_id',threadId);
    if(!count.error)await admin.from('owner_email_center_threads').update({message_count:count.count||1}).eq('id',threadId);
    await admin.from('owner_email_center_audit').insert({
      owner_user_id:owner.owner_user_id,
      thread_id:threadId,
      action:'receive',
      detail:{provider_email_id:providerEmailId,from:from.address,attachment_count:attachments.length},
    });

    return json({ok:true,stored:true});
  }catch(error:any){
    return json({error:String(error?.message||error||'Inbound email could not be processed.')},400);
  }
});
