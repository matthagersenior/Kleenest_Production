import fs from 'node:fs';
const failures=[];
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const migration='supabase/migrations/20260911102500_stateful_real_world_demo_loops.sql';

for(const file of [migration,'apps/business-mobile/app/demo.tsx','apps/fleet-mobile/app/demo.tsx','apps/business-mobile/services/onboarding.ts','apps/fleet-mobile/services/onboarding.ts']){
  if(!fs.existsSync(file))failures.push('missing '+file);
}

const sql=read(migration);
for(const token of [
  'real_world_demo_loop_sessions',
  'real_world_demo_loop_events',
  'real_world_demo_loop_state',
  'real_world_demo_loop_start',
  'real_world_demo_loop_advance',
  'real_world_demo_loop_reset',
  'completed_steps',
  'progress_pct',
  "'growth'",
  "'fleet'",
  "'enterprise'",
  "'trigger'",
  "'observe'",
  "'act'",
  "'verify'",
  "'measure'",
  "'complete'"
]) if(!sql.includes(token)) failures.push('migration missing '+token);

for(const file of ['apps/business-mobile/services/onboarding.ts','apps/fleet-mobile/services/onboarding.ts']){
  const src=read(file);
  for(const token of ['real_world_demo_loop_state','real_world_demo_loop_start','real_world_demo_loop_advance','real_world_demo_loop_reset']){
    if(!src.includes(token))failures.push(file+' missing '+token);
  }
}

for(const file of ['apps/business-mobile/app/demo.tsx','apps/fleet-mobile/app/demo.tsx']){
  const src=read(file);
  for(const token of ['Start demo','Complete step','Restart loop','completed_steps','progress_pct','CURRENT STEP','WHAT HAPPENS','WHY IT MATTERS','LIVE PROOF','Inspect real control']){
    if(!src.includes(token))failures.push(file+' missing '+token);
  }
  if(src.includes('Walk the customer story')||src.includes('Walk the operating flow'))failures.push(file+' still uses static walkthrough model');
}

if(failures.length){
  console.error('Stateful real-world demo loop audit failed:');
  for(const f of failures)console.error('- '+f);
  process.exit(1);
}
console.log('Stateful real-world demo loop audit passed.');
