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
  if(error)throw error;
  if(data?.error)throw new Error(String(data.error));
  return data as T;
}

export function getOwnerMailStatus(providerToken:string){
  return invoke<OwnerMailConnectionStatus>({action:'status',providerToken});
}

export function listOwnerMailThreads(providerToken:string,input:{query?:string;unreadOnly?:boolean;maxResults?:number}={}){
  return invoke<{threads:OwnerMailThreadSummary[];nextPageToken:string|null}>({
    action:'list_threads',
    providerToken,
    query:input.query?.trim()||'',
    unreadOnly:Boolean(input.unreadOnly),
    maxResults:Math.min(Math.max(input.maxResults||30,1),50),
  });
}

export function getOwnerMailThread(providerToken:string,threadId:string){
  return invoke<{thread:OwnerMailThread}>({action:'get_thread',providerToken,threadId});
}

export function replyOwnerMailThread(providerToken:string,input:{threadId:string;body:string}){
  return invoke<{messageId:string;threadId:string}>({
    action:'reply',
    providerToken,
    threadId:input.threadId,
    body:input.body.trim(),
  });
}

export function archiveOwnerMailThread(providerToken:string,threadId:string){
  return invoke<{ok:true}>({action:'archive',providerToken,threadId});
}

export function setOwnerMailThreadRead(providerToken:string,threadId:string,read:boolean){
  return invoke<{ok:true}>({action:'set_read',providerToken,threadId,read});
}
