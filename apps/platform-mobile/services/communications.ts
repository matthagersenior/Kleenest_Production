import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type OwnerMailConnectionStatus={
  connected:boolean;
  emailAddress:string|null;
  messagesTotal:number;
  threadsTotal:number;
  historyId:string|null;
};

export type OwnerMailThreadSummary={
  id:string;
  historyId:string|null;
  snippet:string;
  subject:string;
  from:string;
  fromEmail:string|null;
  date:string|null;
  unread:boolean;
  inInbox:boolean;
  latestSent:boolean;
  starred:boolean;
  messageCount:number;
};

export type OwnerMailAttachment={
  filename:string;
  mimeType:string;
  size:number;
  attachmentId:string|null;
};

export type OwnerMailMessage={
  id:string;
  threadId:string;
  from:string;
  fromEmail:string|null;
  to:string;
  cc:string;
  subject:string;
  date:string|null;
  messageId:string|null;
  references:string|null;
  snippet:string;
  body:string;
  unread:boolean;
  sent:boolean;
  attachments:OwnerMailAttachment[];
};

export type OwnerMailThread={
  id:string;
  historyId:string|null;
  subject:string;
  participants:string[];
  unread:boolean;
  inInbox:boolean;
  labelIds:string[];
  labelNames:string[];
  messages:OwnerMailMessage[];
};

type GatewayInput=Record<string,unknown>;

async function invoke<T>(body:GatewayInput):Promise<T>{
  const client=getKleenestSupabaseClient();
  const {data:{session},error:sessionError}=await client.auth.getSession();
  if(sessionError)throw sessionError;
  if(!session?.access_token)throw new Error('Owner sign-in is required.');
  const {data,error}=await client.functions.invoke('owner-email-gateway',{
    body,
    headers:{Authorization:`Bearer ${session.access_token}`},
  });
  if(error){
    const context=(error as any)?.context;
    if(context&&typeof context.clone==='function'){
      try{
        const payload=await context.clone().json();
        if(payload?.error)throw new Error(String(payload.error));
      }catch(cause){
        if(cause instanceof Error&&cause.message&&cause.message!==error.message)throw cause;
      }
    }
    throw error;
  }
  if(data?.error)throw new Error(String(data.error));
  return data as T;
}

export function connectOwnerMail(providerToken:string,providerRefreshToken:string){
  return invoke<OwnerMailConnectionStatus>({
    action:'connect',
    providerToken,
    providerRefreshToken,
  });
}

export function getOwnerMailStatus(){
  return invoke<OwnerMailConnectionStatus>({action:'status'});
}

export function listOwnerMailThreads(input:{
  query?:string;
  unreadOnly?:boolean;
  maxResults?:number;
  mailbox?:'inbox'|'sent'|'all';
  direction?:'any'|'incoming'|'outgoing';
}={}){
  return invoke<{threads:OwnerMailThreadSummary[];nextPageToken:string|null}>({
    action:'list_threads',
    query:input.query?.trim()||'',
    unreadOnly:Boolean(input.unreadOnly),
    maxResults:Math.min(Math.max(input.maxResults||50,1),100),
    mailbox:input.mailbox||'inbox',
    direction:input.direction||'any',
  });
}

export function getOwnerMailThread(threadId:string){
  return invoke<{thread:OwnerMailThread}>({action:'get_thread',threadId});
}

export function replyOwnerMailThread(input:{threadId:string;body:string;replyAll?:boolean}){
  return invoke<{messageId:string;threadId:string}>({
    action:'reply',
    threadId:input.threadId,
    body:input.body.trim(),
    replyAll:Boolean(input.replyAll),
  });
}

export function forwardOwnerMailThread(input:{threadId:string;to:string;body?:string}){
  return invoke<{messageId:string;threadId:string|null}>({
    action:'forward',
    threadId:input.threadId,
    to:input.to.trim(),
    body:input.body?.trim()||'',
  });
}

export function archiveOwnerMailThread(threadId:string){
  return invoke<{ok:true}>({action:'archive',threadId});
}

export function setOwnerMailThreadRead(threadId:string,read:boolean){
  return invoke<{ok:true}>({action:'set_read',threadId,read});
}


export function sendOwnerMail(input:{to:string;cc?:string;bcc?:string;subject:string;body:string}){
  return invoke<{messageId:string;threadId:string|null}>({
    action:'send',
    to:input.to.trim(),
    cc:input.cc?.trim()||'',
    bcc:input.bcc?.trim()||'',
    subject:input.subject.trim(),
    body:input.body.trim(),
  });
}

export function setOwnerMailThreadStarred(threadId:string,starred:boolean){
  return invoke<{ok:true}>({action:'star',threadId,starred});
}

export function trashOwnerMailThread(threadId:string){
  return invoke<{ok:true}>({action:'trash',threadId});
}

export function setOwnerMailThreadInbox(threadId:string,inInbox:boolean){
  return invoke<{ok:true}>({action:'set_inbox',threadId,inInbox});
}

export function setOwnerMailThreadLabel(threadId:string,labelName:string,applied:boolean){
  return invoke<{ok:true;labelId:string}>({action:'set_label',threadId,labelName:labelName.trim(),applied});
}
