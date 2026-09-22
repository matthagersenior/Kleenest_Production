import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')??'';
const SUPABASE_ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY')??'';
const GMAIL='https://gmail.googleapis.com/gmail/v1/users/me';

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

function requiredText(value:unknown,name:string,max=20000){
  const text=String(value??'').trim();
  if(!text)throw new Error(`${name} is required.`);
  if(text.length>max)throw new Error(`${name} is too long.`);
  return text;
}

function optionalText(value:unknown,max=500){
  const text=String(value??'').trim();
  return text?text.slice(0,max):'';
}

function decodeBase64Url(value:string){
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  try{
    const bytes=Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }catch{return '';}
}

function encodeBase64Url(value:string){
  const bytes=new TextEncoder().encode(value);
  let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function headersOf(message:any){
  const rows=Array.isArray(message?.payload?.headers)?message.payload.headers:[];
  const map=new Map<string,string>();
  for(const row of rows){
    const name=String(row?.name??'').toLowerCase();
    if(name&&!map.has(name))map.set(name,String(row?.value??''));
  }
  return map;
}

function emailFromHeader(value:string){
  const bracket=value.match(/<([^>]+)>/);
  if(bracket?.[1])return bracket[1].trim();
  const plain=value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return plain?.[0]??null;
}

function bodyText(part:any):string{
  if(!part)return '';
  const mime=String(part.mimeType??'');
  const own=String(part?.body?.data??'');
  if(mime.startsWith('text/plain')&&own)return decodeBase64Url(own).trim();
  const parts=Array.isArray(part.parts)?part.parts:[];
  for(const child of parts){
    const value=bodyText(child);
    if(value)return value;
  }
  if(mime.startsWith('text/html')&&own){
    return decodeBase64Url(own)
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
  return '';
}

async function gmail(providerToken:string,path:string,init:RequestInit={}){
  const response=await fetch(`${GMAIL}${path}`,{
    ...init,
    headers:{
      'authorization':`Bearer ${providerToken}`,
      'content-type':'application/json',
      ...(init.headers||{}),
    },
  });
  const text=await response.text();
  const data=text?JSON.parse(text):{};
  if(!response.ok){
    const message=data?.error?.message||`Gmail request failed with ${response.status}.`;
    const error=new Error(message);
    (error as any).status=response.status;
    throw error;
  }
  return data;
}

function summarizeThread(thread:any){
  const messages=Array.isArray(thread?.messages)?thread.messages:[];
  const latest=messages[messages.length-1]??{};
  const h=headersOf(latest);
  const labels=new Set<string>(Array.isArray(latest.labelIds)?latest.labelIds:[]);
  const from=h.get('from')||'Unknown sender';
  return{
    id:String(thread?.id??''),
    historyId:thread?.historyId?String(thread.historyId):null,
    snippet:String(latest?.snippet??thread?.snippet??''),
    subject:h.get('subject')||'(no subject)',
    from,
    fromEmail:emailFromHeader(from),
    date:h.get('date')||null,
    unread:messages.some((message:any)=>Array.isArray(message?.labelIds)&&message.labelIds.includes('UNREAD')),
    inInbox:messages.some((message:any)=>Array.isArray(message?.labelIds)&&message.labelIds.includes('INBOX')),
    messageCount:messages.length,
  };
}

function normalizeThread(thread:any){
  const messages=Array.isArray(thread?.messages)?thread.messages:[];
  const normalized=messages.map((message:any)=>{
    const h=headersOf(message);
    const labels=new Set<string>(Array.isArray(message?.labelIds)?message.labelIds:[]);
    const from=h.get('from')||'Unknown sender';
    return{
      id:String(message?.id??''),
      threadId:String(message?.threadId??thread?.id??''),
      from,
      fromEmail:emailFromHeader(from),
      to:h.get('to')||'',
      subject:h.get('subject')||'(no subject)',
      date:h.get('date')||null,
      messageId:h.get('message-id')||null,
      references:h.get('references')||null,
      snippet:String(message?.snippet??''),
      body:bodyText(message?.payload)||String(message?.snippet??''),
      unread:labels.has('UNREAD'),
      sent:labels.has('SENT'),
    };
  });
  const participants=[...new Set(normalized.flatMap((message:any)=>[message.from,message.to]).filter(Boolean))];
  return{
    id:String(thread?.id??''),
    historyId:thread?.historyId?String(thread.historyId):null,
    subject:normalized[normalized.length-1]?.subject||'(no subject)',
    participants,
    unread:normalized.some((message:any)=>message.unread),
    inInbox:messages.some((message:any)=>Array.isArray(message?.labelIds)&&message.labelIds.includes('INBOX')),
    messages:normalized,
  };
}

async function authorize(req:Request){
  const authorization=req.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer '))throw Object.assign(new Error('Owner sign-in is required.'),{status:401});
  const client=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{authorization}},
  });
  const {data,error}=await client.rpc('admin_authorization_v1');
  if(error)throw Object.assign(new Error(error.message),{status:403});
  const result=(data&&typeof data==='object'?data:{}) as Record<string,unknown>;
  if(!result.authorized&&!result.is_admin&&!result.is_platform_owner){
    throw Object.assign(new Error('Owner/admin authority is required for email access.'),{status:403});
  }
  return result;
}

async function loadThread(providerToken:string,threadId:string,format:'full'|'metadata'='full'){
  return gmail(providerToken,`/threads/${encodeURIComponent(threadId)}?format=${format}`);
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return json({ok:true});
  if(req.method!=='POST')return json({error:'POST required.'},405);
  try{
    const authorization=await authorize(req);
    const body=await req.json().catch(()=>({}));
    const action=requiredText(body?.action,'action',40);
    const providerToken=requiredText(body?.providerToken,'providerToken',5000);

    if(action==='status'){
      const profile=await gmail(providerToken,'/profile');
      return json({
        connected:true,
        emailAddress:profile.emailAddress??null,
        messagesTotal:Number(profile.messagesTotal??0),
        threadsTotal:Number(profile.threadsTotal??0),
        historyId:profile.historyId?String(profile.historyId):null,
        authorization,
      });
    }

    if(action==='list_threads'){
      const maxResults=Math.min(Math.max(Number(body?.maxResults)||30,1),50);
      const query=optionalText(body?.query,500);
      const unreadOnly=Boolean(body?.unreadOnly);
      const q=[query,unreadOnly?'is:unread':''].filter(Boolean).join(' ');
      const params=new URLSearchParams({maxResults:String(maxResults),labelIds:'INBOX'});
      if(q)params.set('q',q);
      const page=await gmail(providerToken,`/threads?${params.toString()}`);
      const refs=Array.isArray(page?.threads)?page.threads:[];
      const threads=await Promise.all(refs.map((row:any)=>loadThread(providerToken,String(row.id),'metadata').then(summarizeThread)));
      threads.sort((a:any,b:any)=>new Date(b.date||0).getTime()-new Date(a.date||0).getTime());
      return json({threads,nextPageToken:page?.nextPageToken??null});
    }

    if(action==='get_thread'){
      const threadId=requiredText(body?.threadId,'threadId',200);
      const thread=normalizeThread(await loadThread(providerToken,threadId,'full'));
      return json({thread});
    }

    if(action==='reply'){
      const threadId=requiredText(body?.threadId,'threadId',200);
      const replyBody=requiredText(body?.body,'body',20000);
      const thread=normalizeThread(await loadThread(providerToken,threadId,'full'));
      const last=thread.messages[thread.messages.length-1];
      if(!last)throw new Error('The Gmail thread has no messages.');
      const target=[...thread.messages].reverse().find((message:any)=>!message.sent&&message.fromEmail)?.fromEmail||last.fromEmail;
      if(!target)throw new Error('A reply address could not be determined.');
      const subject=/^re:/i.test(thread.subject)?thread.subject:`Re: ${thread.subject}`;
      const referenceParts=[
        ...thread.messages.map((message:any)=>message.messageId).filter(Boolean),
      ];
      const references=[last.references,...referenceParts].filter(Boolean).join(' ').trim();
      const raw=[
        `To: ${target}`,
        `Subject: ${subject}`,
        last.messageId?`In-Reply-To: ${last.messageId}`:'',
        references?`References: ${references}`:'',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 8bit',
        '',
        replyBody,
      ].filter((line,index)=>index>=7||line!=='').join('\r\n');
      const sent=await gmail(providerToken,'/messages/send',{
        method:'POST',
        body:JSON.stringify({raw:encodeBase64Url(raw),threadId}),
      });
      return json({messageId:String(sent?.id??''),threadId:String(sent?.threadId??threadId)});
    }

    if(action==='archive'){
      const threadId=requiredText(body?.threadId,'threadId',200);
      await gmail(providerToken,`/threads/${encodeURIComponent(threadId)}/modify`,{
        method:'POST',
        body:JSON.stringify({removeLabelIds:['INBOX']}),
      });
      return json({ok:true});
    }

    if(action==='set_read'){
      const threadId=requiredText(body?.threadId,'threadId',200);
      const read=Boolean(body?.read);
      await gmail(providerToken,`/threads/${encodeURIComponent(threadId)}/modify`,{
        method:'POST',
        body:JSON.stringify(read?{removeLabelIds:['UNREAD']}:{addLabelIds:['UNREAD']}),
      });
      return json({ok:true});
    }

    return json({error:'Unsupported action.'},400);
  }catch(error:any){
    const status=Number(error?.status)||500;
    const message=error instanceof Error?error.message:'Owner email gateway failed.';
    return json({error:message},status);
  }
});
