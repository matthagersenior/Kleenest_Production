import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type OwnerMailConnectionStatus={
  connected:boolean;
  provider:'resend';
  emailAddress:string|null;
  fallbackAddress:string|null;
  domainStatus:'pending'|'verified'|'failed'|'partially_verified'|string;
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
  owner_user_id?:string|null;
  send_enabled:boolean;
  forwarding_enabled:boolean;
  forwarding_targets:string[];
  keep_copy:boolean;
  signature_text:string;
  auto_reply_enabled:boolean;
  auto_reply_subject:string;
  auto_reply_body:string;
  active:boolean;
  created_at?:string;
  updated_at?:string;
};

export type OwnerMailboxAlias={
  alias_address:string;
  mailbox_id:string;
  active:boolean;
};

export type OwnerMailboxMember={
  mailbox_id:string;
  user_id:string;
  access_role:'owner'|'manager'|'responder'|'viewer'|string;
  can_send:boolean;
};

export type OwnerMailboxProfile={
  id:string;
  display_name?:string|null;
  username?:string|null;
  is_admin?:boolean;
  is_platform_owner?:boolean;
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
  latestDeliveryStatus?:string|null;
  starred:boolean;
  messageCount:number;
  hasAttachment?:boolean;
  labelNames?:string[];
  folder?:'inbox'|'archive'|'sent'|'drafts'|'spam'|'trash'|string;
  priority?:string;
  supportRequestId?:string|null;
  sourceApp?:string|null;
  mailboxId?:string|null;
  mailboxAddress?:string|null;
  mailboxDisplayName?:string|null;
};

export type OwnerMailAttachment={filename:string;mimeType:string;size:number;id?:string|null};

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
  historyId:string|null;
  subject:string;
  participants:string[];
  unread:boolean;
  inInbox:boolean;
  folder?:'inbox'|'archive'|'sent'|'drafts'|'spam'|'trash'|string;
  starred?:boolean;
  priority?:string;
  supportRequestId?:string|null;
  sourceApp?:string|null;
  mailboxId?:string|null;
  mailboxAddress?:string|null;
  mailboxDisplayName?:string|null;
  labelIds:string[];
  labelNames:string[];
  messages:OwnerMailMessage[];
};

type GatewayInput=Record<string,unknown>;

async function invokeFunction<T>(name:string,body:GatewayInput):Promise<T>{
  const client=getKleenestSupabaseClient();
  const {data:{session},error:sessionError}=await client.auth.getSession();
  if(sessionError)throw sessionError;
  if(!session?.access_token)throw new Error('Owner sign-in is required.');
  const {data,error}=await client.functions.invoke(name,{
    body,
    headers:{Authorization:'Bearer '+session.access_token},
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

const invoke=<T>(body:GatewayInput)=>invokeFunction<T>('owner-email-center',body);
const invokeDirectory=<T>(body:GatewayInput)=>invokeFunction<T>('owner-email-directory',body);

export function getOwnerMailStatus(){return invoke<OwnerMailConnectionStatus>({action:'status'})}

export function listOwnerMailThreads(input:{
  query?:string;
  unreadOnly?:boolean;
  maxResults?:number;
  mailbox?:'inbox'|'sent'|'drafts'|'spam'|'trash'|'all';
  mailboxId?:string|null;
  direction?:'any'|'incoming'|'outgoing';
}={}){
  return invoke<{threads:OwnerMailThreadSummary[];nextPageToken:string|null}>({
    action:'list_threads',
    query:input.query?.trim()||'',
    unreadOnly:Boolean(input.unreadOnly),
    maxResults:Math.min(Math.max(input.maxResults||50,1),100),
    mailbox:input.mailbox||'inbox',
    mailboxId:input.mailboxId||'',
    direction:input.direction||'any',
  });
}

export function getOwnerMailThread(threadId:string){return invoke<{thread:OwnerMailThread}>({action:'get_thread',threadId})}

export function replyOwnerMailThread(input:{threadId:string;body:string;replyAll?:boolean}){
  return invoke<{messageId:string;threadId:string}>({action:'reply',threadId:input.threadId,body:input.body.trim(),replyAll:Boolean(input.replyAll)});
}

export function forwardOwnerMailThread(input:{threadId:string;to:string;body?:string}){
  return invoke<{messageId:string;threadId:string|null}>({action:'forward',threadId:input.threadId,to:input.to.trim(),body:input.body?.trim()||''});
}

export function archiveOwnerMailThread(threadId:string){return invoke<{ok:true}>({action:'archive',threadId})}
export function setOwnerMailThreadRead(threadId:string,read:boolean){return invoke<{ok:true}>({action:'set_read',threadId,read})}

export function sendOwnerMail(input:{mailboxId?:string|null;to:string;cc?:string;bcc?:string;subject:string;body:string}){
  return invoke<{messageId:string;threadId:string|null}>({
    action:'send',mailboxId:input.mailboxId||'',to:input.to.trim(),cc:input.cc?.trim()||'',bcc:input.bcc?.trim()||'',
    subject:input.subject.trim(),body:input.body.trim(),
  });
}

export function saveOwnerMailDraft(input:{mailboxId?:string|null;draftId?:string|null;to?:string;cc?:string;bcc?:string;subject?:string;body?:string}){
  return invoke<{ok:true;threadId:string;messageId:string}>({
    action:'save_draft',mailboxId:input.mailboxId||'',draftId:input.draftId||'',to:input.to?.trim()||'',cc:input.cc?.trim()||'',
    bcc:input.bcc?.trim()||'',subject:input.subject?.trim()||'',body:input.body?.trim()||'',
  });
}

export function markOwnerMailThreadSpam(threadId:string){return invoke<{ok:true}>({action:'spam',threadId})}
export function blockOwnerMailSender(threadId:string){return invoke<{ok:true;sender:string}>({action:'block_sender',threadId})}
export function setOwnerMailThreadStarred(threadId:string,starred:boolean){return invoke<{ok:true}>({action:'star',threadId,starred})}
export function trashOwnerMailThread(threadId:string){return invoke<{ok:true}>({action:'trash',threadId})}
export function setOwnerMailThreadInbox(threadId:string,inInbox:boolean){return invoke<{ok:true}>({action:'set_inbox',threadId,inInbox})}
export function setOwnerMailThreadLabel(threadId:string,labelName:string,applied:boolean){
  return invoke<{ok:true;labelId:string}>({action:'set_label',threadId,labelName:labelName.trim(),applied});
}

export function listOwnerMailboxes(){
  return invokeDirectory<{mailboxes:OwnerMailbox[];isAdmin:boolean}>({action:'list_mailboxes'});
}

export function getOwnerMailDirectory(){
  return invokeDirectory<{mailboxes:OwnerMailbox[];aliases:OwnerMailboxAlias[];members:OwnerMailboxMember[];profiles:OwnerMailboxProfile[]}>({action:'directory'});
}

export function saveOwnerMailbox(input:{
  address:string;displayName:string;mailboxType:'personal'|'shared'|'system';ownerUserId?:string|null;sendEnabled?:boolean;
  signatureText?:string;autoReplyEnabled?:boolean;autoReplySubject?:string;autoReplyBody?:string;active?:boolean;
}){
  return invokeDirectory<{ok:true;mailbox:OwnerMailbox}>({
    action:'save_mailbox',address:input.address,displayName:input.displayName,mailboxType:input.mailboxType,
    ownerUserId:input.ownerUserId||'',sendEnabled:input.sendEnabled!==false,signatureText:input.signatureText||'',
    autoReplyEnabled:Boolean(input.autoReplyEnabled),autoReplySubject:input.autoReplySubject||'',autoReplyBody:input.autoReplyBody||'',active:input.active!==false,
  });
}

export function setOwnerMailboxForwarding(input:{mailboxId:string;enabled:boolean;targets:string;keepCopy?:boolean}){
  return invokeDirectory<{ok:true;mailbox:OwnerMailbox}>({
    action:'set_forwarding',mailboxId:input.mailboxId,enabled:input.enabled,targets:input.targets,keepCopy:input.keepCopy!==false,
  });
}

export function saveOwnerMailboxAlias(mailboxId:string,aliasAddress:string){
  return invokeDirectory<{ok:true;alias:OwnerMailboxAlias}>({action:'save_alias',mailboxId,aliasAddress});
}

export function removeOwnerMailboxAlias(aliasAddress:string){
  return invokeDirectory<{ok:true}>({action:'remove_alias',aliasAddress});
}

export function grantOwnerMailboxAccess(input:{mailboxId:string;memberEmail:string;accessRole:'owner'|'manager'|'responder'|'viewer';canSend:boolean}){
  return invokeDirectory<{ok:true;member:OwnerMailboxMember}>({
    action:'grant_access',mailboxId:input.mailboxId,memberEmail:input.memberEmail,accessRole:input.accessRole,canSend:input.canSend,
  });
}

export function revokeOwnerMailboxAccess(mailboxId:string,userId:string){
  return invokeDirectory<{ok:true}>({action:'revoke_access',mailboxId,userId});
}

export function setOwnerMailboxActive(mailboxId:string,active:boolean){
  return invokeDirectory<{ok:true}>({action:'set_active',mailboxId,active});
}
