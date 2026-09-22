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

requireAll('Owner communications route',layout,[
  'name="communications"',
  "title:'Communications'",
  'href:null',
]);
requireAll('Owner communications discoverability',home,[
  "'/communications'",
  "'Communications & Email'",
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
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'openAuthSessionAsync',
  'exchangeCodeForSession',
  'provider_token',
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
  "action:'status'",
  "action:'list_threads'",
  "action:'get_thread'",
  "action:'reply'",
  "action:'archive'",
  "action:'set_read'",
]);
must(!service.includes('gmail.googleapis.com'),'Owner mobile client must not call Gmail directly; Gmail access stays behind the server gateway.');
must(!service.toLowerCase().includes('service_role'),'Owner mobile client must never contain a Supabase service role key.');

requireAll('Owner email gateway authorization',gateway,[
  "rpc('admin_authorization_v1')",
  'authorization',
  'authorized',
  "const GMAIL='https://gmail.googleapis.com/gmail/v1/users/me'",
  "'/profile'",
]);
requireAll('Owner email gateway capabilities',gateway,[
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
must(!gateway.includes('SUPABASE_SERVICE_ROLE_KEY'),'Owner email gateway must authorize with the caller context rather than embedding service-role authority.');
must(!gateway.includes('provider_refresh_token'),'The first release must not persist or transport a Google refresh token; reconnect is explicit when Google access expires.');

if(failures.length){console.error(`Owner communications audit failed with ${failures.length} gap(s):`);failures.forEach(f=>console.error(`- ${f}`));process.exit(1);}
console.log('Owner communications audit passed: Owner can connect Gmail, search/read threads, reply in-thread, archive, and manage read state through an owner-authorized server gateway.');
