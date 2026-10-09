import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type OwnerMailConnectionStatus={
  connected:boolean;
  provider:'resend';
  emailAddress:string|null;
  fallbackAddress:string|null;
  domainStatus:'pending'|'verified'|'failed'|string;
  webhookEnabled:boolean;
  fromAddress:string;
  providerConfigured:boolean;
  threads_total?:number;
  unread_total?:number;
  needs_reply_total?:number;
  waiting_total?:number;
};

export type OwnerMailbox={
  id:string;
  address:string;
  display_name:string;
  mailbox_type:'personal'|'shared'|'system'|string;
  send_enabled:boolean;
  signature_text?:string;
  forwarding_enabled?:boolean;
  auto_reply_enabled?:boolean;
  can_modify?:boolean;
  can_manage?:boolean;
  active:boolean;
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
  folder?:'inbox'|'archive'|'sent'|'drafts'|'spam'|'trash'|string;
  latestSent:boolean;
  latestDeliveryStatus?:string|null;
  sourceApp?:string|null;
  supportRequestId?:string|null;
  starred:boolean;
  messageCount:number;
  hasAttachment?:boolean;
  labelNames?:string[];
  mailboxId?:string|null;
  mailboxAddress?:string|null;
  mailboxDisplayName?:string|null;
};

export type OwnerMailAttachment={
  filename:string;
  mimeType:string;
  size:number;
  id?:string|null;
};

export type OwnerMailMessage={
  id:string;
  threadId:string;
  from:string;
  fromEmail:string|null;
  to:string;
  cc:string;
  bcc?:string;
  subject:string;
  date:string|null;
  messageId:string|null;
  references:string|null;
  snippet:string;
  body:string;
  unread:boolean;
  sent:boolean;
  deliveryStatus?:string|null;
  attachments:OwnerMailAttachment[];
};

export type OwnerMailThread={
  id:string;
  mailboxId?:string|null;
  historyId:string|null;
  subject:string;
  participants:string[];
  unread:boolean;
  inInbox:boolean;
  folder?:'inbox'|'archive'|'sent'|'drafts'|'spam'|'trash'|string;
  starred?:boolean;
  labelIds:string[];
  labelNames:string[];
  mailboxAddress?:string|null;
  mailboxDisplayName?:string|null;
  sourceApp?:string|null;
  supportRequestId?:string|null;
  messages:OwnerMailMessage[];
};

export type MailUploadAttachment={filename:string;content:string;contentType:string;size:number};
type GatewayInput=Record<string,unknown>;

async function invokeFunction<T>(functionName:string,body:GatewayInput):Promise<T>{
  const client=getKleenestSupabaseClient();
  const {data:{session},error:sessionError}=await client.auth.getSession();
  if(sessionError)throw sessionError;
  if(!session?.access_token)throw new Error('Owner sign-in is required.');
  const {data,error}=await client.functions.invoke(functionName,{
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

function invoke<T>(body:GatewayInput):Promise<T>{
  return invokeFunction<T>('owner-email-center',body);
}

export function listOwnerMailboxes(){
  return invokeFunction<{mailboxes:OwnerMailbox[];isAdmin:boolean}>('owner-email-directory',{action:'list_mailboxes'});
}

export function getOwnerMailStatus(){
  return invoke<OwnerMailConnectionStatus>({action:'status'});
}

export function listOwnerMailThreads(input:{
  query?:string;
  unreadOnly?:boolean;
  maxResults?:number;
  mailbox?:'inbox'|'sent'|'drafts'|'spam'|'trash'|'all';
  direction?:'any'|'incoming'|'outgoing';
  mailboxId?:string;
}={}){
  return invoke<{threads:OwnerMailThreadSummary[];nextPageToken:string|null}>({
    action:'list_threads',
    query:input.query?.trim()||'',
    unreadOnly:Boolean(input.unreadOnly),
    maxResults:Math.min(Math.max(input.maxResults||50,1),100),
    mailbox:input.mailbox||'inbox',
    direction:input.direction||'any',
    mailboxId:input.mailboxId||'',
  });
}

export function getOwnerMailThread(threadId:string){
  return invoke<{thread:OwnerMailThread}>({action:'get_thread',threadId});
}

export function getOwnerMailAttachment(input:{threadId:string;messageId:string;attachmentId:string}){
  return invoke<{downloadUrl:string;filename:string;expiresAt:string|null}>({action:'get_attachment',...input});
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

export function saveOwnerMailDraft(input:{draftId?:string|null;mailboxId?:string|null;to?:string;cc?:string;bcc?:string;subject?:string;body?:string}){
  return invoke<{ok:true;threadId:string;messageId:string}>({
    action:'save_draft',
    draftId:input.draftId||'',
    mailboxId:input.mailboxId||'',
    to:input.to?.trim()||'',
    cc:input.cc?.trim()||'',
    bcc:input.bcc?.trim()||'',
    subject:input.subject?.trim()||'',
    body:input.body?.trim()||'',
  });
}

export function sendOwnerMail(input:{mailboxId?:string|null;to:string;cc?:string;bcc?:string;subject:string;body:string;attachments?:MailUploadAttachment[]}){
  return invoke<{messageId:string;threadId:string|null}>({
    action:'send',
    mailboxId:input.mailboxId||'',
    to:input.to.trim(),
    cc:input.cc?.trim()||'',
    bcc:input.bcc?.trim()||'',
    subject:input.subject.trim(),
    body:input.body.trim(),
    attachments:input.attachments||[],
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


export function spamOwnerMailThread(threadId:string){
  return invoke<{ok:true}>({action:'spam',threadId});
}

export function blockOwnerMailThreadSender(threadId:string){
  return invoke<{ok:true;sender:string}>({action:'block_sender',threadId});
}


export type MailboxMember={mailbox_id:string;user_id:string;email:string;access_role:'owner'|'manager'|'responder'|'viewer';can_send:boolean};
export type MailboxAlias={alias_address:string;mailbox_id:string;active:boolean};
export type ManagedMailbox=OwnerMailbox&{
  owner_user_id:string|null;forwarding_enabled:boolean;forwarding_targets:string[];
  keep_copy:boolean;signature_text:string;auto_reply_enabled:boolean;
  auto_reply_subject:string;auto_reply_body:string;members:MailboxMember[];aliases:MailboxAlias[];
};
export function manageMailDirectory<T=Record<string,unknown>>(action:string,payload:Record<string,unknown>={}){
  return invokeFunction<T>('owner-email-directory',{action,...payload});
}
export function listManagedMailboxes(){
  return manageMailDirectory<{mailboxes:ManagedMailbox[]}>('admin_overview');
}
