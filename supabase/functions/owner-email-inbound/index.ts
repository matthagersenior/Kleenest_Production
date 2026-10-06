import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@6.9.2";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')??'';
function namedKey(plural:string,legacy:string){
  try{const parsed=JSON.parse(Deno.env.get(plural)??'{}');if(parsed?.default)return String(parsed.default)}catch{}
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
async function primaryOwner(){
  const admin=adminClient();
  const result=await admin.from('owner_email_center_settings').select('*').order('created_at',{ascending:true}).limit(1).maybeSingle();
  if(result.error)throw result.error;
  if(!result.data)throw new Error('Owner Email Center settings are missing.');
  return result.data;
}
async function resolveRecipientMailbox(recipients:string[]){
  const admin=adminClient();
  const normalized=[...new Set(recipients.map(v=>v.toLowerCase()).filter(v=>v.endsWith('@kleenest.us')))];
  if(!normalized.length)return null;
  const direct=await admin.from('owner_email_mailboxes').select('*').in('address',normalized).eq('active',true).limit(1).maybeSingle();
  if(direct.error)throw direct.error;
  if(direct.data)return{mailbox:direct.data,recipientAddress:String(direct.data.address)};
  const alias=await admin.from('owner_email_mailbox_aliases').select('alias_address,mailbox_id').in('alias_address',normalized).eq('active',true).limit(1).maybeSingle();
  if(alias.error)throw alias.error;
  if(!alias.data)return null;
  const mailbox=await admin.from('owner_email_mailboxes').select('*').eq('id',alias.data.mailbox_id).eq('active',true).maybeSingle();
  if(mailbox.error)throw mailbox.error;
  return mailbox.data?{mailbox:mailbox.data,recipientAddress:String(alias.data.alias_address)}:null;
}
async function resolveThread(ownerUserId:string,mailboxId:string,subject:string,candidates:string[]){
  const admin=adminClient();
  if(candidates.length){
    const{data,error}=await admin.from('owner_email_center_messages')
      .select('thread_id,internet_message_id')
      .eq('mailbox_id',mailboxId)
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
      .eq('mailbox_id',mailboxId)
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
    mailbox_id:mailboxId,
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
async function forwardReceived(resend:Resend,mailbox:any,from:{name:string;address:string},recipientAddress:string,subject:string,text:string,html:string|null){
  if(!mailbox.forwarding_enabled)return[];
  const targets=(Array.isArray(mailbox.forwarding_targets)?mailbox.forwarding_targets:[])
    .map((v:any)=>String(v).trim().toLowerCase())
    .filter((v:string)=>v&&v!==from.address&&v!==recipientAddress);
  const ids:string[]=[];
  for(const target of targets){
    const forwardedText=[
      `Forwarded by Kleenest Mail for ${recipientAddress}`,
      `From: ${from.name?from.name+' <'+from.address+'>':from.address}`,
      `To: ${recipientAddress}`,
      `Subject: ${subject}`,
      '',
      text||'(no text body)',
    ].join('\n');
    const result:any=await resend.emails.send({
      from:`${mailbox.display_name||'Kleenest'} <${mailbox.address}>`,
      to:[target],
      replyTo:from.address,
      subject:subject,
      text:forwardedText,
      ...(html?{html:`<p><strong>Forwarded by Kleenest Mail for ${recipientAddress}</strong></p><p>From: ${from.name?from.name+' &lt;'+from.address+'&gt;':from.address}</p><hr/>${html}`}:{}),
      headers:{'X-Kleenest-Forwarded':'1','X-Kleenest-Mailbox':String(mailbox.address)},
    });
    if(result?.error)throw new Error(String(result.error?.message||'Forwarding failed.'));
    if(result?.data?.id)ids.push(String(result.data.id));
  }
  return ids;
}
async function sendAutoReply(resend:Resend,mailbox:any,from:{address:string},headers:Map<string,string>,subject:string){
  if(!mailbox.auto_reply_enabled||!mailbox.auto_reply_body)return null;
  if(from.address.endsWith('@kleenest.us'))return null;
  const autoSubmitted=String(headers.get('auto-submitted')||'').toLowerCase();
  if(autoSubmitted&&autoSubmitted!=='no')return null;
  const result:any=await resend.emails.send({
    from:`${mailbox.display_name||'Kleenest'} <${mailbox.address}>`,
    to:[from.address],
    subject:String(mailbox.auto_reply_subject||'').trim()||(/^re:/i.test(subject)?subject:`Re: ${subject}`),
    text:String(mailbox.auto_reply_body),
    headers:{'Auto-Submitted':'auto-replied','X-Kleenest-Auto-Reply':'1'},
  });
  if(result?.error)throw new Error(String(result.error?.message||'Auto-reply failed.'));
  return result?.data?.id||null;
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
    const outboundDeliveryEvents=new Set([
      'email.sent','email.delivered','email.delivery_delayed','email.bounced',
      'email.complained','email.failed','email.suppressed',
    ]);
    if(outboundDeliveryEvents.has(String(event.type||''))){
      const providerEmailId=String(event?.data?.email_id||'').trim();
      if(!providerEmailId)return json({ok:true,ignored:true,reason:'missing_email_id'});
      const deliveryStatus=String(event.type).replace(/^email\./,'');
      const admin=adminClient();
      const updated=await admin.from('owner_email_center_messages')
        .update({delivery_status:deliveryStatus})
        .eq('provider_email_id',providerEmailId)
        .eq('direction','outbound')
        .select('thread_id,owner_user_id')
        .maybeSingle();
      if(updated.error)throw updated.error;
      if(updated.data){
        await admin.from('owner_email_center_audit').insert({
          owner_user_id:updated.data.owner_user_id,
          thread_id:updated.data.thread_id,
          action:'delivery_'+deliveryStatus,
          detail:{provider_email_id:providerEmailId,event_type:event.type},
        });
      }
      return json({ok:true,delivery_status:deliveryStatus,matched:Boolean(updated.data)});
    }
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
    const route=await resolveRecipientMailbox(recipients);
    if(!route)return json({ok:true,ignored:true,reason:'recipient_not_managed'});

    const owner=await primaryOwner();
    const mailbox=route.mailbox;
    const headers=headerMap(email?.headers);
    const wasForwardedByKleenest=String(headers.get('x-kleenest-forwarded')||'')==='1';
    const messageId=String(email?.message_id||headers.get('message-id')||event?.data?.message_id||'').trim()||null;
    const inReplyTo=String(headers.get('in-reply-to')||'').trim()||null;
    const refs=messageIds(headers.get('references')||'');
    const candidates=[...new Set([...(inReplyTo?messageIds(inReplyTo):[]),...refs])];
    const subject=String(email?.subject||event?.data?.subject||'(no subject)').trim()||'(no subject)';
    const threadId=await resolveThread(owner.owner_user_id,String(mailbox.id),subject,candidates);
    const from=parseMailbox(String(email?.from||event?.data?.from||'unknown@invalid'));
    const blockedSenders=new Set((Array.isArray(owner.blocked_senders)?owner.blocked_senders:[]).map((v:string)=>String(v).toLowerCase()));
    const isBlocked=blockedSenders.has(from.address);
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
      recipient:route.recipientAddress,
    };

    const inserted=await admin.from('owner_email_center_messages').insert({
      thread_id:threadId,
      owner_user_id:owner.owner_user_id,
      mailbox_id:mailbox.id,
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

    let folder=isBlocked?'spam':'inbox';
    if(!isBlocked&&mailbox.forwarding_enabled&&mailbox.keep_copy===false)folder='archive';
    const participants=[...new Set([from.address,...recipients,...cc].filter(Boolean))];
    const updated=await admin.from('owner_email_center_threads').update({
      mailbox_id:mailbox.id,
      recipient_address:route.recipientAddress,
      subject,
      normalized_subject:normalizeSubject(subject),
      folder,
      unread:folder==='inbox',
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

    const forwardedIds=(isBlocked||wasForwardedByKleenest)?[]:await forwardReceived(resend,mailbox,from,route.recipientAddress,subject,boundedText,boundedHtml);
    const autoReplyId=(isBlocked||wasForwardedByKleenest)?null:await sendAutoReply(resend,mailbox,from,headers,subject);

    await admin.from('owner_email_center_audit').insert({
      owner_user_id:owner.owner_user_id,
      thread_id:threadId,
      action:isBlocked?'receive_spam':'receive',
      detail:{
        provider_email_id:providerEmailId,from:from.address,attachment_count:attachments.length,blocked:isBlocked,
        mailbox_id:mailbox.id,mailbox_address:mailbox.address,recipient_address:route.recipientAddress,
        forwarded_to:mailbox.forwarding_enabled?mailbox.forwarding_targets:[],forwarded_ids:forwardedIds,auto_reply_id:autoReplyId,
      },
    });

    return json({ok:true,stored:true,mailbox:mailbox.address,forwarded:forwardedIds.length});
  }catch(error:any){
    return json({error:String(error?.message||error||'Inbound email could not be processed.')},400);
  }
});