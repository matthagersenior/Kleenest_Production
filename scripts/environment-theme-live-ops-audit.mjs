import fs from 'node:fs';

const failures=[];
const read=p=>fs.readFileSync(p,'utf8');
const theme=read('packages/mobile-core/src/visualThemes.ts');
const businessLive=read('apps/business-mobile/app/live-network.tsx');
const businessSvc=read('apps/business-mobile/services/liveNetwork.ts');
const businessLayout=read('apps/business-mobile/app/_layout.tsx');
const fleetLayout=read('apps/fleet-mobile/app/_layout.tsx');
const consumerLayout=read('apps/consumer-mobile/app/_layout.tsx');
const ownerLayout=read('apps/platform-mobile/app/_layout.tsx');
const prefs=read('apps/consumer-mobile/app/preferences.tsx');
const migrations=fs.readdirSync('supabase/migrations').sort().map(n=>read('supabase/migrations/'+n)).join('\n');

for(const surface of ['consumer','business','fleet','enterprise','owner','developer','public'])if(!theme.includes("'"+surface+"'"))failures.push('Missing theme surface '+surface);
for(const mode of ['default','light','dark','system'])if(!theme.includes("'"+mode+"'"))failures.push('Missing theme mode '+mode);
for(const token of ['canvas','surface','text','textMuted','border','brand','accent','success','warning','danger','mapPanel','chartGrid'])if(!theme.includes(token+':'))failures.push('Theme missing semantic token '+token);

for(const [label,source,surface] of [['Business',businessLayout,'business'],['Fleet',fleetLayout,'fleet'],['Consumer',consumerLayout,'consumer'],['Owner',ownerLayout,'owner']]){
  if(!source.includes('resolveKleenestTheme'))failures.push(label+' layout must resolve shared semantic theme');
  if(!source.includes("'"+surface+"'"))failures.push(label+' layout must use its environment theme group');
}
if(!prefs.includes('THEME')||!prefs.includes('setKleenestThemePreference'))failures.push('Consumer preferences must expose Default/Light/Dark/System theme selection.');

if(!/create or replace function public\.business_live_ops_command_center\(/i.test(migrations))failures.push('Live Ops requires canonical command-center RPC.');
for(const token of ['attention_queue','verification_queue','device_health','fleet_summary','service_summary','activity','priority_score'])if(!migrations.includes(token))failures.push('Live Ops RPC missing '+token);
if(!businessSvc.includes('getLiveOpsCommandCenter'))failures.push('Business service must load canonical Live Ops command center.');
for(const token of ['ATTENTION NOW','VERIFY THE FIX','DEVICE HEALTH','FLEET + SERVICE','LIVE ACTIVITY','WHAT CHANGED'])if(!businessLive.includes(token))failures.push('Business Live Ops UI missing '+token);
if(!businessLive.includes('managePreventiveWorkOrder')||!businessLive.includes('manageRemediation'))failures.push('Live Ops must support direct canonical work actions, not decorative alerts.');
if(!businessLive.includes("router.push('/devices')")||!businessLive.includes("router.push('/fleet')"))failures.push('Live Ops must hand off device/fleet issues to their operating workspaces.');

if(failures.length){
  console.error('Environment themes + Live Ops audit failed:');
  failures.forEach(f=>console.error('- '+f));
  process.exit(1);
}
console.log('Environment themes + Live Ops audit passed.');
