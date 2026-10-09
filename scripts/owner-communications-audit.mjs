import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const must=(ok,message)=>{if(!ok)failures.push(message)};
const requireFile=path=>{must(fs.existsSync(path),`missing Owner communications contract file: ${path}`);return read(path)};
const requireAll=(label,source,tokens)=>{for(const token of tokens)must(source.includes(token),`${label}: missing ${token}`)};

const screen=requireFile('apps/platform-mobile/app/communications.tsx');
const service=requireFile('apps/platform-mobile/services/communications.ts');
const layout=requireFile('apps/platform-mobile/app/_layout.tsx');
const home=requireFile('apps/platform-mobile/app/index.tsx');
const center=requireFile('supabase/functions/owner-email-center/index.ts');
const inbound=requireFile('supabase/functions/owner-email-inbound/index.ts');
const migration=requireFile('supabase/migrations/20261005013000_owner_email_center.sql');
const appSearch=requireFile('packages/mobile-core/src/appSearch.ts');

requireAll('Owner communications route',layout,['name="communications"', "title:'Email'"]);
must(!layout.includes('name="communications" options={{href:null'),'Owner communications route must stay visible in the Owner bottom navigation.');
requireAll('Owner communications discoverability',home,["'/communications'","'Kleenest Email Center'",'support@kleenest.us','href="/communications"','Open Email Inbox']);
requireAll('Owner Email Center search discoverability',appSearch,[
  "id:'communications-email'",
  "title:'Kleenest Email Center'",
  "route:'/communications'",
  "'email'",
  "'inbox'",
  "'reply'",
  "'support'",
  "'kleenest.us'",
]);
must(!appSearch.includes("keywords:['email','gmail'"),'Owner search should not present Gmail as the primary mail dependency.');

requireAll('Owner Email Center UI',screen,[
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
  'Kleenest labels',
]);
must(!screen.includes('Connect Gmail'),'Owner Email Center must not require Gmail OAuth.');
must(!screen.includes('signInWithOAuth'),'Owner Email Center must not contain a Google OAuth path.');
must(!screen.includes('gmail.modify'),'Owner Email Center must not request Gmail scopes.');

requireAll('Owner Email Center service boundary',service,[
  "invokeFunction<T>('owner-email-center'",
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
must(!service.includes('owner-email-gateway'),'Owner app must no longer route operational mail through the Gmail gateway.');
must(!service.toLowerCase().includes('gmail'),'Owner mail client must remain provider-neutral.');

requireAll('Email Center server authority',center,[
  "rpc('admin_authorization_v1')",
  "client.auth.getUser(jwt)",
  "from('owner_email_center_threads')",
  "from('owner_email_center_messages')",
  'https://api.resend.com',
  'In-Reply-To',
  'References',
  'support@kleenest.us',
]);
requireAll('Signed inbound email handling',inbound,[
  'resend.webhooks.verify',
  'resend.emails.receiving.get',
  "event.type!=='email.received'",
  "from('owner_email_center_messages')",
  "from('owner_email_center_threads')",
]);
requireAll('Service-owned mail persistence',migration,[
  'create table if not exists public.owner_email_center_settings',
  'create table if not exists public.owner_email_center_threads',
  'create table if not exists public.owner_email_center_messages',
  'enable row level security',
  'revoke all on table public.owner_email_center_threads from anon, authenticated',
  'owner_email_center_provider_config',
  'owner_email_webhook_secret',
]);

if(failures.length){
  console.error(`Owner communications audit failed with ${failures.length} gap(s):`);
  failures.forEach(f=>console.error(`- ${f}`));
  process.exit(1);
}
console.log('Owner communications audit passed: KleenestOS now owns first-party Resend-backed mail without a Gmail OAuth dependency.');
