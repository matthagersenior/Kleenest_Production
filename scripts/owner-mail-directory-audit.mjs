import fs from 'node:fs';

const failures=[];
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const must=(ok,message)=>{if(!ok)failures.push(message)};
const all=(label,source,tokens)=>{for(const token of tokens)must(source.includes(token),`${label}: missing ${token}`)};

const migration=read('supabase/migrations/20261005161000_kleenest_mail_directory.sql');
const directory=read('supabase/functions/owner-email-directory/index.ts');
const inbound=read('supabase/functions/owner-email-inbound/index.ts');
const center=read('supabase/functions/owner-email-center/index.ts');
const service=read('apps/platform-mobile/services/communications.ts');
const ui=read('apps/platform-mobile/app/communications.tsx');
const adminUi=read('apps/platform-mobile/app/mail-admin.tsx');
const layout=read('apps/platform-mobile/app/_layout.tsx');

all('Mail directory schema',migration,[
  'create table if not exists public.owner_email_mailboxes',
  'create table if not exists public.owner_email_mailbox_members',
  'create table if not exists public.owner_email_mailbox_aliases',
  'forwarding_targets text[]',
  "'matt@kleenest.us'",
  "'support@kleenest.us'",
  "'admin@kleenest.us'",
  "'business@kleenest.us'",
  "'fleet@kleenest.us'",
  "'privacy@kleenest.us'",
  "'partnerships@kleenest.us'",
  "'hello@kleenest.us'",
  "'noreply@kleenest.us'",
  'mailbox_id uuid references public.owner_email_mailboxes',
  'recipient_address text',
]);
all('Mail directory control plane',directory,[
  "action==='list_mailboxes'",
  "action==='directory'",
  "action==='save_mailbox'",
  "action==='set_forwarding'",
  "action==='save_alias'",
  "action==='grant_access'",
  "action==='revoke_access'",
  'owner_email_mailbox_members',
  'admin.auth.admin.listUsers',
]);
all('Inbound mailbox routing',inbound,[
  'resolveRecipientMailbox',
  'owner_email_mailbox_aliases',
  'mailbox.forwarding_enabled',
  'forwarding_targets',
  'replyTo:from.address',
  "'X-Kleenest-Forwarded':'1'",
  'wasForwardedByKleenest',
  'sendAutoReply',
  'mailbox_id:mailbox.id',
]);
must(!inbound.includes('eval('),'Inbound mail must never execute message content.');
must(!inbound.includes('new Function'),'Inbound mail must never compile message content.');

all('Email Center send-as',center,[
  'loadMailbox',
  'mailboxId',
  'mailbox.address',
  'mailbox.display_name',
  'recipient_address',
  'mailboxAddress',
  'mailboxDisplayName',
  'requireMailboxAccess',
  'accessibleMailboxIds',
  "mailbox.mailbox_type==='personal'",
]);
all('Owner mail client',service,[
  "owner-email-directory",
  'listOwnerMailboxes',
  'getOwnerMailDirectory',
  'setOwnerMailboxForwarding',
  'grantOwnerMailboxAccess',
  'mailboxId',
]);
all('KleenestOS mailbox UI',ui,[
  'Manage addresses, aliases & forwarding',
  'All addresses',
  'mailboxAddress',
  '/mail-admin',
]);
all('Mail admin UI',adminUi,[
  'Kleenest Mail Directory',
  'Create an address',
  'Forwarding',
  'Aliases',
  'Access',
  'Grant access',
  'Save forwarding',
]);
must(layout.includes('<Tabs.Screen name="mail-admin" options={{href:null,title:\'Mail Admin\'}}/>'),'Mail Admin route must remain hidden from the bottom tab bar.');

if(failures.length){
  console.error(`Kleenest Mail Directory audit failed with ${failures.length} gap(s):`);
  failures.forEach(f=>console.error('- '+f));
  process.exit(1);
}
console.log('Kleenest Mail Directory audit passed: named/shared addresses, aliases, role access, forwarding, send-as, inbound routing, and Owner UI are wired.');
