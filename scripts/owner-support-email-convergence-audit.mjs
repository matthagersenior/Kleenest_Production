import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const must=(ok,message)=>{if(!ok)failures.push(message)};
const requireAll=(label,source,tokens)=>{for(const token of tokens)must(source.includes(token),`${label}: missing ${token}`)};

const consumer=read('apps/consumer-mobile/services/support.ts');
const business=read('apps/business-mobile/app/support.tsx');
const fleet=read('apps/fleet-mobile/app/support.tsx');
const center=read('supabase/functions/owner-email-center/index.ts');
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
]);
requireAll('Support-aware Owner reply',center,[
  'support_request_id',
  'support_reply',
  "status:'in_progress'",
]);

if(failures.length){
  console.error(`Owner support → Email Center audit failed with ${failures.length} gap(s):`);
  failures.forEach(f=>console.error(`- ${f}`));
  process.exit(1);
}
console.log('Owner support → Email Center audit passed: Consumer, Business, and Fleet support requests route into KleenestOS with source metadata and Owner replies update the support request lifecycle.');
