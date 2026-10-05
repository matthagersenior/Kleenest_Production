import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const must=(ok,message)=>{if(!ok)failures.push(message)};
const requireAll=(label,source,tokens)=>{for(const token of tokens)must(source.includes(token),`${label}: missing ${token}`)};

const consumer=read('apps/consumer-mobile/services/support.ts');
const business=read('apps/business-mobile/app/support.tsx');
const fleet=read('apps/fleet-mobile/app/support.tsx');
const center=read('supabase/functions/owner-email-center/index.ts');
const inbound=read('supabase/functions/owner-email-inbound/index.ts');
const ui=read('apps/platform-mobile/app/communications.tsx');
const service=read('apps/platform-mobile/services/communications.ts');
const consumerUi=read('apps/consumer-mobile/app/support.tsx');
const businessUi=read('apps/business-mobile/app/support.tsx');
const fleetUi=read('apps/fleet-mobile/app/support.tsx');
const migrations=fs.readdirSync('supabase/migrations').filter(v=>v.endsWith('.sql')).map(v=>read(`supabase/migrations/${v}`)).join('\n');

requireAll('Consumer support source',consumer,["p_source_app:'consumer'"]);
requireAll('Business support source',business,["p_category:'technical'","p_source_app:'business'"]);
requireAll('Fleet support source',fleet,["p_category:'technical'","p_source_app:'fleet'"]);
requireAll('Support Email Center schema',migrations,[
  'source_app text',
  'support_request_id uuid',
  'route_support_request_to_owner_email_center',
  'support_receive',
  "p_source_app text default 'consumer'",
  'Kleenest Support replied',
  'after update of status, admin_notes',
  "'has_reply',v_reply_changed",
]);
requireAll('Support-aware Owner reply',center,[
  'support_request_id',
  'support_reply',
  "status:'in_progress'",
  "action==='save_draft'",
  "action==='block_sender'",
  "'spam'",
  "delivery_status:'delivered_in_app'",
]);
requireAll('Blocked sender inbound handling',inbound,[
  'blocked_senders',
  "isBlocked?'spam':'inbox'",
  "receive_spam",
]);
requireAll('KleenestOS Email Center UI',ui,[
  "drafts:{label:'Drafts'",
  "spam:{label:'Spam'",
  'Save draft',
  'Block sender',
  'APP SUPPORT',
  'deliveryStatus',
  'sourceApp.toUpperCase()',
]);
requireAll('KleenestOS Email Center service',service,[
  "action:'save_draft'",
  "action:'spam'",
  "action:'block_sender'",
  "mailbox?:'inbox'|'sent'|'drafts'|'spam'|'all'",
]);
requireAll('Consumer support reply visibility',consumerUi,['row.admin_notes','Kleenest Support']);
requireAll('Business support reply visibility',businessUi,['admin_notes','Recent requests','Kleenest Support','Support request submitted to KleenestOS.']);
requireAll('Fleet support reply visibility',fleetUi,['admin_notes','Recent requests','Kleenest Support','Support request submitted to KleenestOS.']);

if(failures.length){
  console.error(`Owner support → Email Center audit failed with ${failures.length} gap(s):`);
  failures.forEach(f=>console.error(`- ${f}`));
  process.exit(1);
}
console.log('Owner support → Email Center audit passed: Consumer, Business, and Fleet support requests route into KleenestOS with source metadata and Owner replies update the support request lifecycle.');
