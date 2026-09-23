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
  messageCount:number;
};

export type OwnerMailMessage={
  id:string;
  threadId:string;
  from:string;
  fromEmail:string|null;
  to:string;
  subject:string;
  date:string|null;
  messageId:string|null;
  references:string|null;
  snippet:string;
  body:string;
  unread:boolean;
  sent:boolean;
};

export type OwnerMailThread={
  id:string;
  historyId:string|null;
  subject:string;
  participants:string[];
  unread:boolean;
  inInbox:boolean;
  messages:OwnerMailMessage[];
};

type GatewayInput=Record<string,unknown>;

async function invoke<T>(body:GatewayInput):Promise<T>{
  const {data,error}=await getKleenestSupabaseClient().functions.invoke('owner-email-gateway',{body});
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

export function listOwnerMailThreads(input:{query?:string;unreadOnly?:boolean;maxResults?:number}={}){
  return invoke<{threads:OwnerMailThreadSummary[];nextPageToken:string|null}>({
    action:'list_threads',
    query:input.query?.trim()||'',
    unreadOnly:Boolean(input.unreadOnly),
    maxResults:Math.min(Math.max(input.maxResults||30,1),50),
  });
}

export function getOwnerMailThread(threadId:string){
  return invoke<{thread:OwnerMailThread}>({action:'get_thread',threadId});
}

export function replyOwnerMailThread(input:{threadId:string;body:string}){
  return invoke<{messageId:string;threadId:string}>({
    action:'reply',
    threadId:input.threadId,
    body:input.body.trim(),
  });
}

export function archiveOwnerMailThread(threadId:string){
  return invoke<{ok:true}>({action:'archive',threadId});
}

export function setOwnerMailThreadRead(threadId:string,read:boolean){
  return invoke<{ok:true}>({action:'set_read',threadId,read});
}
