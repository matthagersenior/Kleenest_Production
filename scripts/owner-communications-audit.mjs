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
const gateway=requireFile('supabase/functions/owner-email-gateway/index.ts');
const appSearch=requireFile('packages/mobile-core/src/appSearch.ts');
const oauthRelay=requireFile('apps/consumer-mobile/services/operatorOAuthRelay.ts');
const gmailPersistence=requireFile('supabase/migrations/20260923180713_owner_gmail_persistence.sql');

requireAll('Owner communications route',layout,[
  'name="communications"',
  "title:'Email'",
]);
must(!layout.includes('name="communications" options={{href:null'),'Owner communications route must stay visible in the Owner bottom navigation.');
requireAll('Owner communications discoverability',home,[
  "'/communications'",
  "'Communications & Email'",
  'href="/communications"',
  'Open Email Inbox',
]);
requireAll('Owner communications search discoverability',appSearch,[
  "id:'communications-email'",
  "route:'/communications'",
  "'email'",
  "'gmail'",
  "'inbox'",
  "'reply'",
  "'outreach'",
]);
requireAll('Owner Gmail connection UI',screen,[
  'Connect Gmail',
  'signInWithOAuth',
  "provider: 'google'",
  'https://www.googleapis.com/auth/gmail.modify',
  'openAuthSessionAsync',
  "Linking.createURL('communications'",
  'exchangeCodeForSession',
  'provider_token',
  'provider_refresh_token',
  'connectOwnerMail',
  "parsed.searchParams.set('scopes',gmailScopes)",
  "include_granted_scopes:'true'",
  "prompt:'consent select_account'",
  'insufficient authentication scopes',
  "productionOAuthRelay='https://matthagersenior.github.io/Kleenest_Production/'",
  'kleenest_oauth_start=owner-gmail',
  'encodeURIComponent(scopedAuthorizeUrl)',
  'openAuthSessionAsync(relayStart,nativeAppOAuthReturn)',
]);
requireAll('Owner Gmail native callback relay',oauthRelay,[
  "OWNER_GMAIL_OAUTH_RETURN_KEY='kleenest.native.owner.gmail.oauth.return'",
  "search.get('kleenest_oauth_start')!=='owner-gmail'",
  "destination.origin!==KLEENEST_SUPABASE_ORIGIN",
  "destination.pathname!=='/auth/v1/authorize'",
  "'kleenest-owner://communications'",
  'OPERATOR_OAUTH_MAX_AGE_MS',
]);
requireAll('Owner email workflow UI',screen,[
  'Search mail',
  'Unread',
  'Refresh',
  'Reply',
  'Archive',
  'Mark unread',
  'listOwnerMailThreads',
  'getOwnerMailThread',
  'replyOwnerMailThread',
  'archiveOwnerMailThread',
  'setOwnerMailThreadRead',
]);
requireAll('Owner email client boundary',service,[
  "functions.invoke('owner-email-gateway'",
  "action:'connect'",
  'providerRefreshToken',
  "action:'status'",
  "action:'list_threads'",
  "action:'get_thread'",
  "action:'reply'",
  "action:'archive'",
  "action:'set_read'",
]);
must(!service.includes('gmail.googleapis.com'),'Owner mobile client must not call Gmail directly; Gmail access stays behind the server gateway.');
must(!service.toLowerCase().includes('service_role'),'Owner mobile client must never contain a Supabase service role key.');
must(!service.includes("action:'list_threads',\n    providerToken"),'Routine Owner Gmail calls must use the persisted server connection instead of transporting provider tokens.');

requireAll('Owner email gateway authorization',gateway,[
  "rpc('admin_authorization_v1')",
  'authorization',
  'authorized',
  'SUPABASE_SECRET_KEYS',
  "from('owner_gmail_connections')",
  "const GMAIL='https://gmail.googleapis.com/gmail/v1/users/me'",
  "'/profile'",
]);
requireAll('Owner email gateway capabilities',gateway,[
  "action==='connect'",
  'provider_refresh_token',
  "GOOGLE_TOKEN='https://oauth2.googleapis.com/token'",
  "grant_type:'refresh_token'",
  'refreshGoogleAccessToken',
  'list_threads',
  'get_thread',
  'reply',
  'archive',
  'set_read',
  '/threads?',
  "'/messages/send'",
  'In-Reply-To',
  'References',
  'threadId',
  'removeLabelIds',
]);
requireAll('Owner Gmail persistence migration',gmailPersistence,[
  'create table if not exists public.owner_gmail_connections',
  'provider_refresh_token text not null',
  'google_client_id text not null',
  'enable row level security',
  'revoke all on table public.owner_gmail_connections from anon, authenticated',
  'grant select, insert, update, delete on table public.owner_gmail_connections to service_role',
]);

if(failures.length){console.error(`Owner communications audit failed with ${failures.length} gap(s):`);failures.forEach(f=>console.error(`- ${f}`));process.exit(1);}
console.log('Owner communications audit passed: Gmail OAuth persists a service-only refresh credential, restores the Owner session, refreshes Gmail access server-side, and keeps inbox actions behind Owner authorization.');
