import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const must=(ok,message)=>{if(!ok)failures.push(message)};
const requireFile=path=>{must(fs.existsSync(path),`missing Email Center file: ${path}`);return read(path)};
const requireAll=(label,source,tokens)=>{for(const token of tokens)must(source.includes(token),`${label}: missing ${token}`)};

const screen=requireFile('apps/platform-mobile/app/communications.tsx');
const service=requireFile('apps/platform-mobile/services/communications.ts');
const center=requireFile('supabase/functions/owner-email-center/index.ts');
const inbound=requireFile('supabase/functions/owner-email-inbound/index.ts');
const migration=requireFile('supabase/migrations/20261005013000_owner_email_center.sql');

requireAll('Email Center UI',screen,[
  'Kleenest Email Center',
  'support@kleenest.us',
  'Needs reply',
  'Waiting',
  'Sent',
  'All mail',
  'Compose',
  'Reply',
  'Reply all',
  'Forward',
  'Archive',
  'Trash',
  'Unread',
]);
must(!screen.includes('Connect Gmail'),'Email Center must not require Gmail connection.');
must(!screen.includes('gmail.modify'),'Email Center must not request Gmail scopes.');
must(!screen.includes('signInWithOAuth'),'Email Center must not use Google OAuth.');

requireAll('Email Center mobile service',service,[
  "functions.invoke('owner-email-center'",
  "action:'status'",
  "action:'list_threads'",
  "action:'get_thread'",
  "action:'reply'",
  "action:'send'",
  "action:'forward'",
  "action:'archive'",
  "action:'set_read'",
  "action:'star'",
  "action:'trash'",
  "action:'set_inbox'",
  "action:'set_label'",
]);
must(!service.includes('owner-email-gateway'),'Owner mobile service must not route mail through the Gmail gateway.');
must(!service.toLowerCase().includes('gmail'),'Owner mobile service must be provider-neutral.');

requireAll('Email Center schema',migration,[
  'create table if not exists public.owner_email_center_settings',
  'create table if not exists public.owner_email_center_threads',
  'create table if not exists public.owner_email_center_messages',
  'create table if not exists public.owner_email_center_audit',
  'enable row level security',
  'revoke all on table public.owner_email_center_threads from anon, authenticated',
  'revoke all on table public.owner_email_center_messages from anon, authenticated',
  'owner_email_center_provider_config',
  'owner_email_center_status_snapshot',
  'owner_email_webhook_secret',
  'support@kleenest.us',
]);

requireAll('Authenticated Email Center gateway',center,[
  "rpc('admin_authorization_v1')",
  "client.auth.getUser(jwt)",
  "action==='status'",
  "action==='list_threads'",
  "action==='get_thread'",
  "action==='reply'",
  "action==='send'",
  "action==='forward'",
  "action==='archive'",
  "action==='set_read'",
  "action==='star'",
  "action==='trash'",
  "action==='set_inbox'",
  "action==='set_label'",
  'https://api.resend.com/emails',
  'In-Reply-To',
  'References',
  'support@kleenest.us',
]);
must(!center.toLowerCase().includes('gmail.googleapis.com'),'Email Center gateway must not call Gmail.');

requireAll('Inbound Resend webhook',inbound,[
  "npm:resend@6.9.2",
  'await req.text()',
  'resend.webhooks.verify',
  "event.type!=='email.received'",
  'resend.emails.receiving.get',
  'owner_email_center_messages',
  'owner_email_center_threads',
  'owner_email_center_provider_config',
]);
must(!inbound.includes('eval('),'Inbound email must never execute email content.');
must(!inbound.includes('new Function'),'Inbound email must never compile email content.');

if(failures.length){
  console.error(`Owner Email Center audit failed with ${failures.length} gap(s):`);
  failures.forEach(f=>console.error(`- ${f}`));
  process.exit(1);
}
console.log('Owner Email Center audit passed: KleenestOS owns persistent mail state, Resend handles transport, and inbound mail remains untrusted data.');
