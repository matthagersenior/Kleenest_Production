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
  'supabase/migrations/20260911012000_real_world_demo_onboarding.sql',
  'supabase/migrations/20260911014000_real_world_demo_route_refinement.sql',
  'supabase/migrations/20260911102500_stateful_real_world_demo_loops.sql'
];
for(const file of files) if(!fs.existsSync(path.join(root,file))) failures.push('missing '+file);

const read=file=>fs.existsSync(path.join(root,file))?fs.readFileSync(path.join(root,file),'utf8'):'';
const migration=read('supabase/migrations/20260911012000_real_world_demo_onboarding.sql');
const routeRefinement=read('supabase/migrations/20260911014000_real_world_demo_route_refinement.sql');
const loopMigration=read('supabase/migrations/20260911102500_stateful_real_world_demo_loops.sql');
for(const token of ['demo_fleet_route_refinement','America’s Center Convention Complex','Central West End Transit Center','Barnes-Jewish Center for Outpatient Health','12th & Park Recreation Center','Blueprint Coffee']) if(!routeRefinement.includes(token)) failures.push('Fleet demo route refinement missing '+token);

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
  for(const surface of scenario.surfaces){
    if(!target.includes(surface)&&!loopMigration.includes(surface)) failures.push(`${scenario.id} demo missing surface ${surface}`);
  }
}
for(const token of ['Start demo','Complete step','Restart loop']) {
  if(!businessDemo.includes(token)) failures.push('Business demo missing stateful control '+token);
  if(!fleetDemo.includes(token)) failures.push('Fleet demo missing stateful control '+token);
}
for(const token of ['real_world_demo_loop_state','real_world_demo_loop_start','real_world_demo_loop_advance','real_world_demo_loop_reset']) {
  if(!loopMigration.includes(token)) failures.push('Stateful demo authority missing '+token);
}
for(const token of ['business_onboarding_catalog','business_onboarding_preview','business_onboarding_apply']) if(!read('apps/business-mobile/services/onboarding.ts').includes(token)) failures.push('Business onboarding service missing '+token);
for(const token of ['business_onboarding_catalog','business_onboarding_preview','business_onboarding_apply']) if(!read('apps/fleet-mobile/services/onboarding.ts').includes(token)) failures.push('Fleet onboarding service missing '+token);
for(const type of contract.onboarding.businessTypes) if(!businessOnboarding.includes(type)) failures.push('Business onboarding UI missing type '+type);
for(const goal of contract.onboarding.goals) if(!businessOnboarding.includes(goal.id)) failures.push('Business onboarding UI missing goal '+goal.id);

const businessLayout=read('apps/business-mobile/app/_layout.tsx');
const businessHome=read('apps/business-mobile/app/index.tsx');
const fleetLayout=read('apps/fleet-mobile/app/_layout.tsx');
const fleetHome=read('apps/fleet-mobile/app/index.tsx');
const fleetControl=read('apps/fleet-mobile/services/control.ts');
const fleetWorkspaces=read('apps/fleet-mobile/app/workspaces.tsx');
for(const token of ['name="onboarding"','name="demo"']) if(!businessLayout.includes(token)) failures.push('Business navigation missing '+token);
for(const token of ['/onboarding','/demo']) if(!businessHome.includes(token)) failures.push('Business home missing '+token);
for(const token of ['name="onboarding"','name="demo"']) if(!fleetLayout.includes(token)) failures.push('Fleet navigation missing '+token);
for(const token of ['/onboarding','/demo']) if(!fleetHome.includes(token)) failures.push('Fleet home missing '+token);
if(!fleetControl.includes("p_include_demo:true")) failures.push('Fleet managed demo workspaces are not discoverable');
if(!fleetControl.includes("is_demo_test?-100000")) failures.push('Fleet demo workspaces are not strongly de-prioritized for automatic selection');
if(!fleetWorkspaces.includes("DEMO")) failures.push('Fleet workspace selector does not visibly label demo workspaces');

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
