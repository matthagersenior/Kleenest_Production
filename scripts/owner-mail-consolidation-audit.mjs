import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(p,'utf8');
const canonicalConfig=read('apps/platform-mobile/app.config.ts');
const family=read('.github/workflows/android-family.yml');
const native=read('apps/platform-mobile/app/communications.tsx');
const nativeApi=read('apps/platform-mobile/services/communications.ts');
const nativeAdmin=read('apps/platform-mobile/app/mail-admin.tsx');
const mail=read('apps/mail-client/src/main.jsx');
const mailAdmin=read('apps/mail-client/src/MailboxAdmin.jsx');
const directory=read('supabase/functions/owner-email-directory/index.ts');
const center=read('supabase/functions/owner-email-center/index.ts');

function hasAll(label,source,tokens){
  for(const token of tokens)assert.ok(source.includes(token),label+' missing '+token);
}
hasAll('Canonical Owner Android identity',canonicalConfig,["package:'com.kleenest.platform'","slug:'kleenest-owner'","name:'KleenestOS'"]);
hasAll('Family APK pipeline',family,['apps/platform-mobile',"package_id: com.kleenest.platform","Kleenest-Owner-Standalone-APK"]);
hasAll('Native mail source',native,[
  'Manage mailboxes & access','selectedCanModify','selectedCanSend','downloadAttachment',
  'Attach files','attachNativePhotos','signature_text','Forward','Reply all','Save draft',
  'Kleenest Email Center','usePlatformTheme','getOwnerAuthorization'
]);
hasAll('Native mail service',nativeApi,["action:'get_attachment'","attachments:input.attachments||[]","action:'list_mailboxes'","action:'admin_overview'","action:'send'","action:'reply'","action:'forward'"]);
hasAll('Native mailbox CRUD',nativeAdmin,["run('create_mailbox'","run('update_mailbox'","run('add_alias'","run('remove_alias'","run('assign_member'","run('remove_member'","autoReplyEnabled","signatureText","forwardingEnabled","getOwnerAuthorization"]);
hasAll('Installable Mail PWA',mail,['MailboxAdmin','isPlatformOwner','canModify','canSend','downloadAttachment','get_attachment','signInWithPassword','resetPasswordForEmail','signature_text','MailNotifications']);
hasAll('Mail PWA Owner management',mailAdmin,['admin_overview','create_mailbox','update_mailbox','add_alias','remove_alias','assign_member','remove_member','autoReplyEnabled','signatureText','forwardingEnabled','searchUsers']);
hasAll('Shared authenticated mail directory',directory,['admin_overview','create_mailbox','update_mailbox','assign_member','remove_member','can_modify','platformOwner']);
hasAll('Shared authenticated email actions',center,['get_attachment','withMailboxSignature','requireMailboxAccess','send','reply','forward']);
assert.ok(!mail.includes('SERVICE_ROLE_KEY')&&!mail.includes('sb_secret_'),'Browser must not embed admin keys');
assert.ok(!native.includes('signInWithOAuth'),'Native mail should not require Gmail OAuth');
assert.ok(!mail.includes('getUserById('),'Browser may not administer auth users directly');
console.log('Owner Android/mail PWA capabilities and one-package contract passed.');
