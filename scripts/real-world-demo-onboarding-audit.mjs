import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const contract=JSON.parse(fs.readFileSync(path.join(root,'config/real-world-demo-onboarding-contract.json'),'utf8'));
const failures=[];
const files=[
  'apps/business-mobile/app/demo.tsx',
  'apps/business-mobile/app/onboarding.tsx',
  'apps/business-mobile/services/onboarding.ts',
  'apps/fleet-mobile/app/demo.tsx',
  'apps/fleet-mobile/app/onboarding.tsx',
  'apps/fleet-mobile/services/onboarding.ts',
  'supabase/migrations/20260911012000_real_world_demo_onboarding.sql'
];
for(const file of files) if(!fs.existsSync(path.join(root,file))) failures.push('missing '+file);

const read=file=>fs.existsSync(path.join(root,file))?fs.readFileSync(path.join(root,file),'utf8'):'';
const migration=read('supabase/migrations/20260911012000_real_world_demo_onboarding.sql');
for(const token of [
  'business_onboarding_catalog',
  'business_onboarding_preview',
  'business_onboarding_apply',
  'business_onboarding_state',
  'business_real_world_demo_snapshot',
  'fleet_real_world_demo_snapshot',
  'demo_growth_visit_campaign',
  'demo_fleet_route'
]) if(!migration.includes(token)) failures.push('migration missing '+token);

const businessDemo=read('apps/business-mobile/app/demo.tsx');
const fleetDemo=read('apps/fleet-mobile/app/demo.tsx');
const businessOnboarding=read('apps/business-mobile/app/onboarding.tsx');
for(const scenario of contract.demoScenarios){
  const target=scenario.id==='fleet'?fleetDemo:businessDemo;
  for(const surface of scenario.surfaces) if(!target.includes(surface)) failures.push(`${scenario.id} demo missing surface ${surface}`);
}
for(const token of ['business_onboarding_catalog','business_onboarding_preview','business_onboarding_apply']) if(!read('apps/business-mobile/services/onboarding.ts').includes(token)) failures.push('Business onboarding service missing '+token);
for(const token of ['business_onboarding_catalog','business_onboarding_preview','business_onboarding_apply']) if(!read('apps/fleet-mobile/services/onboarding.ts').includes(token)) failures.push('Fleet onboarding service missing '+token);
for(const type of contract.onboarding.businessTypes) if(!businessOnboarding.includes(type)) failures.push('Business onboarding UI missing type '+type);
for(const goal of contract.onboarding.goals) if(!businessOnboarding.includes(goal.id)) failures.push('Business onboarding UI missing goal '+goal.id);

const planRank={standard:0,growth:1,fleet:2,enterprise:3};
for(const c of contract.onboarding.cases){
  const goalPlans=c.goals.map(id=>contract.onboarding.goals.find(g=>g.id===id)?.minimumPlan||'standard');
  const recommended=goalPlans.sort((a,b)=>planRank[b]-planRank[a])[0]||'standard';
  if(recommended!==c.recommendedPlan) failures.push(`recommendation contract mismatch for ${c.businessType}: expected ${c.recommendedPlan}, got ${recommended}`);
}

if(failures.length){
  console.error('Real-world demo/onboarding gate failed:');
  for(const f of failures) console.error('- '+f);
  process.exit(1);
}
console.log(`Real-world demo/onboarding gate passed for ${contract.demoScenarios.length} demo flows and ${contract.onboarding.cases.length} onboarding recommendation cases.`);
